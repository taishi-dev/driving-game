# Task B8 report — HUD + feedback/replay-review screens

Status: **DONE**

## What was built

### 1. Drive HUD to product level (`DrivingScreen.tsx`)
- Added live **throttle** and **brake** bars (green / red, filled from store `throttle`/`brake`) and a **steering** indicator (centered track with a thumb that tracks `steeringAngle`, normalized by `STEER_MAGNITUDE`). Kept speed/gear/off-track.
- Both languages (added `throttle`/`brake`/`steer`/`warning` strings for ja + en).
- **Fixed the raw-LessonId subtitle**: the top-left subtitle now shows the localized lesson title via a new pure `getLessonTitle(lesson, language)` in `lessonCatalog.ts` (e.g. "Straight Driving" / "直線走行" instead of "straight"). Also applied to the FeedbackScreen header.
- **Fixed the bottom-left key-hint clipping**: moved the controls hint to its own bottom-left element with padding (`left-3`, `px-2`) and a background chip, sitting above the FPS badge — left edge no longer cut off.
- Added throttle/brake/steer to `__driveDebug.getState()` (no user data) for scripted HUD verification.

### 2. Rearview-mirror frame (`DrivingScreen.tsx`)
- Added a DOM bezel overlay positioned to exactly match the in-scene mirror RTT rectangle (widthFrac 0.26, topMargin 0.02, 2:1 aspect — same constants as `rearviewMirror.ts`/`mirrorLayout.ts`). Rounded border + inner shadow so the mirror reads as a mirror against the sky. The frozen mirror hook/math is untouched.

### 3. Replay-review on the feedback screen
- New `replayScene.ts`: reuses the B5 `buildDriveWorld` (same world + coordinate system) lit by the same HDRI, with **no raycast vehicle**. A single kinematic hero-box car (red PBR body + 4 wheels, matching the drive proportions) is repositioned each frame. A fresh Havok plugin is created only so `buildDriveWorld` can build its static road colliders (nothing dynamic is simulated).
- New `ReplayCanvas.tsx`: owns the engine + render loop. Each frame it advances by REAL elapsed time and samples the store's `replayData` via the frozen `sampleReplay`/`replayDurationMs` (`replay.ts`, untouched), driving the car through the world. Playback **loops** at end-of-recording (original semantics). Exposes `__replayDebug.getState()` for verification. Strict-mode `disposed`-guard teardown.
- `FeedbackScreen.tsx` restructured to the original two-column layout: left = replay scene with a red pulsing REPLAY badge + **CHASE / DRIVER** toggle wired to `replayViewMode`/`setReplayViewMode`; right = existing score / clear-time / AI feedback / per-checkpoint results / actions (all data-testids preserved). Sets `isReplaying` true on mount, false on unmount.
- `replayScene` backs the store toggle with two cameras: a chase `FollowCamera` behind the car and a driver `UniversalCamera` parented at the windshield looking forward.

### 4. Off-track / feedback overlays (`DrivingScreen.tsx`)
- Kept the green checkpoint-cleared toast and the compact OFF TRACK HUD badge.
- Added the original Dashboard's centered blinking **WARNING / OFF TRACK** overlay (both languages) that was missing. `useDrivingFeedback.ts` is a confirmed no-op, so nothing else was missing.

## Files
- Edited: `src/lib/lessonCatalog.ts`, `src/components/babylon/product/DrivingScreen.tsx`, `src/components/babylon/product/FeedbackScreen.tsx`, `src/components/babylon/product/DriveScreenCanvas.tsx`, `tests/lessonCatalog.test.ts`.
- New: `src/components/babylon/replayScene.ts`, `src/components/babylon/product/ReplayCanvas.tsx`, `.claude/skills/run-driving/shots/shot-b8-hud-replay.mjs`.

## Frozen-module compliance
No new store fields. `replay.ts`, `store.ts` contract, course/missions/checkpointEval/scoring untouched. Mirror hook, registerBuiltInLoaders, Havok side-effect + fresh-plugin-per-scene, strict-mode disposed-guard teardown, fail-soft Firebase all preserved.

## Verification (headed real-GPU Playwright, 1920x1200)
`shot-b8-hud-replay.mjs` drove the straight lesson to the goal, then exercised the feedback replay:
- **HUD live** (mid-drive, W held): speed 59 km/h, throttle=1 (bar full green), brake=0, steer=0 (thumb centered), gear D, **60 fps**. Screenshot `b8-hud-mid.png` also shows the localized "Straight Driving" subtitle, the framed rearview mirror, and the un-clipped bottom-left key hint.
- **Feedback screen**: score 100/100, clear time 00:15.74, replay canvas visible, header localized.
- **Replay plays** (acceptance): car at z=+9.88 (t1) → z=-10.33 (t2) across playback timestamps, 896 frames / 15.3 s recording, **60 fps**. Screenshots `b8-replay-chase-t1.png` / `b8-replay-chase-t2.png` show the car at different world positions.
- **Chase/driver toggle** changes the camera: `viewMode` flips to "driver"; `b8-replay-driver.png` shows the in-car forward view (vs the chase view). Toggle back to chase works.
- No console errors.

## Gates
- `npm run type-check`: clean.
- `npm run lint`: 0 errors (2 pre-existing warnings in old `ui/FeedbackScreen.tsx` + `vision/VisionController.tsx`, not touched).
- `npm run test:unit`: **126/126 pass** (124 baseline + 2 new `getLessonTitle` tests; no regression).

## Concerns
- None blocking. The replay playback car is the box hero-car (hero-car GLB swap is later polish, per the brief). The off-track centered WARNING overlay is a straightforward conditional and was not exercised on the straight lesson (car stays on track); it mirrors the original Dashboard verbatim.
