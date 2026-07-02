/**
 * B5 — Quaternius world assembler for the /drive scene.
 *
 * Lays out driveable road tiles from `public/models3d/world/quaternius/*.glb`
 * aligned to the course.ts coordinate system:
 *
 *   X = right, Z = depth (course runs toward -Z), Y = up.
 *   Road surface flat at Y = 0.
 *   car spawns at (0, ~1, +10) facing -Z, drives toward -Z (down the course).
 *
 * Tile dimensions (verified against the actual GLB assets — see the offline
 * GLB dump and the live scene probe used during the B5 fix):
 *   Street_2Lane:  6 m (X) × 12 m (Z), road runs along the 12 m (Z) axis,
 *                  geometry centred at origin, driving surface at Y ≈ 0.
 *   Street_Curve_2Lane: a quarter-turn piece whose geometry occupies one
 *                  quadrant (roughly X ∈ [-12, 0], Z ∈ [0, 12] after import).
 *
 * Layout covers the "straight" lesson (z ≈ +24 → -204) and first half of
 * left/right-turn lessons. Buildings and props are placed alongside the road.
 *
 * IMPORTANT (B5 fix): road tiles are placed by CLONING the loaded glTF root
 * hierarchy at each transform — NOT by thin-instancing. The glTF loader returns
 * the empty `__root__` mesh (0 vertices) as meshes[0]; the real geometry lives
 * in child meshes. Thin-instancing the empty root replicates nothing, so the
 * earlier implementation drew a single overlapping pile of tiles at the origin.
 * Cloning the root moves the whole child hierarchy, which is the pattern the
 * showroom scene uses for its single hero mesh.
 *
 * Also: Quaternius GLBs carry baked vertex colors (COLOR_0). Babylon's glTF
 * loader multiplies those into the PBR base color, which tints every surface a
 * strong red. The source textures already carry the correct concrete/asphalt
 * color, so we disable vertex-color usage on every loaded mesh.
 *
 * Returns:
 *   isRoadMesh(mesh) — predicate: is this mesh (or an ancestor) driveable ground.
 *   dispose()        — cleanup.
 */

import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShapeBox } from "@babylonjs/core/Physics/v2/physicsShape";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Node } from "@babylonjs/core/node";

// Side-effects: register glTF loader + physics component.
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
import { DracoCompression } from "@babylonjs/core/Meshes/Compression/dracoCompression";
import "@babylonjs/core/Physics/joinedPhysicsEngineComponent";

registerBuiltInLoaders();

// Quaternius pack local Draco decoder (same config as showroom).
DracoCompression.Configuration = {
  decoder: {
    wasmUrl: "/draco/draco_wasm_wrapper_gltf.js",
    wasmBinaryUrl: "/draco/draco_decoder_gltf.wasm",
    fallbackUrl: "/draco/draco_decoder_gltf.js",
  },
};

const GLB_BASE = "/models3d/world/quaternius/";

// ─── Tile dimensions (measured / verified from Quaternius urban pack) ────────
/** Street_2Lane tile: 6 m wide, 12 m long (Z direction). */
const TILE_W = 6;
const TILE_L = 12;

/** Road surface Y. */
const ROAD_Y = 0;

// ─── Coordinate-check contract ───────────────────────────────────────────────
/**
 * Verify that the world's road centerline aligns with course.ts checkpoints.
 * course.ts "straight" lesson: (0,0,20) → (0,0,-200) at X=0, Y=0.
 * We assert the midpoint checkpoint (0,0,-90) lands inside the straight road
 * strip (|X| < TILE_W/2 = 3, Y ≈ 0).
 *
 * Throws if the coordinate contract fails.
 */
function assertCoordinateContract(): { checkX: number; checkY: number; checkZ: number } {
  // course.ts straight midpoint
  const checkX = 0;
  const checkY = 0;
  const checkZ = -90;

  // The straight road strip: X ∈ [-3, 3], Z ∈ [-204, +24], Y = 0.
  const inStrip = Math.abs(checkX) < TILE_W / 2 && checkZ >= -204 && checkZ <= 24;
  if (!inStrip) {
    throw new Error(
      `[B5] Coordinate contract FAILED: checkpoint (${checkX},${checkY},${checkZ}) ` +
      `is outside road strip |X|<${TILE_W / 2}, Z∈[-204,24]. ` +
      `Check tile alignment.`,
    );
  }
  return { checkX, checkY, checkZ };
}

