# Task B7c brief — lesson grading + checkpoints + tutorial (completes plan task B7)

Parent plan task (verbatim): **B7 Lessons + checkpoints + tutorial + free mode.** Port all nine lessons, briefings, stop/mirror checkpoints, the tutorial flow, and free mode. Acceptance: each lesson is completable and graded; tutorial runs.

B7b (done) delivered the shell: store-driven screens, home + lesson select + briefing overlay, store-wired DriveScreenCanvas, free mode. THIS task (B7c) makes lessons complete and grade, and makes the tutorial run.

## Scope

1. **Goal detection + mission completion.** While `missionState === "active"` on the driving screen, feed the car's position each frame into the existing pure mission logic: `checkMissionGoal` (`src/lib/mission/missions.ts`) for the current lesson's goal; on goal → `missionState: "success"`, compute the score, transition to the feedback screen. Reference wiring: the original `src/hooks/useMission.ts` (100 lines, engine-agnostic — adapt or reuse it; it is in-branch code) + `src/components/simulation/MissionController.tsx`. Fail path per original semantics (check useMission for what triggers "failed" — e.g. checkpoint hard-fail) → feedback screen with failure.
2. **Checkpoints.** Drive `evaluateCheckpoint` (`src/lib/mission/checkpointEval.ts`) with `MISSION_CHECKPOINTS` for lessons that define them (stop / mirror / speed-limit / safety-check types). Mirror/safety checkpoints in the ORIGINAL use webcam head-pose (headRotation in store) — webcam arrives in B11; per the original's keyboard-fallback behavior check how checkpoints degrade without vision and match that (if the original requires head movement that keyboard can't provide, use the store's headRotation as-is — B11 will feed it; do NOT invent a new bypass. Verify what the original does with no camera and mirror checkpoints, and mirror that behavior faithfully — document what you found in the report). The B5b rearview mirror's `handle.mirror.setActive/isActive` hook is available if the original toggles mirror UI relevance.
3. **Scoring.** On success/failure, `calculateMissionScore` (`src/lib/scoring.ts`) with the inputs the original feeds it (see useMission/FeedbackScreen usage); store the result the same way the original does (check store fields / how FeedbackScreen reads it) so B8's real feedback screen can render it. Extend the B7b placeholder feedback screen minimally to show score total + per-checkpoint results (B8 does the full design).
4. **Off-track integration.** The world's `isOffTrack` already feeds the store (B7b). Match the original's off-track consequences during active missions (feedback message; penalty via scoring input if the original does that).
5. **Tutorial flow.** Port the tutorial so it "runs": reference `src/components/ui/TutorialScreen.tsx` (+ `TutorialPlainScene.tsx`). Rebuild Babylon-native/DOM-native as appropriate — do not import R3F components. Both languages.
6. **Every graded lesson completable.** All 8 graded lessons (straight, left-turn, right-turn, s-curve, crank, traffic-light, crosswalk, railroad-crossing) must be startable, drivable to their goal, and graded. NOTE the world (B5) currently has a straight course + approximate turn stubs; lessons whose course geometry doesn't exist yet in the Babylon world must still complete via their course.ts/missions.ts coordinates (goals/checkpoints are pure-coordinate logic — the car can drive anywhere on/off the visible road; off-track detection may flag legitimately unbuilt zones, note it). If a lesson's goal genuinely cannot be reached (e.g. blocked by collision geometry), report it — do not silently reshape the world; world build-out is tracked separately.

## Global constraints
- 60 fps at 1920x1200 headed on the driving screen with grading active.
- Coordinate/scoring contract (QA-critical): goals/checkpoints/scoring must use the in-tree pure modules UNCHANGED (course.ts, missions.ts, checkpointEval.ts, scoring.ts) so a known replay reproduces the same score as the original app. Do not fork or edit these modules; if something seems to require editing them, STOP and return NEEDS_CONTEXT.
- Test discipline (D1.a): new pure glue logic (e.g. per-frame mission-progress reducer) ships with `node --test` coverage; React/Babylon wiring exempt. 111/111 existing tests must not regress.
- Preserve: B5b mirror hook, registerBuiltInLoaders, Havok side-effect import, strict-mode-safe teardown, fail-soft Firebase (no Firebase here).
- Both languages on all new UI text (tutorial, feedback additions, off-track messages) — use the original's strings as reference.

## Verification loop
- Dev server ALREADY RUNNING on http://localhost:3000 (hot reload). No second `next dev`; no `npm run build`.
- Headed real-GPU Playwright scripts in `.claude/skills/run-driving/shots/` (see existing `shot-*.mjs`; seed `localStorage.language` to skip the picker). Drive the STRAIGHT lesson start→goal via keyboard automation and screenshot the success → feedback-with-score path; READ the PNGs. Cite `__driveDebug`/store evidence (missionState transitions, score object).
- Programmatic sweep: for each of the 8 graded lessons, start it and verify goal detection fires when the car reaches the goal coordinates (teleporting the car via a debug hook is acceptable for the sweep if driving each is impractical — if you add a debug teleport, gate it the same way `__driveDebug` is exposed and say so).
- Tutorial: walk it headed in both languages; screenshot each step; READ them.
- Gates before committing: `npm run type-check`, `npm run lint`, `npm test`.

## Report contract
Write your full report to `.superpowers/sdd/task-b7c-report.md` (wiring decisions incl. what the original does for mirror checkpoints without camera, per-lesson sweep results, screenshot paths + contents, gate outputs). Commit on the current branch (a few coherent commits fine; conventional messages, Co-Authored-By your model). Return ONLY: status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), commit sha(s), one-line test summary, concerns.
