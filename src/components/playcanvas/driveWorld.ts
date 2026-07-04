import {
  Application,
  Asset,
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
  ROAD_Y,
  STRAIGHT_START_Z,
  STRAIGHT_TILE_COUNT,
  TILE_L,
  TURN_Z,
  checkCoordinateContract,
  isOnRoad,
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
  //    ONLY entities in the world with a collision component.
  for (const b of roadColliders()) {
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

    // Buildings alongside the straight (one-offs).
    const buildings: Array<[string, Placement]> = [
      ["Building_Large_2.glb", { x: -18, y: 0, z: -30, rotY: 0 }],
      ["Building_Medium_2_001.glb", { x: -18, y: 0, z: -80, rotY: 0 }],
      ["Building_Small_1.glb", { x: 12, y: 0, z: -30, rotY: Math.PI }],
      ["Building_Large_2.glb", { x: 18, y: 0, z: -80, rotY: Math.PI }],
      ["Building_Small_1.glb", { x: -14, y: 0, z: -140, rotY: 0 }],
      ["Building_Medium_2_001.glb", { x: 14, y: 0, z: -140, rotY: Math.PI }],
    ];
    for (const [file, p] of buildings) loadGlb(file, (r) => placeOne(r, p));

    // Props: bollards + planters along the curbs (one-offs).
    const props: Array<[string, Placement]> = [
      ["Prop_Bollard.glb", { x: -4, y: 0, z: 10, rotY: 0 }],
      ["Prop_Bollard.glb", { x: -4, y: 0, z: -10, rotY: 0 }],
      ["Prop_Bollard.glb", { x: 4, y: 0, z: 10, rotY: 0 }],
      ["Prop_Bollard.glb", { x: 4, y: 0, z: -10, rotY: 0 }],
      ["Prop_Planter_Single.glb", { x: -5, y: 0, z: -50, rotY: 0 }],
      ["Prop_Planter_Single.glb", { x: 5, y: 0, z: -50, rotY: 0 }],
      ["Prop_Planter_Single.glb", { x: -5, y: 0, z: -100, rotY: 0 }],
      ["Prop_Planter_Single.glb", { x: 5, y: 0, z: -100, rotY: 0 }],
    ];
    for (const [file, p] of props) loadGlb(file, (r) => placeOne(r, p));
  });

  return {
    isOffTrack: (x, z) => !isOnRoad(x, z),
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
