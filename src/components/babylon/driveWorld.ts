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
 * IMPORTANT (B5 fix, round 2): repeated road tiles are placed with REAL GPU
 * instancing. The glTF loader returns the empty `__root__` mesh (0 vertices) as
 * meshes[0]; the geometry lives in child primitives, each with an identity
 * transform relative to the root (verified against the assets). For each
 * placement we clone ONLY the 0-vertex root to reproduce its transform (RH→LH
 * conversion + placement translation/rotation), then hang a hardware
 * `createInstance()` of every geometry primitive off it. All tiles that share a
 * source primitive collapse into a single draw call, instead of the earlier
 * approach that cloned the whole geometry hierarchy per tile (~150 draw calls).
 * Unique one-off pieces (buildings, props, asphalt fillers) still just move the
 * loaded root — instancing buys nothing for a single copy.
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
// Side-effect: registers createInstance/InstancedMesh support (tree-shaken build).
import "@babylonjs/core/Meshes/instancedMesh";
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

// Pure layout math + coordinate contract (no Babylon deps; unit-tested).
import {
  TILE_W,
  TILE_L,
  ROAD_Y,
  STRAIGHT_START_Z,
  STRAIGHT_TILE_COUNT,
  checkCoordinateContract,
} from "../../lib/driveLayout";

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

