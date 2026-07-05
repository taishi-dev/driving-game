# Task B12 — Performance pass + measurement + cleanup (FINAL) — Report

Branch: `E1-babylon/feature/full-port` · Target machine: Intel Core Ultra 7 255H /
Arc 140T iGPU / 1920×1200 · Measured headed on the real GPU (SwiftShader/headless
numbers deliberately avoided).

---

## 1. Headline results

| Surface | fps (min / median / max) | 60 fps? |
|---|---|---|
| Home (showroom hero) | 60 / 60 / 60 | ✅ |
| Driving — keyboard only | 49 / 60 / 60 | ✅ (median 60; transient start dip) |
| Driving — vision running (fake webcam) | 26 / 29 / 42 | ❌ MediaPipe-bound (see §3) |
| Replay (feedback screen) | 60 / 60 / 60 | ✅ |

Download to drive-ready (transferred bytes, headed prod build), AFTER the object-detector drop:

| Category | MB |
|---|---|
| Models (GLB: car + world tiles + buildings + props) | 2.97 |
| Textures (HDRI 2k .hdr) | 5.20 |
| Draco decoder (wasm+js) | 0.07 |
| MediaPipe (CDN wasm + 3 models) | ~22.38 |
| App/engine JS (_next) | 1.29 |
| Other (Havok wasm 0.63 + favicon) | 0.66 |
| **TOTAL to drive-ready** | **~32.6 MB** (was 39.50 with the detector) |
| First-interactive (home rendered) subtotal | 7.48 MB |

Budget ≤ 50 MB → **PASS** (32.6 MB, with comfortable headroom).

Gates: type-check PASS · lint PASS (0 errors) · unit 151/151 · e2e 5/5 · build clean.

Final download re-confirmed on the pure post-drop build: **32.58 MB total** (MediaPipe
22.38, models 2.97, HDRI 5.20, Draco 0.07, app JS 1.29, other/Havok 0.66), home 7.48 MB.

---

## 2. Measurement protocol (production build FIRST)

- Dev server stopped; an orphaned `next dev` was holding port 3000 (PID 9612) — killed.
- **Pure production build** (`npm run build`, NO `NEXT_PUBLIC_E2E`) → the real deploy
  artifact; used for the **download-size** capture (headed Chromium, transferred bytes
  per request via Playwright `request.sizes()`, fresh → home → free-drive so world GLBs,
  Draco, HDRI and the MediaPipe CDN assets all load).
- **E2E-flag build** (`NEXT_PUBLIC_E2E=1 npm run build`) → used for the **fps** run, so
  the store hook + `__driveDebug`/`__replayDebug` allow scripted navigation and fps reads.
  Render performance is identical between the two builds (the debug hooks do no per-frame
  render work); the JS delta is the small gated debug blocks (dead-code-eliminated from
  the pure build) — immaterial vs the 32.6 MB total.
- fps sampled every 250 ms over 6–8 s of active driving per surface at 1920×1200 headed;
  min = worst steady frame, median = typical. Home hero measured via the `/showroom`
  route (identical `showroomScene`, which carries a visible fps badge).

---

## 3. Perf tuning — measure → hypothesize → one lever → re-measure

**Baseline (pure measure, before any change):** vision-active drive = min 17 / median 20 /
max 22 fps — i.e. production was NOT dramatically better than the 16–18 fps dev reading.
Every other surface already sat at 60. The identical scene renders at 60 fps keyboard-only,
so **the deficit is entirely the MediaPipe pipeline, not Babylon rendering.**

**Lever applied (behavior-preserving, sanctioned): drop the MediaPipe ObjectDetector.**
`steeringGear.ts` confirmed the object detector's output was used ONLY to append a
`| Obj: <name>` suffix to the debug string — it never touches gear, steering, or pedals.
Removed the detector from `VisionController` (import, refs, per-frame-adjacent inference,
model load, cleanup).

Re-measure after the drop:

| Surface | before | after |
|---|---|---|
| vision drive | 17 / 20 / 22 | **26 / 29 / 42** |
| download — MediaPipe | 29.30 MB | ~22.38 MB (−6.92) |
| download — total | 39.50 MB | ~32.6 MB |

→ ~+45 % vision fps AND −6.92 MB download from one behavior-preserving change.
Deviation from the original recorded (§6): the debug status panel loses the developer-only
"Obj:" suffix; driving behavior is byte-identical.

**Levers evaluated but NOT applied (with reasons):**
- *Pose model full → lite:* would cut per-frame pose inference, but it degrades foot-pedal
  detection accuracy — a real product-behavior change to the webcam feature whose user
  drive-test is still pending. Changing the model now would invalidate that pending
  baseline. Not worth the risk for a partial gain (would not reach 60 either).
- *Babylon freezes (`freezeActiveMeshes`, `material.freeze`, `freezeWorldMatrix`):*
  `freezeActiveMeshes()` is unsafe here — the follow camera moves through the world, so a
  frozen active-mesh list would stop culling/adding meshes correctly. The others give a
  sub-millisecond CPU saving that cannot move a MediaPipe-bound 29 fps, and the non-vision
  surfaces already hit 60. Skipped per "don't over-optimize into risk."
