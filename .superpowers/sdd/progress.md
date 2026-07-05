# E1-babylon full-port — SDD progress ledger

Plan: docs/superpowers/plans/2026-07-01-e1-babylon-full-port.md
Branch: E1-babylon/feature/full-port (worktree .worktrees/E1-babylon)

- Task B1: complete (commit eaaf176, scaffold + /showroom route)
- Task B2: complete (commit 0e4293b, HDRI showroom + static hero camera; user confirmed visuals)
- Task B3: complete (commits 6eb8e94 + d31765d, clearcoat CarConcept; user confirmed "looks great")
- Task B4: complete (commit 8faef15, hand-built Havok raycast vehicle at /drive; motion verified via headless physics-position reads)
- Task B5: complete (commits 392b20d + fixes 4ae8e93, 71d009d; review clean 2026-07-02). Headed real-GPU verified: continuous textured road, car grounded, follow camera, 60 FPS, no console errors. Instancing via createInstance() on geometry primitives (draw calls 149→85); coordinate contract derived in pure src/lib/driveLayout.ts + tests/driveLayout.test.ts (69/69 tests); build clean.

- Task B5b: complete (commit 425da05, review approved after controller closed the one Important finding by direct measurement: 60 FPS readout confirmed at 1920x1200 headed with mirror on, screenshot drive-b5b-1920.png, no console errors). RTT rear camera chassis-parented, horizontal mirror flip verified by reviewer via independent derivation; B7 hook = handle.mirror.setActive/isActive (setActive(false) removes RTT from customRenderTargets). 82/82 tests.

