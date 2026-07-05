# Task B5b report — rearview mirror

## Status: DONE

## What was built

A screen-space rearview mirror for the `/drive` scene, implemented purely with
`@babylonjs/core` (no `@babylonjs/gui` dependency added):

- **`src/lib/mirrorLayout.ts`** (new, unit-tested, no Babylon imports):
  - `computeMirrorViewport({ widthFrac, topMarginFrac, canvasAspect, mirrorAspect })`
    — the on-screen viewport rectangle for the mirror overlay, in Babylon
    `Viewport` fractions (y measured from the bottom). Derives `heightFrac`
    from `canvasAspect`/`mirrorAspect` because Babylon's orthographic
    projection does not auto-correct for viewport aspect the way a
    perspective camera does — an independently-chosen height would stretch
    the mirror image at non-reference window sizes.
  - `mirrorCameraLocalOffset(chassisHalfHeight, chassisHalfLength, roofClearance?, rearMargin?)`
    — local mount point (relative to the chassis) for the rear-facing
    camera: above the roof, at/beyond the chassis's rear face (local **-Z**,
    since local **+Z** is the car's front per `raycastVehicle.ts`'s
    `Vector3.TransformNormal(Vector3.Forward(), rotMatrix)`).
- **`src/components/babylon/rearviewMirror.ts`** (new, rendering-only, no
  unit tests per D1.a): `setupRearviewMirror(scene, engine, chassis,
  chassisHalfHeight, chassisHalfLength, mainCamera)`.
  - A `UniversalCamera` parented to the chassis, mounted via
    `mirrorCameraLocalOffset`, rotated 180° about local Y so it looks
    backward.
  - A `RenderTargetTexture` (512×256) with that camera as `activeCamera`.
    `renderList` is explicitly `scene.meshes` (the live array, world + car,
    "not UI") — **not** left `null`/omitted: an RTT with no explicit
    renderList falls back to `scene.getActiveMeshes()`, which is the *main*
    camera's per-frame frustum-culling result, not the rear camera's; the
    world behind the car (which the forward-facing main camera never marks
    "active") would otherwise be silently missing from the mirror. This was
    caught by the first screenshot (mirror rendered pure sky-blue clear
    color) and fixed before the second attempt.
  - An unlit `StandardMaterial` showing the RTT with `uScale = -1, uOffset =
    1` (horizontal flip — a real mirror shows a left-right-flipped view of
    what's behind), on a single plane.
  - Composited via Babylon's multi-camera support: a second, static,
    orthographic "ui camera" (`scene.activeCameras = [mainCamera, uiCam]`)
    with a `viewport` sized/positioned by `computeMirrorViewport` and a
    dedicated `layerMask` bit (`0x10000000`) that only the mirror plane
    carries — this keeps the plane out of the main camera's view and out of
    its own reflection (with `mirrorRTT.forceLayerMaskCheck = true`, since a
    custom `renderList` otherwise skips per-mesh layerMask filtering by
    default).
  - `setActive(bool)` / `isActive()` — the B7 hook the brief asked for:
    toggles the plane and adds/removes the RTT from
    `scene.customRenderTargets`, so B7's checkpoint system can fully disable
    the mirror's render cost, or query whether it's currently on.
  - `dispose()` — releases the camera, RTT, material, plane, and the
    `engine.onResizeObservable` listener.
- **`src/components/babylon/driveScene.ts`**: wires the mirror in after the
  follow camera is set up (`setupRearviewMirror(scene, engine, chassisMesh,
  CHASSIS.hh, CHASSIS.hl, camera)`), registers `scene.onDisposeObservable
  .addOnce(() => mirror.dispose())` so teardown is automatic and abort-safe
  under the existing strict-mode double-mount guard (no changes needed to
  `DriveCanvas.tsx`), and exposes `mirror: { setActive, isActive }` on
  `DriveSceneHandle`.

## Bugs found and fixed during verification (in order)

1. **Mirror rendered flat sky-blue, nothing behind the car.** Root cause:
   `mirrorRTT.renderList = null` falls back to `scene.getActiveMeshes()`
   (the main camera's culling result), not "whole scene". Fixed by setting
   `renderList = scene.meshes` explicitly (plus `forceLayerMaskCheck = true`
   to keep the UI-only mirror plane excluded).
2. **Mirror filled with a car-roof-colored gradient.** Root cause: the rear
   camera was mounted near the chassis's horizontal centre; looking backward
   at a shallow grazing angle over the remaining ~2m of roof dominates the
   frame by simple perspective (near roof at a steep down-angle, far roof
   edge only a few degrees below the horizon). Fixed by mounting the camera
   at/just past the chassis's rear face instead of its centre — added a
   regression test (`mirrorCameraLocalOffset places the camera at/beyond the
   rear edge...`) asserting `offset.z <= -chassisHalfLength`.
3. **Mount placed the camera at the car's FRONT, not rear** (the actual bug
   behind #2's fix attempt #1): local **+Z** is the chassis's front
   (matching `raycastVehicle.ts`), so the rear mount must be at **negative**
   Z, not positive. Caught by re-reading the screenshot after the first
   "move to the edge" fix still showed the same self-occlusion, worked out
   from `raycastVehicle.ts`'s forward-direction convention, fixed by
   negating `z` in `mirrorCameraLocalOffset`, TDD'd (RED confirmed, then
   GREEN).

All three were caught by reading the actual screenshots per the verification
loop, not assumed away.

## Screenshots (`.claude/skills/run-driving/shots/`, gitignored)

- `drive-b5b.png` — canonical brief screenshot, car at spawn (Z≈7.16,
  stationary). Mirror (top-center overlay) shows the short ~14 m tail of
  road/sidewalk behind the spawn point receding to the world's edge, then
  sky beyond — exactly the shape the brief's own note predicts ("at spawn
  that is the short tail of road behind the start"). 60 FPS readout.
- `drive-b5b-forward2.png` — after driving forward ~22 m (throttle held via
  `__driveDebug.setInput`). Mirror now shows two bollards (props placed at
  Z=±10) and a road tile receding into the distance, clearly different
  content from the main (forward) view, confirming the mirror tracks the car
  and shows *behind*, not a copy of *ahead*. Still 60 FPS.
- `drive-b5b-flip-test.png` — after driving to Z≈-42 (past `bldg_L_0`
  "Building_Large_2" at X=-18 and `bldg_R_0` "Building_Small_1" at X=+12,
  both originally at Z=-30). Used to verify the horizontal-flip direction:
  the large building (X=-18, on-screen LEFT in the forward view earlier)
  still reads on the LEFT side of the mirror, and the small building (X=+12,
  on-screen RIGHT ahead) reads on the RIGHT side of the mirror — i.e. the
  mirror preserves the driver's own left/right sense (matches how a real
  flat rearview mirror behaves), confirming `uScale=-1`/`uOffset=1` flips
  the correct way and doesn't double-flip or no-op.
