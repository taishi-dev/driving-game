# Task B7c report — lesson grading + checkpoints + scoring + tutorial

Status: **DONE_WITH_CONCERNS** (all acceptance criteria met; concerns are world build-out gaps + a documented vehicle stabilizer, listed at the end).

Commits (branch `E1-babylon/feature/full-port`):

- `a9b045e` fix(babylon): root-cause the neutral-steer veer + cap speed at lesson limit
- `96d6be5` feat(babylon): lesson grading, checkpoints, scoring + tutorial flow (B7c)

(This report itself is not committed: `.superpowers/` is gitignored, matching
every prior task report on this branch.)

## 1. What was built

### Pure grading reducer — `src/lib/mission/missionGrading.ts` (+ `tests/missionGrading.test.ts`, 13 tests)

The engine-agnostic per-frame heart of the original `useMission`: goal check first
(short-circuits, preserving useMission's early-return order), then checkpoint
clearing over the lesson's `scored !== false` entries with the safety-check
left/right latch threaded across frames. Calls the FROZEN modules
(`checkMissionGoal`, `evaluateCheckpoint`, `MISSION_CHECKPOINTS`) unchanged —
none of course.ts / missions.ts / checkpointEval.ts / scoring.ts were edited.
`gradingSpeedFromMetersPerSec` pins the unit contract: original speed unit
u = km/h / 100, so the frozen stop test `|speed| < 0.02` still means 2 km/h.

### Mission runtime — `src/components/babylon/product/missionRuntime.ts`

Babylon-side wiring stepped once per rendered frame from `DriveScreenCanvas`:

- Guards exactly like the original: only while `missionState === "active"`, not
  paused, not replaying, never free-mode.
- Records `ReplayFrame`s per the original Car.tsx contract (`timestamp`,
  position, rotation, `steering`, `speed` in km/h, `headRotation` snapshot).
  Rotation is the Babylon chassis euler — scoring only reads
  position/speed/timestamp, so the QA contract is unaffected; B8's replay
  should apply the euler as-is.
- Cleared checkpoint → `addClearedCheckpoint` + `setDrivingFeedback` toast
  cleared after 2 s (original timing; strings come verbatim from the frozen
  `evaluateCheckpoint`).
- Goal → `replayData` snapshot BEFORE scoring → `calculateMissionResult(getCoursePath(lesson))`
  (frozen scoring.ts via the untouched store action) → `setMissionState("success")`
  → `setScreen("feedback")` — the exact useMission order.
- Traffic-light lesson: runs the original `RoadProps` SIGNAL_CYCLE (green 7 s /
  yellow 2 s / red 6 s) and logs every state via `addSignalStateLog` with
  checkpointId `signal-1`, which is what scoring's red-light check replays.
  Strict-mode-safe: timers cleared in `dispose()`, called from the canvas's
  `disposed`-guard teardown.

### Wiring decisions ported as-found in the original (verified by reading the R3F code)

- **Mirror/safety checkpoints without a camera:** the original reads
  `store.headRotation` as-is; the keyboard fallback covers PEDALS ONLY (W/S) —
  there is no keyboard path for head pose. With no webcam, headYaw stays 0, so
  mirror checkpoints (|0 − (±0.5)| = 0.5, NOT < 0.5 tolerance) and safety-checks
  (need yaw > +0.3 AND < −0.3) can never clear, and each scores as a missed
  checkpoint (−20) at the end. I mirrored that faithfully — headRotation is
  consumed as-is (B11 will feed it), no invented bypass. Verified live: sweep
  scores below.
- **Fail path:** NOTHING in the original ever sets `missionState: "failed"` —
  no code path writes it. Runs end in success or the driver exits. Ported
  faithfully: no fail trigger. (The store's "failed" branch remains for B8+.)
- **Off-track consequences:** in the original R3F app nothing ever calls
  `setOffTrack` (the Dashboard WARNING overlay is dead code there); the real
  penalty is scoring's path-deviation over the replay frames. In the Babylon
  port the B7b canvas feeds `isOffTrack` → the HUD badge shows, and the
  deviation penalty comes from frozen scoring, matching the original's actual
  consequences. No extra penalty invented.
- **Mirror hook (B5b `handle.mirror`):** the original does not toggle mirror
  relevance per checkpoint (it removed the in-car mirror visual entirely and
  grades mirror checks purely by head yaw), so the rearview mirror stays always
  active; the hook is untouched and available.

### Screens

- `FeedbackScreen.tsx` (replaces the B7b stub): original score formula verbatim
  (`100 − Σ kaizen meta.penalty (default 5) − floor(deviationPenalty)`, clamp 0),
  clear time `mm:ss.cs` from missionStart/EndTime, the KAIZEN improvement list,
  and per-checkpoint cleared/missed rows (same filter as scoring's missed pass:
  `scored !== false` excluding the traffic-light signal). Retry → briefing →
  driving; Home → idle. Both languages. Full design + replay is B8; Firebase
  persistence is B10 (deliberately no Firebase import).
- `TutorialScreen.tsx` (replaces the B7b stub): DOM-native port of the original
  5 steps with the original STRINGS verbatim (both languages): intro, example
  video (`/videos/tutorial.mp4`), steering bar (live `steeringAngle`), pedal
  calibration (auto `startCalibration` on step 4 entry + keyboard-fallback
  toggle that also advances, exactly like the original), done → home. The
  VisionController camera background arrives with B11; the store wiring it
  feeds is identical.
- `DrivingScreen.tsx`: green checkpoint toast (original Dashboard styling).
- `DriveScreenCanvas.tsx`: mission runtime lifecycle; DOM traffic-signal widget
  (`data-testid=drive-signal`, driven by the runtime's cycle — the world has no
  3D signal model yet); `__driveDebug.getState()` extended with
  missionState/screen/lesson/clearedCheckpointIds/deviationPenalty and a new
  `__driveDebug.teleport(x, z)` (gated identically to the rest of the hook;
  used by the sweep only).

## 2. Vehicle drift + speed — root-caused and fixed (commit `a9b045e`)

First full-length keyboard drive exposed that the straight lesson was NOT
completable: holding W the car veered left off the road (~24 m of x drift over
160 m), reached 113 km/h, hit junction holes and tumbled off the world.
Systematic debugging (per-wheel slip/compression instrumentation, per-category
yaw-torque accounting, rest-state sampling) found:

- **Root cause of the veer:** the wheel loop re-fetched `getAngularVelocity()`
  per wheel while Havok applies already-issued forces to the body's velocities
  IMMEDIATELY — each wheel was computed from a state perturbed by the previous
  wheels, in fixed order. Deterministic left/right slip asymmetry (measured
  ±0.1 m/s, kinematically impossible from one rigid state; confirmed by
  recomputing the code's own equation from its logged inputs), whose grip
  forces yielded a constant ~85 N·m yaw torque. **Fix:** snapshot linear +
  angular velocity once per step. Verified: x = 0.000 over the full straight.
- **Speed:** soft cap was 30 m/s (~113 km/h) → now 15.5 m/s with stiffer
  over-cap drag ⇒ tops out at 59 km/h, matching the straight lesson's 60 km/h
  scoring band (coordinator-approved feel-contract change).
- Also fixed along the way (each independently correct): suspension force along
  the contact normal (was chassis-up), world-down suspension rays, linear
  low-speed ramp for rolling resistance/brake (sign() ratcheted a parked car
  sideways at 0.06 m/s on solver jitter), wheel rays target the flat invisible
  road colliders instead of the crowned visual tiles (+ corner-join collider
  fillers), and a neutral-steer-only stabilizer (yaw damp 3/s, lateral 2/s)
  so residual wobble can never rectify into a veer again.

## 3. Verification evidence (headed, real GPU, 1920×1200; dev server hot-reload)

Scripts (local-only, gitignored `.claude/skills/run-driving/shots/`):
`shot-b7c-straight.mjs`, `shot-b7c-sweep.mjs`, `shot-b7c-tutorial.mjs`,
`diag-drift.mjs` (kept — drift regression probe), `diag-toast.mjs`.

### Straight lesson driven start → goal by keyboard (`shot-b7c-straight.mjs`)

```
briefingVisible: true; start z=10, missionState active
midDrive: z=-76.4, speed 59 km/h, fps 60, offTrack false
reachedGoal: true; feedbackVisible: true
score "100/100", time "00:15.81", kaizen none (perfect); retryBriefing: true
console errors: none
```

Screenshots (READ):
- `b7c-straight-2-mid-drive.png` — car dead-center on the straight road at
  59 km/h, buildings both sides, rearview mirror shows the road behind.
- `b7c-straight-3-feedback.png` — feedback screen: Score 100/100, Clear Time
  00:15.81, "AI Instructor Feedback / Overall, an excellent drive!…",
  Checkpoints panel, Try Again + Back to Home.

### Per-lesson goal sweep (`shot-b7c-sweep.mjs`, teleport hook)

All 8 graded lessons: sceneReady ✓, missionState active ✓, goal detection fired
at the frozen MISSION_GOALS coordinates ✓, feedback screen with score ✓,
pageerrors: none. Scores match the frozen scoring + no-camera semantics:

| lesson | goal detected | score | checkpoints on feedback |
|---|---|---|---|
| straight | ✓ | ✓ (see full drive above) | none |
| left-turn | ✓ | 50/100 | stop-1 ✗, mirror-1 ✗ (no camera ⇒ −20 each, correct) |
| right-turn | ✓ | 50/100 | stop-1 ✗, mirror-1 ✗ (same) |
| s-curve | ✓ | 100/100 | none |
| crank | ✓ | 100/100 | none |
| traffic-light | ✓ | 100/100 | signal widget cycling (data-signal "green"→"yellow" verified) |
| crosswalk | ✓ | 75/100 | cw-safety-1 ✗ (no camera, −20 + deviation, correct) |
| railroad-crossing | ✓ | 100/100 | **rr-stop-1 ✓ cleared by physically stopping in the zone** |

Live checkpoint clearing: teleported to (0,−58), car settled to 0 km/h inside
the rr-stop-1 radius → `clearedCheckpointIds` contains `rr-stop-1`, toast
`"🛑 Stop OK!"` captured (`b7c-toast-rr-stop.png` — green-bordered popup over
the driving scene, speed 0, gear D). Feedback screenshot
`b7c-sweep-railroad-crossing-feedback.png`: 100/100 with
"Stop / Railroad Crossing Stop ✓ Cleared" row.

### Tutorial (`shot-b7c-tutorial.mjs`), EN + JA

Both languages: all 5 steps visible + screenshotted
(`b7c-tutorial-{en,ja}-step{1..5}.png` — READ en-step3 "Steering Basics" with
the live steering bar, ja-step4 "足のキャリブレーション" with pedal cards,
計測中 status and the keyboard-fallback link), back navigation works,
keyboard-fallback switch advances to step 5, Done returns Home, no page errors.

### Gates (all green, after final change)

- `npm run type-check` — clean.
- `npm run lint` — 0 errors (2 pre-existing warnings in original R3F files
  `ui/FeedbackScreen.tsx`, `vision/VisionController.tsx`, untouched).
- `npm run test:unit` — **124/124 pass** (111 existing, no regressions; 13 new
  missionGrading tests).
- 60 fps at 1920×1200 headed with grading active (fps read from `__driveDebug`
  mid-drive).

## 4. Concerns / notes for later tasks

1. **World geometry gaps (world build-out is tracked separately, per brief):**
   only the straight + approximate turn stubs exist. s-curve / crank /
   crosswalk / traffic-light / railroad-crossing goals sit off the visible road,
   so driving them manually crosses the invisible flat safety ground and the
   OFF TRACK badge shows (legitimately unbuilt zones). Goals/checkpoints are
   pure-coordinate and verified reachable (nothing blocks them — the visible
   world has no collision geometry on the paths).
2. **No 3D traffic light / stop-line visuals:** the signal is a DOM widget
   driven by the original cycle; signal logs + scoring behave like the
   original. 3D props belong to world build-out.
3. **Vehicle stabilizer:** the neutral-steer yaw/lateral damper is a documented
   feel choice on top of the root-cause fix; plan 9.B (feel pass) may retune.
   `diag-drift.mjs` is kept as a regression probe.
4. **Replay rotation convention:** frames store the Babylon chassis euler
   (yaw ≈ π when facing −Z, vs the original's 0). Scoring ignores rotation;
   B8's replay renderer should apply the recorded euler directly.
5. **Toast overlap:** consecutive checkpoint clears reuse the single
   drivingFeedback slot (original behavior).
6. **Sweep truncation:** the straight row of the sweep JSON was cut by the
   output tail; its goal detection is fully covered by the real keyboard drive.
