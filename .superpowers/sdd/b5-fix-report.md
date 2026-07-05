# B5 fix report — /drive world renders broken on real GPU

Branch: `E1-babylon/feature/full-port`. Method: superpowers systematic-debugging
(offline GLB structure dump + live-scene instrumentation to find root cause
BEFORE any code change; verified with a headed real-GPU screenshot + a scripted
drive + the unit gates).

## Root cause per symptom

### Symptom 1 — floating tiles / gaps / no continuous road (and the "camera below road" look)
Two independent causes:

1. **Thin-instancing an empty node.** `loadGlb` returned `result.meshes[0]`, which
   is the glTF `__root__` mesh — it has **0 vertices**; the real tile geometry
   lives in its child meshes (`Street_2Lane_primitive0/1/2` under a `Street_2Lane`
   TransformNode). `thinInstance()` added all layout matrices to that empty root
   (live probe confirmed `thinInstanceCount = 0`, `verts = 0`), so **nothing** was
   replicated. `base.isVisible = false` on the root does not hide children, so the
   real geometry rendered as a **single copy at the origin** for each tile type —
   an overlapping pile, not a road. (Buildings/props looked placed because they
   used `root.position.set()`, which moves the whole child hierarchy.)

2. **Camera framing the wrong way.** The chassis spawned with identity rotation
   facing **+Z**, but the course/road runs toward **−Z** (course.ts "straight" is
   (0,0,20)→(0,0,−200); the checkpoint is (0,0,−90)). With the follow camera
   `rotationOffset = 180`, the camera sat on the −Z side looking +Z — i.e. toward
   the short +Z road end (only ~14 m) with open sky beyond. Combined with cause 1
   (no laid-out road) this produced the "sky fills the frame / car hangs in
   mid-air" look. The car also drives via local +Z forward, so throttle drove it
   toward the short end, against the course.

### Symptom 2 — strong red-to-grey gradient on all surfaces
The Quaternius GLBs carry baked **vertex colors** (`COLOR_0`, confirmed in the GLB
dump). Babylon's glTF loader multiplies vertex color into the PBR base color, and
these tiles' vertex colors are a heavy warm/red tint. A live A/B test
(`mesh.useVertexColors = false` on all meshes, screenshot before/after) showed the
red gradient **disappear completely**, leaving the correct textured grey concrete /
dark asphalt. The base-color textures were bound correctly all along; the vertex
colors were the tint source.

### Symptom 3 — deterministic "Scene has been disposed" console error
React strict-mode double-mount: the first mount's async world build (GLB loads) is
still in flight when its cleanup disposes that mount's engine/scene. `ImportMeshAsync`
then rejects with "Scene has been disposed", which the `.catch` logged as
`[DriveCanvas] scene init failed`. It was **noise from the aborted first mount** —
the surviving second mount built the full scene (live probe: 106 meshes, physics
grounded). It did not corrupt the second mount; the shared module globals
(`registerBuiltInLoaders`, Draco config, cached Havok plugin) are idempotent/reused.

## Fixes

- **`driveWorld.ts`**
  - Replaced thin-instancing with **cloning the loaded glTF root hierarchy** at
    each transform (`placeTile()` clones the template root, enables it, sets
    position and — for turn pieces only — Y-rotation), mirroring the showroom's
    "position the glTF root" pattern. Road-tile templates are loaded once and kept
    `setEnabled(false)`; the straight is 19 clones (Z +24…−204), plus the
    left/right turn stubs per the commit layout.
  - Disable vertex-color tinting on every loaded mesh (`useVertexColors = false`
    in `loadGlb` + a `disableVertexColors()` sweep on clones/buildings/props).
  - Ground predicate now walks the parent chain against an **identity set** of
    road root nodes (clones + asphalt), so wheel-ray picks on cloned child meshes
    resolve as road.
- **`driveScene.ts`**
  - Added **HDRI image-based lighting** matching the showroom
    (`kloofendal_48d_partly_cloudy_puresky_2k.hdr` as `environmentTexture` +
    `createDefaultSkybox`, `hdrTextureLoader` side-effect import, exposure 1.0);
    lowered the hemispheric fill to 0.25 since IBL now supplies ambient, kept the
    directional sun for the car's shadow.
  - Chassis now spawns **facing −Z** (`SPAWN_ROT = RotationY(π)`, applied at spawn
    and in `reset()`), and the follow camera starts on the +Z side, so it frames
    the long road ahead and throttle drives down the course.
- **`DriveCanvas.tsx`**
  - Made the strict-mode `.catch` **abort-safe**: `if (disposed) return;` before
    logging, so the aborted first-mount load no longer prints a false failure.

## Verification

- Headed real-GPU screenshot (local, `.claude/` is gitignored):
  `.claude/skills/run-driving/shots/drive-fix-1.png` — continuous textured road
  (grey sidewalk tiles, dark asphalt with lane markings, curbs), car sitting on the
  surface, buildings + bollards at consistent ground height, camera behind/above
  looking down the road. No red tint. **`console errors: none`.**