- *SceneOptimizer / HardwareScalingOptimization:* last-resort resolution downscaling would
  trade visual quality for fps on surfaces that already hit 60; the one short surface is
  CPU/GPU-inference-bound, not fill-rate-bound, so downscaling would not help it. Skipped.

**Honest conclusion:** 60 fps is met on home, keyboard-drive, and replay. Vision-active
drive lands at ~29 fps (median), bounded by three MediaPipe landmarkers (face + hand + pose)
running synchronously per frame on the shared iGPU — an engine-independent cost, materially
better than the pre-B12 16–18 fps. Reaching 60 with live vision would require decoupling
inference from the render loop (workers / reduced cadence), an architecture change beyond
this task's "documented perf levers only" scope and out of parity with the original app.

Mirror RTT cost note: the rearview mirror renders a second 512×256 camera pass; on the
non-vision surfaces it is already absorbed within the 60 fps budget (keyboard drive holds
median 60 with the mirror active), so no toggle-off optimization was needed.

---

## 4. Physics / frame-rate audit

`driveScene` clamps the physics step to `min(dt, 1/30)`. Verified all scored quantities are
frame-rate-independent:
- **Clear time** = `missionEndTime − missionStartTime`, both `Date.now()` (store.ts) →
  wall-clock, FPS-independent.
- **Replay** frames carry `timestamp: Date.now()` and playback is timestamp-interpolated
  (frozen `replay.ts`) → correct speed/position regardless of recording fps.
- **Checkpoint / goal grading** (`stepMissionGrading`) is threshold-based on position and
  speed, not on frame count or wall-clock rate.

The only frame-rate sensitivity is that below 30 fps the dt clamp makes sim time advance in
mild slow-motion (~3 % at 29 fps) — a *feel* effect (the car covers slightly less ground per
wall-clock second), NOT a scoring error. **No scoring/timing correctness issue at 29 fps.**

---

## 5. Cleanup roll-up (all items from progress.md "Minor findings roll-up")

