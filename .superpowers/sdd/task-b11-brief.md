# Task B11 brief — Webcam control + pedal fallback (replay already shipped)

Plan task (verbatim): **B11 Webcam control + replay + pedal fallback.** MediaPipe foot/hand input feeding throttle/brake/steer/gear; keyboard pedal-mode fallback; replay/ghost recording and timestamp-interpolated playback. Acceptance: webcam drives the car; keyboard fallback works; replay reproduces a run.

Already shipped (do not rebuild): replay recording (B7c missionRuntime → store.replayData) and timestamp-interpolated playback (B8 ReplayCanvas via frozen replay.ts). THIS task = the vision layer + its UI + fallback semantics.

## Scope

1. **Vision pipeline into the product.** The original's vision layer is engine-agnostic React feeding the STORE (not the renderer): `src/components/vision/VisionController.tsx` (+ `src/lib/vision/{steeringGear,pedalDecision}.ts`, `src/lib/footPedalRecognition.ts`, `src/lib/oneEuroFilter.ts` — all in-tree with tests). Integrate it into the Babylon product's driving screen so that when a webcam is available: hands → steering (overriding keyboard steer while hands detected) + gear gestures (D/R via steeringGear.ts), face → headRotation (pitch/yaw/roll — feeds the mirror/safety checkpoints that currently never clear), feet/foot camera → throttle/brake via footPedalRecognition + pedalDecision, with the calibration flow (store calibrationStage, tutorial step 4's startCalibration hook). Reuse the in-tree vision modules AS-IS (they are frozen-adjacent: pure + tested); VisionController itself may be adapted/rewritten for the product shell — mirror its store contract and lifecycle exactly (camera acquisition, MediaPipe model loading from the same assets/CDN the original uses, vision-ready flag, debug info).
2. **Webcam UI.** Port the original's in-drive vision UI: webcam preview + status indicators (check the original Dashboard/TutorialIndicators for what is shown: vision-ready, calibration state, pedal state). Both languages.
3. **Keyboard fallback semantics (must match original).** No camera / camera denied / vision not ready → keyboard drives everything (current B6 behavior stays). When vision IS active: steering is overridden by hands each frame while detected (original KeyboardControls comment documents this); pedals come from feet when calibrated, keyboard otherwise (check pedalDecision for the exact arbitration); gear gestures coexist with keyboard 1/2/3.
4. **Ghost/replay**: nothing new unless the original has a ghost-car feature the port lacks — check; if the original's "ghost" is just the replay playback we have, state that in the report.

## Environment limitation (accepted)
No real webcam here. Verify with Playwright's fake media stream (`--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` launch args + permissions): the pipeline must start, MediaPipe must load, no crash, and with no detectable hands/face/feet the keyboard fallback must drive exactly as before (regression-check the straight lesson end-to-end). Camera-DENIED path: verify with permissions denied. Real hand/foot driving cannot be verified here — verify by line-level fidelity to the original and STATE THIS PROMINENTLY in your report; the user will drive-test.

## Global constraints
- Frozen modules untouched: course/missions/checkpointEval/scoring/replay/store contract + the vision pure modules (steeringGear, pedalDecision, footPedalRecognition, oneEuroFilter — reuse, don't fork).
- MediaPipe assets: use the same loading strategy as the original (check what it does — CDN vs local). Note the download-size implication for B12's budget measurement in your report.
- 142/142 tests must not regress; new pure glue gets node --test coverage.
- Preserve all invariants (fresh Havok plugin, strict-mode teardown — the camera/MediaPipe lifecycle must survive strict-mode double-mount without double-acquiring the camera; the original VisionController has known exhaustive-deps warnings — structure cleanly, don't replicate).
- Both languages. 60fps with vision running (fake stream) — check the FPS readout.

## Verification loop
- Dev server on :3000 (hot reload, NEXT_PUBLIC_E2E=1 built in; store hook needs ?e2e URL param). Do not start a second `next dev`; do not run `npm run build`.
- NEVER issue a foreground Bash call >115s; do not end your turn while waiting on a background task — poll its output file with Read.
- Headed Playwright with fake media stream; screenshots of the driving screen showing the webcam UI (fake feed) in both languages; camera-denied state; READ every PNG. Straight-lesson keyboard regression run must still reach feedback 100/100.
- Gates: `npm run type-check`, `npm run lint`, `npm test`.

## Report contract
Write your full report to `.superpowers/sdd/task-b11-report.md` (original-fidelity notes per subsystem, MediaPipe asset strategy + size note, fake-stream evidence, the cannot-verify-real-webcam limitation, gate outputs). Commit on the current branch (coherent commits fine). Return ONLY: status, commit sha(s), one-line test summary, concerns.