- Scripted drive (throttle 1 for 3 s): car moved z 7.14 → −12.21 (dz −19.35, i.e.
  forward down the −Z course), `grounded = true`, `offTrack = false` throughout —
  orientation is self-consistent with the camera framing.
- Coordinate contract: unchanged and still asserted at build; checkpoint (0,0,−90)
  inside the straight strip |X|<3, Z∈[−204,24]; straight tiles laid at X=0 over
  that Z range.

## Gate outputs
- `npm run type-check` — clean (tsc --noEmit, no errors).
- `npm run lint` — 0 errors (2 pre-existing warnings in FeedbackScreen.tsx /
  VisionController.tsx, unrelated to this change).
- `npm run test:unit` — **65 pass / 0 fail**.
- `npm run build` skipped per brief (dev server holds the `.next/dev/lock`); leave
  to the controller.

## Fix round 2

Reviewer raised two Important issues on the B5 world (`src/components/babylon/driveWorld.ts`). Both fixed on `E1-babylon/feature/full-port`.

### Finding 1 — plan-mandated instancing restored (was full clones)

The prior round replaced the broken thin-instancing of the 0-vertex `__root__` with `template.clone()` per tile, giving every repeated tile its own full mesh hierarchy and draw call. Restored **real GPU instancing**:

- Probed the live scene to confirm the glTF hierarchy: `__root__` (0 verts, scaling (1,1,-1), 180° Y) → optional identity `TransformNode` → geometry primitives, **all with identity local transforms**. So each primitive's transform relative to the root is identity.
- `placeTile()` now clones **only** the 0-vertex root (`template.clone(name, null, true)`) to reproduce the RH→LH conversion + placement translation/rotation exactly as the old clone path did, then hangs a hardware `createInstance()` of every geometry primitive off it (identity-local, so it lands where the full clone did). Added the required side-effect import `@babylonjs/core/Meshes/instancedMesh`.
- Templates now stay enabled (so their geometry can be instanced) but are `isVisible=false` + `isPickable=false` so the originals neither draw nor catch wheel rays at the origin.
- `isRoadMesh` unchanged in spirit: instances are parented to their tile root, which is added to the `roadRoots` identity set, so the parent-chain walk still classifies road surfaces. Instances are `isPickable=true` (wheel-ray targets).
- Vertex-color fix preserved: `useVertexColors=false` is set on the source meshes in `loadGlb`; instances inherit it (screenshot shows correct grey concrete / dark asphalt, no red tint). Unique one-offs (buildings/props/asphalt) still move their loaded root.

**Instancing evidence (live scene, real GPU, `SceneInstrumentation.drawCallsCounter` via a temporary probe since removed):**

| metric | before (clones) | after (instancing) |
|---|---|---|
| draw calls | **149** | **85** |
| InstancedMesh count | 0 | **77** |
| drawn geometry `Mesh`es | 150 | 73 |

The ~29 repeated road tiles (79 primitives) collapse from one draw call each into a handful of GPU-batched instanced draws — 64 fewer draw calls; the remaining 85 are the unique buildings/props/asphalt + car + skybox/shadows.

### Finding 2 — coordinate contract now derived + tested

- Extracted the pure layout math to **`src/lib/driveLayout.ts`** (no `@babylonjs`/browser imports): the placement constants (`TILE_W`, `TILE_L`, `ROAD_Y`, `STRAIGHT_START_Z`, `STRAIGHT_TILE_COUNT`), `straightRoadStrip()` which **derives** the strip bounds from those constants (first/last tile centre ± TILE_L/2), and `checkCoordinateContract()` which verifies the checkpoint falls inside the derived strip.
- `driveWorld.ts` now imports those constants + the check from `driveLayout` (removed the local duplicate constants and the tautological literal-vs-literal `assertCoordinateContract`; the straight loop and colliders use the shared constants, so the check fails for real if the layout drifts). `b5CoordinateCheck()` delegates to the pure module.
- Added **`tests/driveLayout.test.ts`** (`node --test`, 4 tests): strip is derived from the constants (X∈[-3,3], Z∈[-204,24]); the course.ts straight checkpoint (0,0,-90) is inside; the check is NOT tautological (fails for off-side / past-end / off-ground points); and the derived strip covers every placed straight tile.

### Verification

- Headed real-GPU screenshot: `.claude/skills/run-driving/shots/drive-fix2.png` — continuous textured road, car grounded and centred, follow camera behind the car down the −Z course, buildings + bollards placed, correct textures (no red tint), 60 FPS, **no console errors**. Scripted state: `grounded=true, offTrack=false`.
- Gates: `npm run type-check` clean; `npm run lint` 0 errors (2 pre-existing warnings in unrelated files); `npm run test:unit` **69 pass / 0 fail** (was 65 + 4 new).