| Item | Resolution |
|---|---|
| B8: mirror + CHASSIS constants duplicated | Mirror placement fractions (`MIRROR_WIDTH_FRAC`/`MIRROR_TOP_MARGIN_FRAC`/`MIRROR_ASPECT`) moved to the Babylon-free `mirrorLayout.ts`; `rearviewMirror.ts` and the `DrivingScreen` DOM bezel both import them (bezel can't import the Babylon module without pulling Babylon into the main bundle — the pure module is the correct single source). `CHASSIS` + `WHEEL_RADIUS` exported from `driveScene.ts`; `replayScene.ts` imports them (drive chunk is already loaded by the time replay runs — no extra download). |
| B11: cleanup comment claims steering reset on unmount but code didn't | Added `store().setSteering(0)` to `VisionController` unmount, matching the comment's intent. |
| driveWorld dispose order nit | `dispose()` now iterates `disposables` in reverse push order (tile-root instances before their template sources). |
| B9: `uiStrings.ts` stale header comment | Rewrote the header prose to describe the current three shared strings and that `exitToHome`'s へ particle is a deliberate per-screen difference, not drift. |
| B8: FeedbackScreen right column not re-indented | Re-indented lines 251–348 by +2 spaces inside the `max-w-3xl` wrapper. |
| B7b: `__driveDebug` exposed unconditionally | **Decision: gate it** exactly like `__drivingStore` — build-time `NEXT_PUBLIC_E2E==="1"` (dead-code-eliminated from prod) AND runtime `?e2e`. Same gate applied to `__replayDebug` for consistency (both are test hooks; `__driveDebug` additionally exposes behavior injection — setInput/teleport/reset — so gating it out of prod is a small hardening win). The on-screen `drive-fps` badge stays available, so the measurement path is unaffected; the e2e specs (which navigate with `?e2e=1` against the `NEXT_PUBLIC_E2E=1` build) still work. |

---

## 6. KNOWN GAPS — recorded, NOT fixed here (E1-branch honest conclusions)

- **World build-out gap:** the s-curve / crank / crosswalk / traffic-light / railroad lesson
  areas are unbuilt; their goals are reachable over the flat safety ground but the car shows
  OFF TRACK in the unbuilt zones. Only the straight + turn stubs are modelled.
- **Traffic light is a DOM widget**, not a 3D model in the world.
- **Hero car is still the placeholder box** in the drive and replay scenes (the PBR
  CarConcept only appears in the showroom/home hero).
- **Real-webcam drive-test pending:** hands-steer, gear gestures, feet pedals, and
  face→mirror checkpoints have only been exercised with the fake webcam / keyboard fallback.
- **Firebase real-config smoke pending:** auth + history save/fetch verified fail-soft and
  by shape/tests, but not against a live Firebase config.
- **Intentional deviation (this task):** object detector dropped (§3) — debug string only.

---

## 7. Gate outputs

- `npm run type-check` → **PASS** (0 errors).
- `npm run lint` → **PASS** (0 errors; 2 pre-existing warnings, both in the FROZEN R3F
  originals `src/components/ui/FeedbackScreen.tsx` and `src/components/vision/VisionController.tsx`
  — not the Babylon product files, not introduced by B12).
- `npm run test:unit` → **PASS 151/151**.
- `npm run test:e2e` → **PASS 5/5** (webcam-fallback 3 headless + webcam-vision 2 headed;
  reused the running `NEXT_PUBLIC_E2E=1` build; 1.3m).
- `npm run build` (pure) and `NEXT_PUBLIC_E2E=1 npm run build` → both compile clean.

---

## 8. Checklist

`docs/superpowers/specs/2026-06-30-engine-trial-checklist.md` updated: §10 Performance
(fps per surface + per-category download + total vs 50 MB budget), §11 Build Quality, and an
E1-babylon status/known-gaps block appended. Committed with the code.

---

## Final-review fix round

Whole-branch review found 3 Important + 2 Minor issues. All fixed on this branch.

**Fix 1 (Important) — stale headRotation/gaze leaking into graded checkpoints.**
`VisionController.tsx` unmount cleanup reset `setSteering(0)` but not head/gaze;
`missionRuntime` grades mirror/safety checkpoints off `headRotation.yaw`, so a stale
yaw from a prior camera session could spuriously clear/block a checkpoint. Added
`setHeadRotation({0,0,0})` + `setGaze({0,0})` to the same unmount cleanup. Per-run
reset: the per-run store reset lives in the FROZEN `setMissionState("active")`, so
instead added a clean Babylon-side hook — the briefing **Start Mission** button in
`DrivingScreen.tsx` (the only entry to "active" for graded lessons, the only lessons
with mirror/safety checkpoints) now zeroes `headRotation` right before going active.
Both use existing store actions; no frozen code touched.

**Fix 2 (Important) — misleading §11.3 test-coverage record + no Babylon-vehicle unit tests.**
(a) Corrected checklist §11.3: dropped the misleading "car physics … 151/151" wording;
now states the Babylon `raycastVehicle.ts` is verified by headed driving + e2e (not unit
tests), and that `tests/carPhysics.test.ts` still covers the RETIRED R3F `carPhysics.ts`
as a frame-rate regression guard. (b) Extracted the vehicle's load-bearing arithmetic
into the Babylon-free `src/lib/vehicleKernel.ts` — `suspensionForce` (spring/damper with
never-pull clamp), `driveForceMagnitude` (signed drive per powered wheel), and
`overSpeedDragMagnitude` — following the driveLayout/mirrorLayout pattern.
`RaycastVehicle.update` now calls these exact functions (behavior-identical), and
`tests/vehicleKernel.test.ts` adds 8 `node --test` cases. Re-verified the vehicle still
drives: `e2e/webcam-fallback.spec.ts` **3/3 pass** (incl. the drive-to-goal grading test)
against a `NEXT_PUBLIC_E2E=1` production build.

**Fix 3 (Important) — steering-scale drift across consumers.**
`steeringAngle` carries ±0.6 from keyboard (`STEER_MAGNITUDE`, matches the original
`KeyboardControls`) and ±1.0 from vision (frozen `steeringGear`). Checked the ORIGINAL
UI: `ui/TutorialScreen.tsx` already uses the ±1.0 scale (`×50` + ±1.0 labels) and the
original `Dashboard.tsx` had no steering HUD — so ±1.0 is the app's established
convention. Canonicalized on ±1.0: the driving HUD (`DrivingScreen.tsx`) was normalizing
`÷STEER_MAGNITUDE` (0.6), which pinned any vision steer >0.6 to the rail — changed to
normalize by the ±1.0 canonical scale directly (removed the now-unused `STEER_MAGNITUDE`
import). The Babylon tutorial bar already matches ±1.0 (like the original), so it was left
unchanged. Documented the two-source convention in `driveControls.ts`'s header (since
`steeringAngle` itself is defined in the frozen `store.ts`).

**Fix 4 (Minor) — ShowroomCanvas missing disposed guard.**
Added `if (disposed) return;` to the `.catch` in `ShowroomCanvas.tsx`, matching every
other canvas.

**Fix 5 (Minor, docs) — comparison line items.**
Added two line items to the checklist's Known-Gaps comparison block: (a) three.js still
ships at runtime for the D1.a verbatim course/scoring math (folded into the measured app
JS); (b) two benign frozen-store state-machine inconsistencies — free-mode entry bypasses
the per-run `setMissionState("active")` reset, and `replayData` persists after an aborted
run.

**Gates (all green):**
- `npm run type-check` → PASS (0 errors).
- `npm run lint` → PASS (0 errors; same 2 pre-existing warnings in the frozen R3F originals).
- `npm run test:unit` → PASS **159/159** (151 prior + 8 new vehicle-kernel cases).
- `e2e/webcam-fallback.spec.ts --project=chromium` → **3/3 pass** (33.5s), vehicle drives to goal.
- Server started by Playwright's webServer; port 3000 confirmed free afterward.
