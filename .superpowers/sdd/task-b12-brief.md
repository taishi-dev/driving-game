# Task B12 brief — performance pass + measurement + cleanup (final task)

Plan task (verbatim): **B12 Performance pass + measurement + tests.** Tune to 60 fps at 1920x1200 (SceneOptimizer/HardwareScaling, instancing, freezes) [B-opt]; record measured fps and the true download size (car+world+Draco decoder+MediaPipe). Ensure the rewritten pure-logic `node --test` suites are green (D1.a). Acceptance: 60 fps on the Arc 140T, size recorded against the A4 checklist, all tests green, build/type-check/lint clean.

## Scope

1. **Production build + measurement (do this FIRST — it defines the real gaps).** Stop the dev server; `npm run build` (production, WITHOUT NEXT_PUBLIC_E2E) then `npm run start` (note: memory says `next start` can orphan port 3000 — kill by PID when done). Measure headed at 1920x1200 on the real GPU:
   - FPS on: home (showroom hero), driving screen keyboard-only, driving screen with vision running (fake webcam), replay on the feedback screen.
   - True download size to first interactive per the plan: car+world GLBs, Draco decoder, HDRI, JS bundles, and the MediaPipe WASM/models (~25-30MB CDN — measure actual transferred bytes via Playwright network capture or CDP). Budget: ≤ ~50MB. Record everything in the A4 checklist doc `docs/superpowers/specs/2026-06-30-engine-trial-checklist.md` (fill in the E1 column/section; commit that edit).
2. **Tune to 60 fps where short.** Known lever candidates (evidence first, then apply what's needed): drop the MediaPipe object detector (debug-string only, −4.5MB — check the original kept it only for debug; document the deviation if dropped) or switch pose model to `lite`; Babylon-side: `material.freeze()`, `mesh.freezeWorldMatrix()` on static world, `scene.freezeActiveMeshes()`, SceneOptimizer/HardwareScalingOptimization as last resort. Mirror RTT cost: measure with mirror toggled off vs on (handle.mirror.setActive). The vision FPS was 16-18 on the DEV build — production may be dramatically better; measure before touching anything.
3. **Physics/frame-rate audit:** driveScene clamps dt to 1/30 — verify lesson timing/scoring is wall-clock-correct at whatever FPS you land at (grading uses timestamps, but confirm).
4. **Cleanup roll-up (small, mechanical — from prior reviews; all listed in `.superpowers/sdd/progress.md` "Minor findings roll-up"):** export mirror/CHASSIS constants instead of duplicates (DrivingScreen/replayScene); fix the B11 cleanup comment-vs-code mismatch (add setSteering(0) on unmount or fix comment); driveWorld dispose order nit; uiStrings.ts stale header comment; FeedbackScreen indentation; consider gating `__driveDebug` like `__drivingStore` (decide + document).
5. **Full gate suite:** `npm run type-check`, `npm run lint`, `npm test` (151/151+), `npm run test:e2e` (headless fallback spec; the headed vision spec runs locally, not CI-gated here — run it too), build clean.
6. **KNOWN GAPS — do NOT fix here, just record in the checklist as open items:** world build-out gap (s-curve/crank/crosswalk/traffic-light/railroad areas unbuilt; goals reachable over safety ground but OFF TRACK); traffic light is a DOM widget; hero car is still the box in drive/replay scenes; real-webcam drive-test pending; Firebase real-config smoke pending. These are E1-branch conclusions the engine comparison needs recorded honestly.

## Global constraints
- Frozen modules untouched. No product behavior changes beyond documented perf levers.
- Keep 60 fps claims honest: if a surface can't reach 60 after reasonable tuning, record the real number + what was tried; don't over-optimize into risk. The comparison checklist values are the deliverable.
- Both e2e specs must still pass after any tuning.

## Verification loop
- You own the server lifecycle this task (production `next start`, kill by PID after). NEVER foreground >115s; poll background output files with Read; never end your turn waiting.
- Headed 1920x1200 measurements only (headless numbers are meaningless — SwiftShader).
- READ every screenshot/number you record into the checklist.

## Report contract
Write your full report to `.superpowers/sdd/task-b12-report.md` (all measurements before/after, levers applied with evidence, checklist updates, gate outputs). Commit code + checklist changes on the current branch. Return ONLY: status, commit sha(s), one-line test summary, headline numbers (fps per surface + total download MB), concerns.