- `drive-b5b-2.png`, `drive-b5b-3.png` — intermediate captures from bug #1
  and bug #2/#3 above, kept for the record of what each fix changed.

Driving was done via a new gitignored helper script,
`.claude/skills/run-driving/shots/shot-drive-b5b-forward.mjs` (drives via the
`window.__driveDebug.setInput` hook for a configurable `THROTTLE_MS`, then
brakes briefly and screenshots), since the brief's existing
`shot-drive-headed.mjs` does not drive.

## Test-driven development

`src/lib/mirrorLayout.ts`'s two pure functions were built test-first
(`tests/mirrorLayout.test.ts`, `node:test` + `node:assert/strict`, matching
`tests/driveLayout.test.ts`'s style):
- Confirmed RED (module not found) before writing the implementation.
- 9 tests initially GREEN; then, when visual verification found the
  self-occlusion and front/back bugs above, the offset function's contract
  changed (new `chassisHalfLength` param, sign fix) — each change was
  re-driven through RED (confirmed the old implementation failed the new
  assertions for the right reason) before the fix, per the TDD skill.
- Final: 13 tests in `mirrorLayout.test.ts`, covering the viewport-rect
  centering, the bottom-origin `y` math, an explicit "pixel aspect always
  equals `mirrorAspect` regardless of `canvasAspect`" invariant (the actual
  anti-stretch property, not just a spot value), input validation, the
  camera-offset math, and a regression guard tying the offset to
  `chassisHalfLength` so a future chassis resize can't reintroduce the
  self-occlusion bug.
- `rearviewMirror.ts` and the `driveScene.ts` wiring are rendering-only
  (Babylon scene graph / camera / RTT / material wiring) and are exempt from
  unit tests per the brief's D1.a discipline; they were verified visually
  instead (see Screenshots above).

## Gate outputs

- `npm run type-check` — clean, no errors.
- `npm run lint` — 0 errors, 2 pre-existing warnings unrelated to this work
  (`FeedbackScreen.tsx`, `VisionController.tsx` exhaustive-deps warnings,
  present before this change).
- `npm run test:unit` — **82 passing, 0 failing** (was 69 before this task;
  +13 new tests in `tests/mirrorLayout.test.ts`, 0 regressions in the
  existing 69, including all of `driveLayout.test.ts`'s coordinate-contract
  tests).

## FPS evidence

Every screenshot's on-screen readout (top-left, driven by
`engine.getFps()`) reads **60 FPS** with the mirror rendering live, at the
default Playwright viewport (1280×800) on the headed real GPU (Arc 140T).
This is a spot-check, not the formal B12 per-frame-cost budget measurement
the brief explicitly defers to B12 ("count its per-frame cost in B12"); no
regression was visible at this resolution during either the stationary or
the driving-forward captures.

## Concerns

- FPS was only checked via the on-screen readout at 1280×800, not the
  formal 1920×1200 B12 harness — flagged in the brief itself as a B12
  responsibility ("its per-frame cost" is measured there), not re-litigated
  here.
- The mirror's `renderList = scene.meshes` is a live array reference (grows
  automatically as `driveWorld.ts` or future code adds meshes), which is
  correct for now but means any future scene content that should be
  UI-only (not just the mirror's own plane) will need the same
  `MIRROR_UI_LAYER` treatment (or its own bit) to stay out of the mirror's
  reflection.
- Mirror mount geometry (`roofClearance = 0.15`, `rearMargin = 0.1`) is
  tuned for the current placeholder box chassis (`CHASSIS = { hw: 0.9, hh:
  0.4, hl: 2.0 }`); if/when a real car mesh replaces the box, these two
  constants (and the regression test tying them to `chassisHalfLength`)
  should be revisited together.
