# Plan 0004 — Leg/foot detection robustness + keyboard pedal fallback

Status: IMPLEMENTED 2026-06-21 (branch `vision/leg-detection-robustness`). Verified by `tsc --noEmit` + `npm run build` (both clean); real-world behavior to be confirmed in the app.

## Problem
Camera detection of the lower body (for the foot pedals) is unreliable when the user sits far from the camera, wears dark/low-contrast clothing, or the camera's vertical angle foreshortens the legs. Hands and face hold up better; legs/feet are the weak point because they rely on the hardest-to-detect pose landmarks (ankles, heels, foot-index).

Tracing the code revealed this hits **two** walls, not one:
1. **Calibration gate.** Driving expects a 5s foot-stability calibration ([VisionController.tsx](../../src/components/vision/VisionController.tsx), `processPoseForPedals`). If legs aren't detected, calibration never completes.
2. **Per-frame overwrite.** When calibrated and driving, vision calls `updatePedalState` every frame, which writes top-level `throttle`/`brake` ([store.ts](../../src/lib/store.ts) line ~384) — the same fields `Car` reads (Car.tsx:89-90) and that keyboard's `setPedals` writes (store line ~210). So vision clobbers keyboard pedals each frame.

## Solution — two parts ("do both")

### Part 1: improve the vision (committed d0c4840)
- Pose model `lite` → `full` (markedly better on distant/low-contrast bodies; swap to `heavy` for more or back to `lite` if framerate drops).
- Pose confidence thresholds `0.5` → `0.3` so legs/feet keep tracking in poor conditions; downstream one-euro smoothing absorbs the added jitter.

This raises the detection ceiling but cannot defeat the physics floor (black clothing in low light). Hence Part 2.

### Part 2: keyboard pedal fallback (this change)
An explicit, persisted **pedal input mode**, chosen via a manual button (Option A — a deterministic escape hatch beats finicky auto-detection):
- `pedalInputMode: 'camera' | 'keyboard'` in the store, persisted to `localStorage` (survives reloads), default `camera`.
- In `keyboard` mode, `processPoseForPedals` returns early before any pedal logic, so keyboard `setPedals` is the sole pedal source. **Steering still uses the camera** (hands track fine); only pedals switch.
- The tutorial's step 4 (foot calibration) gets a button: "足の検出がうまくいかない場合は、キーボードで操作する（W / S）". It sets keyboard mode and advances, so a user who can't be foot-tracked is never stuck at calibration. The choice is reversible from the same step.

## Verification
`tsc --noEmit` clean; `npm run build` clean. Functional check (in the app): with dark clothing / far seating, choose keyboard pedals in the tutorial, confirm W/S drive the car while hands still steer, and that the choice persists across reload.

## Honest limitation
No code reliably solves black-clothing-in-low-light pose detection. Part 1 helps when conditions are decent; Part 2 (keyboard) is the *reliability guarantee* that the app is always usable. Lighting and camera framing remain the highest-impact lever and are the user's to control.

## Future work
- Auto-prompt the keyboard option after repeated calibration failure (Option C), on top of today's manual button.
- A small "Keyboard pedals" indicator on the driving screen so the active mode is visible.
- The button labels are Japanese; fold into the planned language-chooser i18n work.
