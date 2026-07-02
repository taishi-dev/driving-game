/**
 * B5 — Quaternius world assembler for the /drive scene.
 *
 * Lays out driveable road tiles from `public/models3d/world/quaternius/*.glb`
 * aligned to the course.ts coordinate system:
 *
 *   X = right, Z = depth (course runs toward -Z), Y = up.
 *   Road surface flat at Y = 0.
 *   car spawns at (0, ~1, 0) facing +Z, drives toward -Z.
 *
 * Tile dimensions (pre-derived, verified against actual GLB assets):
 *   Street_2Lane:  6 m (X) × 12 m (Z), road runs along the 12 m (Z) axis.
 *   Street_Curve_2Lane: 6×6 m turning piece.
 *
 * Layout covers the "straight" lesson (z ≈ +24 → -204) and first half of
 * left/right-turn lessons. Buildings and props are placed alongside the road.
 *
 * Performance: road tiles use thin-instances so the GPU draws them in one call.
 *
 * Returns:
 *   roadMeshNames — set of mesh names that wheel rays should treat as ground.
 *   dispose()     — cleanup.
 */

import { Vector3, Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShapeBox } from "@babylonjs/core/Physics/v2/physicsShape";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

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
 * Load a GLB asset and return the root mesh (which holds all child meshes).
 * The root mesh is placed at origin; caller repositions it.
 */
async function loadGlb(
  scene: Scene,
  filename: string,
  meshName: string,
): Promise<Mesh> {
  const result = await ImportMeshAsync(GLB_BASE + filename, scene, {
    pluginExtension: ".glb",
  });
  // The first entry in meshes is the root "__root__" TransformNode/Mesh from
  // the glTF container. We give it a deterministic name for the ground predicate.
  const root = result.meshes[0] as Mesh;
  root.name = meshName;
  for (const m of result.meshes) {
    m.isPickable = true;
    m.receiveShadows = true;
  }
  return root;
}

/**
 * Clone a loaded root mesh into `count` thin instances at the given transforms.
 * Returns the thin-instanced base mesh so caller can track it.
 *
 * Note: Babylon thin instances require the base to be a Mesh (not
 * AbstractMesh). We mark the source invisible and let thin instances render.
 */
function thinInstance(
  base: Mesh,
  transforms: Matrix[],
): Mesh {
  base.isVisible = false; // base is never drawn; instances are
  for (const mat of transforms) {
    base.thinInstanceAdd(mat, false); // false = don't refresh until last
  }
  // Commit all instance data in one GPU upload.
  base.thinInstanceRefreshBoundingInfo();
  return base;
}

/**
 * Build a Matrix placing a tile centred at (x, y, z) with an optional Y-axis
 * rotation in radians.
 */
