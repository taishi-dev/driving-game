import {
  Application,
  Asset,
  Color,
  ContainerResource,
  Entity,
  Mat4,
  Quat,
  RenderComponent,
  StandardMaterial,
  Vec3,
  VertexBuffer,
  VertexFormat,
  BUFFER_STATIC,
  type MeshInstance,
} from "playcanvas";
import { ensureDraco } from "./heroCar";
import {
  CORRIDOR_WIDTH,
  ROAD_Y,
  STRAIGHT_START_Z,
  STRAIGHT_TILE_COUNT,
  TILE_L,
  TURN_Z,
  boundaryWalls,
  checkCoordinateContract,
  isOnRoad,
  lessonBuildings,
  lessonCorridorColliders,
  lessonProps,
  lessonWorldPatches,
  roadColliders,
} from "@/lib/pcDriveLayout";

/**
 * P5 — Quaternius drivable world for the /drive scene.
 *
 * Lays out the road (straight strip Z +24..−204 + left/right turn stubs),
 * buildings, and props from `public/models3d/world/quaternius/*.glb`, aligned to
 * the coordinate contract (X=right, −Z=forward, Y=0 surface). All placement
 * comes from `pcDriveLayout.ts`, so the contract test guards the real layout.
 *
 * Two E1 lessons are baked in:
 *  1. WHEEL-RAY / PHYSICS GROUND = FLAT collider boxes, never the crowned visual
 *     tiles. Only the invisible `roadColliders()` boxes get a collision +
 *     rigidbody component; the Quaternius tiles are visuals with NO physics, so
 *     Bullet's wheel rays hit a seamless flat plane (E1's camber-drift cause).
 *  2. REPEATED tiles use HARDWARE INSTANCING (PlayCanvas `meshInstance.setInstancing`
 *     with a per-instance world-matrix vertex buffer): the 27 repeated road tiles
 *     collapse to one draw call PER UNIQUE MESH rather than per tile. One-off
 *     pieces (curves, buildings, props) are plain instantiated clones — instancing
 *     buys nothing for a single copy.
 *
 * Unlike E1 (Babylon, left-handed) NO handedness flip is needed: both glTF and
 * PlayCanvas are right-handed, so tiles import already aligned to the contract.
 *
 * Coordinate/off-track math lives in the Babylon-free, unit-tested
 * `pcDriveLayout.ts`; `isOffTrack` here is a thin adapter over `isOnRoad`.
 */

const GLB_BASE = "/models3d/world/quaternius/";

export interface DriveWorldHandle {
  /** Off-track predicate for the chassis XZ (true = off the driveable road). */
  isOffTrack: (x: number, z: number) => boolean;
  dispose: () => void;
}

interface Placement {
  x: number;
  y: number;
  z: number;
  rotY: number; // radians
}

/**
 * Fix up the Quaternius GLB materials so they light correctly under the drive
 * scene's sun + IBL. Two independent glTF-import problems are corrected in one
 * de-duped pass (materials are shared across instances, so a `Set` avoids
 * repeating the work):
 *
 *  1. VERTEX-COLOUR TINT. Quaternius GLBs carry COLOR_0 data that PlayCanvas'
 *     importer multiplies into the diffuse (via `diffuseVertexColor`), washing
 *     the road/sidewalk a strong red — the exact E1 tint bug. The source
 *     textures already carry the right concrete/asphalt colour, so we turn
 *     every vertex-colour usage off.
 *
 *  2. BOGUS FULL METALNESS (this round's black-world root cause). The kit's
 *     glTF exports almost every surface — asphalt, concrete, brick, trim — with
 *     `metallicFactor = 1` and `roughnessFactor = 0`, so PlayCanvas imports them
 *     as perfect mirror-metals (`metalness = 1`, `gloss = 1`). A metal has NO
 *     diffuse albedo: it renders as the environment reflection tinted by its
 *     base colour. Bright-textured surfaces (brick/concrete) then mirror the
 *     bright sky and merely LOOK lit, while the dark asphalt texture mirrors
 *     almost nothing and renders pitch black — reading as a void the road
 *     floats in. None of these surfaces are actually metal, so we force them
 *     dielectric (`metalness = 0`, so the diffuse map becomes real albedo lit by
 *     the sun + diffuse IBL) and knock the mirror gloss down to a matte concrete
 *     sheen. Materials already authored dielectric (glass, road decals) keep
 *     their tuned gloss.
 */