- Task B6: complete (commits 0b724f2 + dc7e5c0; review approved, re-review clean). Keyboard W/↑ S/↓ A/D/←→ (steer ±0.6, lowercase-normalized), gear P/D/R on keys 1/2/3 (R stays reset), P = zero drive force at physics layer, D→−Z / R→+Z verified with numbers; yaw direction flips with gear (adjudicated correct — original app's steeringYawDelta × direction does the same; carPhysics.ts comment on main is misleading). Pure module src/lib/driveControls.ts + tests (105/105). __driveDebug exposes gear. B11 note: webcam layer feeds Gear/driveThrottleForGear/computeSteer exports, and steer SIGNAL is gear-invariant, yaw is not.

Task B7 decomposition (controller decision, revised): B7a is unnecessary — the pure core (src/lib/{course,scoring,store,replay}.ts, src/lib/mission/*, src/lib/vision/*) plus its node --test suites is already in-tree on this branch and green (inherited at branch point). ADJUDICATION on D1.a: "no shared core" bars sharing across the three ENGINE branches; the in-branch copies are this branch's own core, kept verbatim to guarantee the QA-critical identical-scoring contract. Engine-coupled logic (layout/mirror/controls, etc.) is genuinely rewritten with new suites as tasks proceed. FLAG PROMINENTLY at final review / to the user: this reads "rewrite ALL logic" loosely for the engine-agnostic pure modules.
- B7b: app shell — replace root route's R3F app with Babylon product: store-driven ScreenId flow, home w/ lesson select + showroom hero, briefing overlay, DriveCanvas wired to store (keyboard→store→vehicle, speed back), free mode; auth/history screens stubbed until B10.
- B7c: grading integration — checkMissionGoal, evaluateCheckpoint checkpoints (stop/mirror/speed-limit/safety-check; mirror uses B5b handle.mirror), missionState machine to success/failed, calculateMissionScore, off-track feedback, tutorial flow.

- Task B7b: complete (commits fc63592 + 255b7a5 + a197d4c; review approved, 0 Critical/0 Important). `/` is now the Babylon product shell (7 screens, store-driven); home = showroom hero + 9 LessonIds + tutorial + free mode; DriveScreenCanvas store-wired; Havok fixed to fresh-plugin-per-scene (WASM module cached). 111/111 tests.

- Task B7c: complete (commits a9b045e + 96d6be5; review approved 0C/0I). Grading runtime (pure src/lib/mission/missionGrading.ts + Babylon missionRuntime.ts) is a faithful port of useMission; frozen modules + store contract untouched; feedback screen with original score formula; DOM tutorial ja/en; 124/124 tests. Physics: root-caused neutral-steer veer (order-dependent Havok velocity reads → pre-step snapshot fix) + speed capped ~59 km/h via drag. Controller independently verified straight lesson end-to-end (100/100, 60fps, no errors). B7 (B7b+B7c) COMPLETE.

OPEN ITEM (world build-out, pre-B12): s-curve/crank/crosswalk/traffic-light/railroad goals lie beyond the built road — reachable over flat safety ground but shows OFF TRACK in unbuilt zones; traffic light is a DOM widget (no 3D model). The B5 world only built the straight + turn stubs. Needs a world build-out pass before the branch is called feature-parity.

- Task B8: complete (commit 03f93c3; review approved 0C/0I). Product HUD (throttle/brake/steer live bars, localized lesson title, unclipped key hint), mirror bezel (math exactly matches RTT viewport), feedback replay scene (reuses buildDriveWorld, kinematic car, frozen replay.ts interpolation, loop-on-done matching original Car.tsx, chase/driver via store replayViewMode). 126/126 tests. Controller verified end-to-end with screenshots.

- Task B9: complete (commits a50cd4e + 6a04a13; review approved after fix round). Full ja/en parity all product screens; 4 known defects + 1 new (frozen cp.label leak → bilingual CHECKPOINT_NAMES map) fixed; shared pure src/lib/uiStrings.ts (appTitle/backToHome/exitToHome — へ on driving exit, に elsewhere, matching original per-screen usage); 信号機 canonical; parity/completeness tests. 135/135 tests. Technical tokens (LEVEL/BASIC/km/h/STATUS:) stay English per original fidelity.

- Task B10: complete (commit 3802e3d; review approved 0C/0I). AuthScreen/HistoryScreen real (StubScreens deleted), FeedbackScreen saves to mission_logs (6-field record byte-compatible with original, pinned by deepEqual test), history query identical (userId where + timestamp desc + limit 10, matches deployed owner-isolation rules + composite index), session restore via onAuthStateChanged, every touchpoint null-guarded (fail-soft verified 35/35 checks, zero config). 142/142 tests. LIMITATION: real-config login/save/fetch not executable here — smoke-test once on first real-config deploy.
- NOTE: dev server on :3000 now runs with NEXT_PUBLIC_E2E=1 (store hook double-gated by ?e2e param).

- Task B11: complete (commits 52786b9 + 200af7e + e3bf8db + 739a9db; review approved 0C/0I). Product VisionController (591 lines, single-effect, strict-mode-safe camera lifecycle — cleaner than original), line-level fidelity verified both sides (hands→steer+gear, face→headRotation/gaze, feet→pedals via calibration machine; nothing-detected = setSteering(0) each frame + NO pedal writes uncalibrated → keyboard authoritative). visionStatus.ts pure module + 9 tests. e2e 5/5 (headed vision spec CI-gated; headless fallback spec localized + teleport-aided). 151/151 unit tests. Initial e2e failures were harness issues (TFLite stderr noise; SwiftShader 1FPS + physics clamp) — proven, not patched.

- Task B12: complete (final perf/measurement/cleanup pass). Measured headed on the Arc 140T @1920×1200: home/keyboard-drive/replay = 60 fps; vision-active drive = 29 fps median (MediaPipe-bound — identical scene is 60 fps keyboard-only). Download to drive-ready = 32.58 MB (models 2.97, HDRI 5.20, Draco 0.07, MediaPipe 22.38, appjs 1.29, other 0.66); first-interactive 7.48 MB; PASS ≤50 MB. PERF/SIZE lever: dropped the debug-only MediaPipe object detector (−6.92 MB, vision 20→29 fps; steeringGear.ts proved it's debug-string-only — driving byte-identical). Pose-lite / Babylon freezes / SceneOptimizer evaluated + rejected (risk / no benefit on a MediaPipe-bound surface / freezeActiveMeshes unsafe under a moving camera). Physics dt-clamp audit: all scored quantities are wall-clock (Date.now clear-time + timestamp-interpolated replay) or position/speed thresholds — no FPS-dependent scoring error. Cleanup roll-up ALL cleared (see below). Decision: `__driveDebug`+`__replayDebug` now gated like `__drivingStore` (build-time NEXT_PUBLIC_E2E + runtime ?e2e). Gates: type-check PASS, lint 0 errors, unit 151/151, e2e 5/5, both builds clean. Report: .superpowers/sdd/task-b12-report.md. KNOWN GAPS recorded in the checklist (world build-out, DOM traffic light, box hero car in drive/replay, real-webcam + Firebase-config smoke pending).

Minor findings roll-up (for final review / later tasks) — ALL B12 items RESOLVED (see B12 entry):
- B11: cleanup comment claims steering reset on unmount but code doesn't setSteering(0) — fix comment or add reset (B12).
- B11: tutorial camera-denied Retry button unreachable (pointer-events-none wrapper) — check in drive-test.
- B11 → B12 inputs: FPS with vision 16-18 on DEV build (re-measure production; candidates: drop object detector −4.5MB, pose lite); MediaPipe CDN ~25-30MB counts toward download budget; CI real-time-drive coverage now thinner (teleport-aided).
- USER DRIVE-TEST REQUIRED: real webcam (hands steer, gear gestures, feet pedals, face→mirror checkpoints now clearable), vision-owns-steering feel.
- B10: store-cached save item carries extra userId at runtime (mirrors original) — completeness note only.
- B9: uiStrings.ts header comment tells stale story (pre-exitToHome) — prose fix at B12 cleanup.
- B9: B10's History screen should port bilingual STRINGS from original ui/HistoryScreen.tsx.
- B8: mirror/CHASSIS constants duplicated in DrivingScreen.tsx + replayScene.ts instead of exported from rearviewMirror.ts/driveScene.ts — export + import to prevent silent desync (B12 cleanup).
- B8: replayScene dispose order differs stylistically from DriveScreenCanvas — harmless.
- B8: FeedbackScreen right column not re-indented after wrapper change — cosmetic.
- B7c: neutral-steer stabilizer (rate-proportional damping, gated |steer|<0.01) — legitimate but revisit in 9.B feel pass; diag-drift.mjs kept as probe.
- B7c: traffic-light cycle starts at canvas mount, logs wiped by setMissionState("active") — red-light scoring edge case (unreachable without webcam today).
- B7c: EN tutorial shows hardcoded Japanese commas (、) in step 1 — cosmetic, B9.
- B7c: per-frame allocations in grading loop + physics step (GC pressure; 60fps verified anyway) — B12 candidate.
- B7c: mirror/safety checkpoints never clear without webcam (faithful to original; B11 wires vision; per-miss penalty is 25 not 20 — report prose only).
- B7b: home card desc/sub strings are English-only (ja parity) — B9.
- B7b: driving screen shows raw LessonId ("left-turn") as subtitle — localize in B8/B9.
- B7b: car drivable behind briefing overlay (W moves car pre-Start) — polish in B7c/B8.
- B7b: hero car rear badge renders mirrored (handedness artifact in showroomScene, pre-existing from B2/B3) — cosmetic, showroom-scene fix later.
- B7b: __driveDebug exposed unconditionally in production (unlike gated __drivingStore) — consider gating for consistency at B12.
- B7b: three near-duplicate per-screen STRINGS blocks; label drift ja "信号" (card) vs "信号機" (briefing) — consolidate in B9.
- B6: on-screen key hint clipped at left edge (pre-existing B5b CSS) — fix in B8 HUD pass.
- B5b: mirror overlay has no visible frame/border — blends into sky; polish in B8 HUD pass.
- B5b: uiCam still costs a near-empty render pass when mirror inactive — fold into B12 accounting.
- B5b: future UI-only content must replicate the MIRROR_UI_LAYER (0x10000000) layerMask convention.
- B5b: mirror mount constants tuned for placeholder box chassis — revisit when hero car replaces it.
- B7 must derive checkpoints from course data (getCoursePath), not re-hardcode STRAIGHT_CHECKPOINT literal (driveLayout.ts).
- driveWorld.ts dispose(): templates disposed before tile roots — harmless (idempotent) but reverse order is tidier.
- isOffTrack() turn zones are radial-distance stopgaps (would false-flag near turn segment far ends); proper course-path distance due by B12; not consumed by scoring yet.
- Possible collision gap Z∈(−35,−33), |X|>3 near curve tiles (relies on safety net) — exercise during B7 turn lessons.
- Turn-stub curve arcs are approximate connectors (Quaternius curve tile geometry occupies corner quadrant) — cosmetic.
- Controller visual note: road reads as alternating sidewalk/asphalt bands along the travel direction — verify tile selection/orientation intent during B7; cosmetic.

- Task B12: complete (commits a038fff + a7baef2 + f8f594d; review approved 0C/0I). Production measurements (headed Arc 140T 1920x1200): home/keyboard-drive/replay 60fps; vision-active drive 29fps median (MediaPipe-bound; object detector dropped: 20→29fps, −6.9MB). Download 32.58MB ≤ 50MB budget (first-interactive 7.48MB). Cleanup roll-up fully executed; __driveDebug/__replayDebug gated like __drivingStore; known gaps recorded in checklist.
- FINAL WHOLE-BRANCH REVIEW (5aeffac..f8f594d): 0 Critical; 3 Important found and FIXED in 038b1a1 (stale headRotation/gaze reset on unmount + per-run at briefing Start; pure vehicleKernel.ts extracted + 8 tests, checklist §11.3 corrected; HUD steer display canonicalized to ±1.0 matching original UI). Re-review verdict: READY — branch stands as the completed E1 candidate. 159/159 unit, e2e 5/5, type-check/lint/build clean.
- BRANCH STATUS: E1 COMPLETE at 038b1a1. Per parent plan: stays UNMERGED until the three-engine trial concludes (only winner→main). Pending human items: real-webcam drive-test; Firebase real-config smoke; standing recorded gaps (world build-out, DOM traffic light, box hero car in drive/replay, vehicleKernel test constants mirror VEHICLE_TUNING).