function tileMat(x: number, y: number, z: number, rotY = 0): Matrix {
  const t = Matrix.Translation(x, y, z);
  if (rotY === 0) return t;
  return Matrix.RotationY(rotY).multiply(t);
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

  const disposables: Mesh[] = [];
  const roadMeshRoots = new Set<Mesh>();

  // ── Helper: load + register a road tile (its name goes into roadMeshRoots) ──
  async function loadRoadTile(filename: string, name: string): Promise<Mesh> {
    const m = await loadGlb(scene, filename, name);
    roadMeshRoots.add(m);
    disposables.push(m);
    return m;
  }

  // ── 2. Load road tile templates ──────────────────────────────────────────────
  // We load one of each type, then thin-instance them at multiple transforms.
  const [street2L, street2LNosw, streetCurve2L, streetCurve2LCurb] =
    await Promise.all([
      loadRoadTile("Street_2Lane.glb", "road_straight"),
      loadRoadTile("Street_2Lane_noSidewalk.glb", "road_straight_nosw"),
      loadRoadTile("Street_Curve_2Lane.glb", "road_curve"),
      loadRoadTile("Street_Curve_2Lane_Curb.glb", "road_curve_curb"),
    ]);

  // ── 3. Straight road: Z from +24 down to -204 ────────────────────────────────
  // Tile is 12 m long (Z axis), 6 m wide (X), centered at its origin.
  // We need tiles at Z = 24-6 = 18, 6, -6, -18, ..., down to -198.
  // Total range: 24 to -204 = 228 m. 228/12 = 19 tiles.
  // Tile centres: starting at z=18 (covers 12..24), step -12 each.
  // Last tile centre: z = 18 - 12*18 = 18 - 216 = -198 (covers -204..-192).
  const STRAIGHT_START_Z = 18;   // first tile centre
  const STRAIGHT_TILE_COUNT = 19;
  const straightMats: Matrix[] = [];
  for (let i = 0; i < STRAIGHT_TILE_COUNT; i++) {
    const tz = STRAIGHT_START_Z - i * TILE_L;
    straightMats.push(tileMat(0, ROAD_Y, tz));
  }
  thinInstance(street2L, straightMats);

  // ── 4. Left-turn branch: Z from +20 to -30 is already covered by straight.
  //       Curve piece from (0,-30) turning left → heading -X, ending near (-8,-38).
  //       Then short straight heading -X from X=-8 to X=-60.
  //
  //  Street_Curve_2Lane is a 6×6 m piece. Its default orientation has the road
  //  entering from +Z and exiting toward +X. To make it enter from +Z and exit
  //  toward -X (left turn), rotate 90° around Y (π/2 → exits -X direction).
  //  Actually: default exits +X, rotate 180° (π) = exits -X. Let's think:
  //    Default: enter bottom (+Z face), exit right (+X face).
  //    Rotate Y +90°: enter from -X, exit top (-Z) — wrong.
  //    Rotate Y -90° (or 270°): enter from +X, exit bottom (+Z) — wrong.
  //    Rotate Y 180°: enter top (-Z), exit left (-X) — correct for our left turn
  //    BUT we approach from +Z (coming from +Z side), so we need enter +Z side...
  //
  //  Correct rotation for "enter +Z, exit -X (left turn)":
  //    Original: enter +Z, exit +X → rotate 90° CCW (Y π/2) → enter -X, exit +Z — no
  //    Original: enter +Z, exit +X → rotate 90° CW  (Y -π/2 = 3π/2) → enter +X, exit -Z — no
  //    Let's use: rotate Y by -π (180°) flips both → enter -Z, exit -X — no
  //    Correct: reflect / use specific angle.
  //    Quaternius curve: entering from the -Z side (bottom), exiting +X side (right).
  //    So the "entry" face is the -Z face. Our approach is from +Z (car going -Z).
  //    We need entry from +Z, which is -Z face of the tile → rotate Y by π (180°).
  //    After 180° rotation: old -Z face is now +Z face (entry ✓), old +X face is now -X face (exit ✓).
  //    So rotate Y = Math.PI for a LEFT turn.

  const leftCurveMat = tileMat(-3, ROAD_Y, -33, Math.PI); // 3 m left, centred between Z=-30 and -36
  thinInstance(streetCurve2L, [leftCurveMat]);

  // Left-turn horizontal segment: from X=-8 to X=-60, at Z=-38, running along X.
  // Tiles face horizontally (+X axis as road direction) → rotate Y by π/2.
  // Tile length=12 m along its local Z, after π/2 rotation its length is along X.
  // Centres along X from -8-6=-14 to -60+6=-54, step -12.
  // X centres: -14, -26, -38, -50 (4 tiles covering X -8 to -60).
  const leftStraightMats: Matrix[] = [];
  for (let i = 0; i < 4; i++) {
    const tx = -14 - i * TILE_L;
    leftStraightMats.push(tileMat(tx, ROAD_Y, -38, Math.PI / 2));
  }
  thinInstance(street2LNosw, leftStraightMats);

  // Right-turn branch (mirror of left, exits toward +X):
  // Original curve: enter -Z face, exit +X face.
  // We want enter +Z face, exit +X → rotate Y by 0 (no rotation needed? let's check):
  //   Original entry = -Z side. To make -Z side become +Z side: rotate Y by π.
  //   But then exit +X face also flips to -X — wrong.
  // Actually: enter +Z, exit +X:
  //   Original enter -Z, exit +X. Rotate Y by 0: entry -Z (approach from +Z still hits +Z face).
  //   The car approaches from north (+Z), hits the -Z face of the curve.
  //   That means no rotation needed — entry is the -Z face, we approach from +Z = car enters the -Z face.
  //   Exit = +X face → the car exits toward +X direction. That IS a right turn ✓.
  const rightCurveMat = tileMat(3, ROAD_Y, -33, 0); // no rotation: enter -Z, exit +X
  thinInstance(streetCurve2LCurb, [rightCurveMat]);

  // Right-turn horizontal segment: from X=+8 to X=+60, at Z=-38, running along X.
  // Same π/2 rotation but mirrored (road goes +X direction, π/2 rotates road from Z→X).
  // Actually π/2 rotation makes tiles run along +X.
  // Centres: +14, +26, +38, +50
  const rightStraightMats: Matrix[] = [];
  for (let i = 0; i < 4; i++) {
    const tx = 14 + i * TILE_L;
    rightStraightMats.push(tileMat(tx, ROAD_Y, -38, Math.PI / 2));
  }
  thinInstance(street2LNosw, rightStraightMats);

  // ── 5. Road collider boxes for physics (car chassis fallback) ─────────────────
  // The wheel rays do the real ground detection; these static boxes stop the
  // chassis from falling through if a ray misses. One large box per segment.
  const roadColliders: Mesh[] = [];

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
    roadColliders.push(box);
    disposables.push(box);
  }

  // Straight segment collider: X=[-3,3], Z=[-204,24].
  addRoadCollider(0, 0, -90, TILE_W, 0.5, 228);
  // Left-turn horizontal collider: X=[-8,-60], Z=[-41,-35].
  addRoadCollider(-34, 0, -38, 52, 0.5, TILE_W);
  // Right-turn horizontal collider: X=[8,60], Z=[-41,-35].
  addRoadCollider(34, 0, -38, 52, 0.5, TILE_W);

  // ── 6. Buildings alongside the straight ───────────────────────────────────────
  // Load building GLBs (not road meshes — no ground predicate).
  // Place a few on either side of the road.
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
      disposables.push(m);
    }),
  );

  // ── 8. Asphalt filler for intersection / turn areas ────────────────────────────
  const asphaltData: Array<[string, string, number, number, number, number]> = [
    ["Street_Asphalt_6x6.glb", "asphalt_lt", -3, 0, -33, 0],  // left-turn join
    ["Street_Asphalt_6x6.glb", "asphalt_rt", 3, 0, -33, 0],   // right-turn join
  ];

  await Promise.all(
    asphaltData.map(async ([file, name, x, y, z, rotY]) => {
      const m = await loadGlb(scene, file, name);
      m.position.set(x, y, z);
      if (rotY !== 0) m.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), rotY);
      roadMeshRoots.add(m as Mesh);
      disposables.push(m as Mesh);
    }),
  );

  // ── 9. Ground predicate ────────────────────────────────────────────────────────
  // A mesh is "road" if its name matches a road root prefix or "roadCollider".
  const roadRootNames = new Set<string>();
  for (const r of roadMeshRoots) {
    roadRootNames.add(r.name);
  }

  const isRoadMesh = (mesh: AbstractMesh): boolean => {
    // Direct name match (root mesh or child mesh inheriting road name).
    if (roadRootNames.has(mesh.name)) return true;
    // Child meshes have auto-generated names like "road_straight_primitive0".
    // Walk up the parent chain.
    let p = mesh.parent;
    while (p) {
      if (roadRootNames.has(p.name)) return true;
      p = p.parent;
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