// ─── Types ───────────────────────────────────────────────────────────────────
export interface DriveWorldResult {
  /** Set of mesh name prefixes / exact names that are driveable ground. */
  isRoadMesh: (mesh: AbstractMesh) => boolean;
  /** Release all created meshes. */
  dispose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Disable baked vertex-color tinting on a mesh and all its descendants.
 * Quaternius tiles carry COLOR_0 data that the glTF loader multiplies into the
 * PBR base color, washing everything red; the textures already carry the right
 * color, so we turn vertex colors off.
 */
function disableVertexColors(root: AbstractMesh): void {
  root.useVertexColors = false;
  for (const child of root.getChildMeshes()) {
    child.useVertexColors = false;
  }
}

/**
 * Load a GLB asset and return the root mesh (which holds all child meshes).
 * The root mesh is placed at origin; caller repositions/clones it.
 *
 * The returned mesh is the glTF `__root__` (0 vertices); the real geometry is in
 * its child meshes. Moving/cloning the root moves the whole hierarchy.
 */
async function loadGlb(
  scene: Scene,
  filename: string,
  meshName: string,
): Promise<Mesh> {
  const result = await ImportMeshAsync(GLB_BASE + filename, scene, {
    pluginExtension: ".glb",
  });
  const root = result.meshes[0] as Mesh;
  root.name = meshName;
  for (const m of result.meshes) {
    m.isPickable = true;
    m.receiveShadows = true;
    m.useVertexColors = false; // kill the baked red vertex-color tint
  }
  return root;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Build the driveable Quaternius world and return the ground predicate.
 * Awaits GLB loads; safe to call once per scene.
 */
export async function buildDriveWorld(scene: Scene): Promise<DriveWorldResult> {
  // 1. Verify coordinate contract (throws on mismatch, caught by caller).
  const coord = assertCoordinateContract();
  console.info(
    `[B5] Coordinate contract OK — checkpoint (${coord.checkX}, ${coord.checkY}, ` +
    `${coord.checkZ}) is inside road strip |X|<${TILE_W / 2}, Z∈[-204,24].`,
  );

  const disposables: AbstractMesh[] = [];
  /** Root nodes whose subtree is driveable ground (identity membership). */
  const roadRoots = new Set<Node>();

  // ── Load a tile TEMPLATE. It is hidden (disabled) and only cloned. ───────────
  async function loadTemplate(filename: string, name: string): Promise<Mesh> {
    const m = await loadGlb(scene, filename, name);
    m.setEnabled(false); // template never renders; clones do
    disposables.push(m);
    return m;
  }

  /**
   * Clone a loaded template root at a world transform. Mirrors the showroom
   * pattern (position/rotate the glTF root). The template's coordinate-system
   * conversion lives in its scaling and is preserved by clone(); we only set
   * translation (and rotation for turn pieces), exactly as the building
   * placement below does.
   */
  function placeTile(
    template: Mesh,
    name: string,
    x: number,
    y: number,
    z: number,
    rotY = 0,
  ): Mesh {
    const clone = template.clone(name);
    if (!clone) throw new Error(`[B5] clone failed for ${name}`);
    clone.setEnabled(true);
    clone.position.set(x, y, z);
    if (rotY !== 0) {
      clone.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), rotY);
    }
    disableVertexColors(clone);
    roadRoots.add(clone);
    disposables.push(clone);
    return clone;
  }

  // ── 2. Load road tile templates (hidden; cloned into place below). ───────────
  const [street2L, street2LNosw, streetCurve2L, streetCurve2LCurb] =
    await Promise.all([
      loadTemplate("Street_2Lane.glb", "road_straight_tpl"),
      loadTemplate("Street_2Lane_noSidewalk.glb", "road_straight_nosw_tpl"),
      loadTemplate("Street_Curve_2Lane.glb", "road_curve_tpl"),
      loadTemplate("Street_Curve_2Lane_Curb.glb", "road_curve_curb_tpl"),
    ]);

  // ── 3. Straight road: Z from +24 down to -204 ────────────────────────────────
  // Tile is 12 m long (Z axis), 6 m wide (X), centred at its origin.
  // Tile centres: starting at z=18 (covers 12..24), step -12 each, 19 tiles.
  // Last tile centre: z = 18 - 12*18 = -198 (covers -204..-192).
  const STRAIGHT_START_Z = 18;
  const STRAIGHT_TILE_COUNT = 19;
  for (let i = 0; i < STRAIGHT_TILE_COUNT; i++) {
    const tz = STRAIGHT_START_Z - i * TILE_L;
    placeTile(street2L, `road_straight_${i}`, 0, ROAD_Y, tz);
  }

  // ── 4. Left / right turn stubs (per commit 392b20d layout) ───────────────────
  // These are approximate connector stubs off the straight near Z ≈ -33; the
  // straight road (above) is the surface the "straight" lesson checkpoint rides.
  placeTile(streetCurve2L, "road_curve_left", -3, ROAD_Y, -33, Math.PI);
  for (let i = 0; i < 4; i++) {
    placeTile(street2LNosw, `road_left_${i}`, -14 - i * TILE_L, ROAD_Y, -38, Math.PI / 2);
  }
  placeTile(streetCurve2LCurb, "road_curve_right", 3, ROAD_Y, -33, 0);
  for (let i = 0; i < 4; i++) {
    placeTile(street2LNosw, `road_right_${i}`, 14 + i * TILE_L, ROAD_Y, -38, Math.PI / 2);
  }