function fixQuaterniusMaterial(entity: Entity, touched: Set<StandardMaterial>): void {
  const renders = entity.findComponents("render") as RenderComponent[];
  for (const r of renders) {
    for (const mi of r.meshInstances) {
      const mat = mi.material as StandardMaterial;
      if (!mat || touched.has(mat)) continue;
      touched.add(mat);
      mat.diffuseVertexColor = false;
      mat.specularVertexColor = false;
      mat.emissiveVertexColor = false;
      mat.metalnessVertexColor = false;
      mat.glossVertexColor = false;
      mat.aoVertexColor = false;
      // De-metalise: the base colour becomes true diffuse albedo again.
      if (mat.metalness > 0) {
        mat.metalness = 0;
        mat.metalnessMap = null; // scalar 0 already wins, but drop the map too
        if (mat.gloss > 0.6) mat.gloss = 0.45; // matte concrete/asphalt sheen
      }
      mat.update();
    }
  }
}

/** Build a world matrix for a tile placement (translation + Y rotation). */
function placementMatrix(p: Placement): Mat4 {
  const m = new Mat4();
  const q = new Quat();
  q.setFromEulerAngles(0, (p.rotY * 180) / Math.PI, 0);
  m.setTRS(new Vec3(p.x, p.y, p.z), q, Vec3.ONE);
  return m;
}

/**
 * Build the Quaternius world. Loads GLBs asynchronously (deferred one rAF for
 * strict-mode safety, like heroCar.ts); the returned handle's off-track
 * predicate + dispose are valid immediately.
 */
