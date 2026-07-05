# Task B8 brief — HUD + feedback/replay-review screens

Plan task (verbatim): **B8 HUD + feedback/replay-review screens.** Speed/gear/throttle HUD, off-track/feedback overlays, and the feedback / replay-review screen with scoring display. Acceptance: HUD reads live state; review screen plays a recorded run.

## Already built (don't rebuild — extend)
- B7b/B7c product shell: `src/components/babylon/product/` — DrivingScreen has a basic HUD (speed km/h + gear + OFF TRACK badge), checkpoint toasts (`drivingFeedback`), briefing overlay; FeedbackScreen.tsx shows score/clear-time/kaizen/per-checkpoint results with Retry/Home.
- Mission runtime records `replayData` frames to the store during graded lessons (set before scoring on success — see `missionRuntime.ts`).
- B5b rearview mirror renders in-scene (`rearviewMirror.ts`, `handle.mirror`).

## Scope

1. **Drive HUD to product level** (reference: original `src/components/ui/Dashboard.tsx` — rewrite, don't import): add throttle/brake indication (live from store), steering indication, and keep speed/gear/off-track. Both languages. Fix the known HUD nits while you're in there: the bottom-left key-hint clipping (left edge cut off, pre-existing), and the driving screen showing the raw LessonId ("left-turn") as subtitle — show the localized lesson title from `lessonCatalog`.
2. **Rearview mirror frame**: give the B5b mirror overlay a visible frame/border so it reads as a mirror against sky (was a review finding).
3. **Replay-review on the feedback screen**: after a graded run, the feedback screen must PLAY BACK the recorded run in a Babylon scene — the car moving through the world following `replayData`, with timestamp-interpolated playback using the frozen `src/lib/replay.ts` helpers (do NOT edit that module; it has tests). Support the store's `replayViewMode` ("chase" | "driver") toggle. Reference semantics: original `src/components/ui/FeedbackScreen.tsx` + `src/components/simulation/*` replay wiring. Playback car can be the box car (hero-car swap is a later polish); world = the existing driveWorld build. Loop or replay-once per original semantics (check the original; match it).
4. **Off-track/feedback overlays**: keep/refine the existing toasts; add whatever the original Dashboard showed for feedback that's still missing (check `useDrivingFeedback.ts` usage).

## Global constraints
- 60 fps at 1920x1200 headed on the driving screen with full HUD; the replay scene must also hold 60 fps.
- Frozen modules stay untouched: course.ts, missions.ts, checkpointEval.ts, scoring.ts, replay.ts, store.ts contract (adding NEW engine-agnostic store fields is allowed only if genuinely needed — prefer not).
- Test discipline (D1.a): new pure logic (e.g. replay-cursor stepping if you add glue beyond replay.ts) ships with `node --test` coverage; UI wiring exempt. 124/124 tests must not regress.
- Preserve: mirror hook, registerBuiltInLoaders, Havok side-effect + fresh-plugin-per-scene, strict-mode `disposed`-guard teardown, fail-soft Firebase.
- Both languages for all new UI text.

## Verification loop
- Dev server ALREADY RUNNING on http://localhost:3000 (hot reload, this worktree). Do not start another `next dev`; do not run `npm run build`.
- NEVER issue a foreground Bash call that runs >115s — the harness backgrounds it and you'll stall. Split long Playwright drives into short runs or poll the background output file with Read.
- Headed real-GPU Playwright scripts in `.claude/skills/run-driving/shots/` (see `shot-b7c-straight.mjs` for the working flow driver — reuse its pattern). Verify: HUD shows live throttle/steer while driving (screenshot mid-drive with W held); complete the straight lesson → feedback screen → replay PLAYS (screenshot at two different playback timestamps showing the car at different world positions — that is the acceptance evidence); chase/driver toggle changes the camera (screenshots). READ every PNG you cite.
- Gates before committing: `npm run type-check`, `npm run lint`, `npm test`.

## Report contract
Write your full report to `.superpowers/sdd/task-b8-report.md`. Commit on the current branch (coherent commits fine). Return ONLY: status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), commit sha(s), one-line test summary, concerns.