// Tile dimensions (TILE_W/TILE_L), ROAD_Y, the straight-layout constants and the
// coordinate contract now live in ../../lib/driveLayout so they are shared with
// the placement loop below AND unit-testable without Babylon.

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
  //    Derived from the SAME constants that place the tiles below.
  const coord = checkCoordinateContract();
  if (!coord.ok) {
    throw new Error(`[B5] Coordinate contract FAILED: ${coord.reason}`);
  }
  console.info(
    `[B5] Coordinate contract OK — checkpoint (${coord.checkpoint.x}, ` +
    `${coord.checkpoint.y}, ${coord.checkpoint.z}) is inside road strip ` +
    `X∈[${coord.strip.xMin},${coord.strip.xMax}], Z∈[${coord.strip.zMin},${coord.strip.zMax}].`,
  );

  const disposables: AbstractMesh[] = [];
  /** Root nodes whose subtree is driveable ground (identity membership). */
  const roadRoots = new Set<Node>();

  // ── Load a tile TEMPLATE. It stays in the scene (enabled) so its geometry can
  //    be instanced, but the original geometry is hidden + non-pickable so it
  //    neither draws nor catches wheel rays at the origin. ──────────────────────
  async function loadTemplate(filename: string, name: string): Promise<Mesh> {
    const m = await loadGlb(scene, filename, name);
    m.isVisible = false;
    m.isPickable = false;
    for (const child of m.getChildMeshes(false)) {
      child.isVisible = false;
      child.isPickable = false;
    }
    disposables.push(m);
    return m;
  }

  /** The geometry-bearing primitives of a template (skips the 0-vertex root and
   *  any empty intermediate TransformNode). */
  function templateGeometry(template: Mesh): Mesh[] {
    return template
      .getChildMeshes(false)
      .filter((m): m is Mesh => m.getTotalVertices() > 0);
  }

  /**
   * Place ONE repeated road tile using real GPU instancing.
   *
   * Clone only the 0-vertex glTF root to reproduce its transform (the RH→LH
   * conversion — scaling (1,1,-1) + 180° Y — lives here and is preserved by
   * clone()); then set translation and, for turn pieces, the Y rotation, exactly
   * as the old clone path did. Each geometry primitive is added as a hardware
   * `createInstance()` parented to that root. The primitives have identity
   * transforms relative to the root, so an identity-local instance lands exactly
   * where a full clone would — but every tile sharing a source primitive now
   * batches into a single draw call.
   */
  function placeTile(
    template: Mesh,
    name: string,
    x: number,
    y: number,
    z: number,
    rotY = 0,
  ): Mesh {
    const tileRoot = template.clone(name, null, true); // root only, no children
    if (!tileRoot) throw new Error(`[B5] clone failed for ${name}`);
    tileRoot.setEnabled(true);
    tileRoot.isVisible = false; // 0-vertex node, nothing to draw
    tileRoot.isPickable = false;
    tileRoot.position.set(x, y, z);
    if (rotY !== 0) {
      tileRoot.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), rotY);
    }
    templateGeometry(template).forEach((gm, k) => {
      const inst = gm.createInstance(`${name}_p${k}`);
      inst.parent = tileRoot;
      inst.isPickable = true; // wheel-raycast ground target
      // Vertex-color tinting is disabled on the source mesh; instances inherit it.
    });
    roadRoots.add(tileRoot);
    disposables.push(tileRoot);
    return tileRoot;
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
  // STRAIGHT_START_Z / STRAIGHT_TILE_COUNT come from ../../lib/driveLayout so the
  // coordinate contract is derived from these exact values.
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

  // ── 5. Road collider boxes: physics ground AND the wheel-ray surface ─────────
  // B7c fix (drift root cause): the visible Quaternius tiles have a subtly
  // crowned/cambered asphalt profile, and using them as the wheel-ray ground
  // tilted the chassis (~1 cm right-low across the track), whose roll-yaw
  // coupling produced a constant ~0.02 rad/s yaw drift at neutral steering —
  // enough to leave the road on a 160 m straight. The wheel rays now target
  // these FLAT invisible collider boxes instead (isPickable = true + rayGrounds
  // membership); the crowned tiles are visuals only. This also removes the
  // tile-seam/junction holes that bumped the car at the turn joins.
  const rayGrounds = new Set<AbstractMesh>();
  function addRoadCollider(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) {
    const box = MeshBuilder.CreateBox("roadCollider", { width: sx, height: sy, depth: sz }, scene);
    box.position.set(cx, cy - sy / 2 - 0.05, cz); // top face at Y=0-ε
    box.isVisible = false;
    box.isPickable = true; // wheel-ray ground (flat, seamless)
    rayGrounds.add(box);
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
  // Turn-join corner fillers: cover the curve/asphalt sweep between the straight
  // strip (|X|<=3) and the turn strips (|X|>=8) so wheel rays never fall into a
  // junction hole mid-turn. X=[3,9] / [-9,-3], Z=[-41,-30].
  addRoadCollider(6, 0, -35.5, 6, 0.5, 11);
  addRoadCollider(-6, 0, -35.5, 6, 0.5, 11);

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
  // B7c: driveable ground for the wheel rays is the FLAT collider boxes only —
  // NOT the visible tiles (see the drift-fix note at section 5). `roadRoots`
  // still tracks the visual tile roots for layout/dispose purposes.
  const isRoadMesh = (mesh: AbstractMesh): boolean => rayGrounds.has(mesh);

  // ── 10. Dispose helper ──────────────────────────────────────────────────────────
  // Dispose in REVERSE push order: tile roots (and the instances hanging off
  // them) were pushed after their source templates, so reversing disposes the
  // instances before the geometry they instance. (Babylon's dispose is
  // idempotent, so forward order was harmless — this is just the tidy order.)
  const dispose = () => {
    for (let i = disposables.length - 1; i >= 0; i--) {
      disposables[i].dispose(false, true);
    }
  };

  return { isRoadMesh, dispose };
}

/**
 * B5 coordinate check: returns the verified checkpoint position + pass flag.
 * Thin wrapper over the pure, unit-tested `checkCoordinateContract` in
 * ../../lib/driveLayout (see tests/driveLayout.test.ts).
 */
export function b5CoordinateCheck(): { x: number; y: number; z: number; ok: boolean } {
  const c = checkCoordinateContract();
  return { x: c.checkpoint.x, y: c.checkpoint.y, z: c.checkpoint.z, ok: c.ok };
}