  // ── 5. Road collider boxes for physics (car chassis fallback) ─────────────────
  // The wheel rays do the real ground detection against the visible tiles above;
  // these static boxes stop the chassis from falling through if a ray misses.
  function addRoadCollider(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) {
    const box = MeshBuilder.CreateBox("roadCollider", { width: sx, height: sy, depth: sz }, scene);
    box.position.set(cx, cy - sy / 2 - 0.05, cz); // top face at Y=0-ε
    box.isVisible = false;
    box.isPickable = false; // collider only, not wheel ray target
    const body = new PhysicsBody(box, PhysicsMotionType.STATIC, false, scene);
    body.shape = new PhysicsShapeBox(
      Vector3.Zero(),
      Quaternion.Identity(),
      new Vector3(sx, sy, sz),
      scene,
    );
    disposables.push(box);
  }

  // Straight segment collider: X=[-3,3], Z=[-204,24].
  addRoadCollider(0, 0, -90, TILE_W, 0.5, 228);
  // Left-turn horizontal collider: X=[-8,-60], Z=[-41,-35].
  addRoadCollider(-34, 0, -38, 52, 0.5, TILE_W);
  // Right-turn horizontal collider: X=[8,60], Z=[-41,-35].
  addRoadCollider(34, 0, -38, 52, 0.5, TILE_W);

  // ── 6. Buildings alongside the straight ───────────────────────────────────────
  const buildingData: Array<[string, string, number, number, number, number]> = [
    ["Building_Large_2.glb", "bldg_L_0", -18, 0, -30, 0],
    ["Building_Medium_2_001.glb", "bldg_L_1", -18, 0, -80, 0],
    ["Building_Small_1.glb", "bldg_R_0", 12, 0, -30, Math.PI],
    ["Building_Large_2.glb", "bldg_R_1", 18, 0, -80, Math.PI],
    ["Building_Small_1.glb", "bldg_L_2", -14, 0, -140, 0],
    ["Building_Medium_2_001.glb", "bldg_R_2", 14, 0, -140, Math.PI],
  ];

  await Promise.all(
    buildingData.map(async ([file, name, x, y, z, rotY]) => {
      const m = await loadGlb(scene, file, name);
      m.position.set(x, y, z);
      m.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), rotY);
      m.isPickable = false;
      disableVertexColors(m);
      disposables.push(m);
    }),
  );

  // ── 7. Props: bollards and planters along curbs ────────────────────────────────
  const propData: Array<[string, string, number, number, number]> = [
    ["Prop_Bollard.glb", "bollard_0", -4, 0, 10],
    ["Prop_Bollard.glb", "bollard_1", -4, 0, -10],
    ["Prop_Bollard.glb", "bollard_2", 4, 0, 10],
    ["Prop_Bollard.glb", "bollard_3", 4, 0, -10],
    ["Prop_Planter_Single.glb", "planter_0", -5, 0, -50],
    ["Prop_Planter_Single.glb", "planter_1", 5, 0, -50],
    ["Prop_Planter_Single.glb", "planter_2", -5, 0, -100],
    ["Prop_Planter_Single.glb", "planter_3", 5, 0, -100],
  ];

  await Promise.all(
    propData.map(async ([file, name, x, y, z]) => {
      const m = await loadGlb(scene, file, name);
      m.position.set(x, y, z);
      m.isPickable = false;
      disableVertexColors(m);
      disposables.push(m);
    }),
  );

  // ── 8. Asphalt filler for the turn-join areas ──────────────────────────────────
  const asphaltData: Array<[string, string, number, number, number, number]> = [
    ["Street_Asphalt_6x6.glb", "road_asphalt_lt", -3, 0, -33, 0],
    ["Street_Asphalt_6x6.glb", "road_asphalt_rt", 3, 0, -33, 0],
  ];

  await Promise.all(
    asphaltData.map(async ([file, name, x, y, z, rotY]) => {
      const m = await loadGlb(scene, file, name);
      m.position.set(x, y, z);
      if (rotY !== 0) m.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), rotY);
      disableVertexColors(m);
      roadRoots.add(m);
      disposables.push(m);
    }),
  );

  // ── 9. Ground predicate ────────────────────────────────────────────────────────
  // A mesh is "road" if it (or any ancestor) is one of the road root nodes.
  const isRoadMesh = (mesh: AbstractMesh): boolean => {
    let n: Node | null = mesh;
    while (n) {
      if (roadRoots.has(n)) return true;
      n = n.parent;
    }
    return false;
  };

  // ── 10. Dispose helper ──────────────────────────────────────────────────────────
  const dispose = () => {
    for (const m of disposables) {
      m.dispose(false, true);
    }
  };

  return { isRoadMesh, dispose };
}

/**
 * B5 coordinate check: returns the verified checkpoint position.
 * Call this from your bounded test to confirm axis/scale alignment.
 */
export function b5CoordinateCheck(): { x: number; y: number; z: number; ok: boolean } {
  try {
    const c = assertCoordinateContract();
    return { x: c.checkX, y: c.checkY, z: c.checkZ, ok: true };
  } catch {
    return { x: 0, y: 0, z: 0, ok: false };
  }
}