export function buildDriveWorld(
  app: Application,
  isDisposed: () => boolean,
  /**
   * Current lesson: corridor lessons (s-curve / crank) get their paved corridor
   * + extra flat colliders; crosswalk / railroad / traffic-light get their
   * checkpoint dressing. Undefined = base world only (the /drive test route).
   */
  lesson?: string,
): DriveWorldHandle {
  // 0. Quaternius GLBs are Draco-compressed; configure the local decoder (the
  //    /drive route doesn't load the hero car, so nothing else has yet). This
  //    is idempotent (guarded).
  ensureDraco();

  // 1. Coordinate contract — derived from the same constants that place tiles.
  const coord = checkCoordinateContract();
  if (!coord.ok) {
    throw new Error(`[P5] Coordinate contract FAILED: ${coord.reason}`);
  }
  console.info(
    `[P5] Coordinate contract OK — checkpoint (${coord.checkpoint.x},` +
      `${coord.checkpoint.y},${coord.checkpoint.z}) on road strip ` +
      `X∈[${coord.strip.xMin},${coord.strip.xMax}] Z∈[${coord.strip.zMin},${coord.strip.zMax}].`,
  );

  const device = app.graphicsDevice;
  const disposables: Array<{ destroy: () => void }> = [];
  const instancingBuffers: VertexBuffer[] = [];
  const assets: Asset[] = [];
  const touchedMaterials = new Set<StandardMaterial>();
  let rafId = 0;

  // 2. FLAT road colliders (physics ground + wheel-ray surface). Invisible; the
  //    ONLY entities in the world with a collision component. Corridor lessons
  //    add their corridor's flat boxes to the same list.
  for (const b of [...roadColliders(), ...lessonCorridorColliders(lesson)]) {
    const box = new Entity(b.name);
    box.addComponent("collision", {
      type: "box",
      halfExtents: new Vec3(b.sx / 2, b.sy / 2, b.sz / 2),
    });
    box.addComponent("rigidbody", { type: "static", friction: 1.0, restitution: 0 });
    box.setPosition(b.cx, b.cy, b.cz);
    app.root.addChild(box);
    disposables.push(box);
  }

  // 2b. BOUNDARY WALLS (track perimeter colliders). Invisible; prevent the car
  //     from driving off the road edge into the void.
  for (const b of boundaryWalls(lesson)) {
    const box = new Entity(b.name);
    box.addComponent("collision", {
      type: "box",
      halfExtents: new Vec3(b.sx / 2, b.sy / 2, b.sz / 2),
    });
    box.addComponent("rigidbody", { type: "static", friction: 0.2, restitution: 0 });
    box.setPosition(b.cx, b.cy, b.cz);
    app.root.addChild(box);
    disposables.push(box);
  }

  // ── Instanced placement of a repeated tile GLB ──────────────────────────────
  // Instantiate ONE render entity as the template, keep it enabled at the
  // origin, and for each of its mesh instances attach a per-instance world-matrix
  // vertex buffer covering every placement. With instancing active the engine
  // draws `count` copies at the instance matrices (the template's own node
  // transform is overridden), so the mesh's local-to-tile offset is folded into
  // each instance matrix.
  function placeInstanced(resource: ContainerResource, placements: Placement[]): void {
    const template = resource.instantiateRenderEntity();
    app.root.addChild(template);
    app.root.syncHierarchy(); // resolve mesh-instance world transforms
    fixQuaterniusMaterial(template, touchedMaterials);
    disposables.push(template);

    const renders = template.findComponents("render") as RenderComponent[];
    const meshInstances: MeshInstance[] = [];
    for (const r of renders) meshInstances.push(...r.meshInstances);

    const placementMats = placements.map(placementMatrix);

    for (const mi of meshInstances) {
      // Mesh local-to-template matrix (template is at the origin, identity).
      const localMat = mi.node.getWorldTransform().clone();
      const data = new Float32Array(placements.length * 16);
      const world = new Mat4();
      for (let i = 0; i < placementMats.length; i++) {
        world.mul2(placementMats[i], localMat);
        data.set(world.data, i * 16);
      }
      const vb = new VertexBuffer(
        device,
        VertexFormat.getDefaultInstancingFormat(device),
        placements.length,
        { usage: BUFFER_STATIC, data: data.buffer },
      );
      mi.setInstancing(vb); // instancingCount auto-set to placements.length
      instancingBuffers.push(vb);
    }
  }

  // ── One-off placement (curves, buildings, props): plain instantiated clone ──
  function placeOne(resource: ContainerResource, p: Placement): void {
    const ent = resource.instantiateRenderEntity();
    const q = new Quat();
    q.setFromEulerAngles(0, (p.rotY * 180) / Math.PI, 0);
    ent.setPosition(p.x, p.y, p.z);
    ent.setRotation(q);
    app.root.addChild(ent);
    fixQuaterniusMaterial(ent, touchedMaterials);
    disposables.push(ent);
  }

  // Load a container GLB and hand its resource to `use` (strict-mode guarded).
  function loadGlb(file: string, use: (r: ContainerResource) => void): void {
    const asset = new Asset(file, "container", { url: GLB_BASE + file });
    asset.on("load", () => {
      if (isDisposed()) return;
      use(asset.resource as ContainerResource);
    });
    // Surface load/parse failures — without this a failed GLB (e.g. a wedged
    // decode pipeline) leaves the world silently empty.
    asset.on("error", (err: unknown) => {
      console.error(`[driveWorld] GLB load failed: ${file}`, err);
    });
    assets.push(asset);
    app.assets.add(asset);
    app.assets.load(asset);
  }

  // 3. Build all the visual geometry, deferred one rAF (strict-mode: the
  //    throwaway first Application is destroyed before rAF fires, so its dead
  //    device never starts parsing these GLBs — same guard as heroCar.ts).
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    if (isDisposed()) return;

    // Straight road: 19 Street_2Lane tiles down −Z (instanced).
    const straight: Placement[] = [];
    for (let i = 0; i < STRAIGHT_TILE_COUNT; i++) {
      straight.push({ x: 0, y: ROAD_Y, z: STRAIGHT_START_Z - i * TILE_L, rotY: 0 });
    }
    loadGlb("Street_2Lane.glb", (r) => placeInstanced(r, straight));

    // Left + right turn arms: Street_2Lane_noSidewalk, rotated 90° (instanced).
    const arms: Placement[] = [];
    for (let i = 0; i < 4; i++) {
      arms.push({ x: -14 - i * TILE_L, y: ROAD_Y, z: TURN_Z, rotY: Math.PI / 2 });
      arms.push({ x: 14 + i * TILE_L, y: ROAD_Y, z: TURN_Z, rotY: Math.PI / 2 });
    }
    loadGlb("Street_2Lane_noSidewalk.glb", (r) => placeInstanced(r, arms));

    // Turn corners + asphalt fillers (one-offs).
    loadGlb("Street_Curve_2Lane.glb", (r) => placeOne(r, { x: -3, y: ROAD_Y, z: -33, rotY: Math.PI }));
    loadGlb("Street_Curve_2Lane_Curb.glb", (r) => placeOne(r, { x: 3, y: ROAD_Y, z: -33, rotY: 0 }));
    loadGlb("Street_Asphalt_6x6.glb", (r) => {
      placeOne(r, { x: -3, y: ROAD_Y, z: -33, rotY: 0 });
    });

    // Buildings + curbside props (one-offs). Placement data lives in the pure
    // layer, filtered so nothing stands in the active lesson's corridor.
    for (const b of lessonBuildings(lesson)) {
      loadGlb(b.file, (r) => placeOne(r, { x: b.x, y: 0, z: b.z, rotY: b.rotY }));
    }
    for (const p of lessonProps(lesson)) {
      loadGlb(p.file, (r) => placeOne(r, { x: p.x, y: 0, z: p.z, rotY: p.rotY }));
    }

    // ── Lesson build-out (pure placement data from pcDriveLayout) ────────────
    const patches = lessonWorldPatches(lesson);

    // Corridor paving: Street_Asphalt_9x9 per corridor point, oriented along
    // the path (instanced — one draw call for the whole corridor). Alternate a
    // few-mm Y offset so overlapping coplanar patches never Z-fight.
    //
    // MESH QUIRK (verified with gltf-transform inspect): this tile's pivot is
    // at a CORNER (bbox −9..0 on X and Z) and its surface plane lies at
    // y = −0.15 relative to the pivot. Compensate: shift by the rotated
    // (+4.5, +4.5) local half-size so the tile is CENTRED on the patch point,
    // and lift by +0.155 so the surface lands just above ROAD_Y (and above the
    // terrain at −0.02) instead of 15 cm underground.
    const asphalt = patches.filter((p) => p.kind === "asphalt");
    if (asphalt.length > 0) {
      const placements: Placement[] = asphalt.map((p, i) => {
        const yaw = (p.yawDeg * Math.PI) / 180;
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        return {
          x: p.cx + 4.5 * cos + 4.5 * sin,
          y: ROAD_Y + 0.155 + (i % 2) * 0.004,
          z: p.cz - 4.5 * sin + 4.5 * cos,
          rotY: yaw,
        };
      });
      loadGlb("Street_Asphalt_9x9.glb", (r) => placeInstanced(r, placements));
    }

    // Crosswalk stripes. MESH QUIRK (gltf-transform inspect): the decal is
    // centred in X/Z but its surface plane lies at y = −0.148 (same −0.15
    // convention as the asphalt tile), and its LONG axis (11.4 m) runs along
    // Z — rotate 90° so the band spans ACROSS our −Z road, and lift it so the
    // stripes sit just above the road surface instead of underground.
    for (const p of patches.filter((q) => q.kind === "crosswalk")) {
      loadGlb("Decal_Crosswalk_Wide.glb", (r) =>
        placeOne(r, {
          x: p.cx,
          y: ROAD_Y + 0.168,
          z: p.cz,
          rotY: ((p.yawDeg + 90) * Math.PI) / 180,
        }),
      );
    }

    // Railroad dressing (primitives — the kit has no rail pieces): rails as
    // flat dark strips across the road, crossbuck X-signs at the curbs.
    const railPatches = patches.filter((q) => q.kind === "rail");
    const buckPatches = patches.filter((q) => q.kind === "crossbuck");
    if (railPatches.length === 0 && buckPatches.length === 0) return;
    const railMat = new StandardMaterial();
    railMat.useMetalness = true;
    railMat.diffuse = new Color(0.25, 0.24, 0.23);
    railMat.metalness = 0.8;
    railMat.gloss = 0.6;
    railMat.update();
    disposables.push(railMat);
    const buckMat = new StandardMaterial();
    buckMat.diffuse = new Color(0.92, 0.92, 0.9);
    buckMat.update();
    disposables.push(buckMat);
    const postMat = new StandardMaterial();
    postMat.useMetalness = true;
    postMat.diffuse = new Color(0.35, 0.37, 0.38);
    postMat.metalness = 0.6;
    postMat.gloss = 0.5;
    postMat.update();
    disposables.push(postMat);

    for (const p of railPatches) {
      const rail = new Entity("rr-rail");
      rail.addComponent("render", { type: "box" });
      rail.render!.material = railMat;
      rail.setLocalScale(CORRIDOR_WIDTH + 3, 0.06, 0.3);
      rail.setPosition(p.cx, ROAD_Y + 0.03, p.cz);
      app.root.addChild(rail);
      disposables.push(rail);
    }
    for (const p of buckPatches) {
      const buck = new Entity("rr-crossbuck");
      const post = new Entity("rr-post");
      post.addComponent("render", { type: "cylinder" });
      post.render!.material = postMat;
      post.setLocalScale(0.15, 3.2, 0.15);
      post.setLocalPosition(0, 1.6, 0);
      buck.addChild(post);
      for (const angle of [45, -45]) {
        const slat = new Entity("rr-slat");
        slat.addComponent("render", { type: "box" });
        slat.render!.material = buckMat;
        slat.setLocalScale(1.5, 0.22, 0.08);
        slat.setLocalEulerAngles(0, 0, angle);
        slat.setLocalPosition(0, 3.0, 0);
        buck.addChild(slat);
      }
      buck.setPosition(p.cx, ROAD_Y, p.cz);
      app.root.addChild(buck);
      disposables.push(buck);
    }
  });

  return {
    isOffTrack: (x, z) => !isOnRoad(x, z, 0, lesson),
    dispose() {
      if (rafId) cancelAnimationFrame(rafId);
      for (let i = disposables.length - 1; i >= 0; i--) disposables[i].destroy();
      for (const vb of instancingBuffers) vb.destroy();
      for (const a of assets) {
        a.unload();
        app.assets.remove(a);
      }
    },
  };
}
