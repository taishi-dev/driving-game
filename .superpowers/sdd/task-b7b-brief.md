# Task B7b brief — Babylon product app shell (part of plan task B7)

Parent plan task (verbatim): **B7 Lessons + checkpoints + tutorial + free mode.** Port all nine lessons, briefings, stop/mirror checkpoints, the tutorial flow, and free mode. Acceptance: each lesson is completable and graded; tutorial runs.

Controller split: THIS task (B7b) delivers the app shell and screen flow. Checkpoint grading, goal detection, scoring, and the tutorial content flow are B7c (next task) — do NOT build grading here, but leave clear seams for it.

## Scope

Replace the root route (`/`) — currently the original React-Three-Fiber app — with the Babylon product shell:

1. **Store-driven screen flow.** Keep `src/lib/store.ts` (zustand) as THE state container — it is engine-agnostic and already in-tree. Screens per `ScreenId`: `language` (first-launch picker, persisted `localStorage.language`), `home`, `driving`, `feedback` (minimal placeholder until B8), `tutorial` (placeholder shell until B7c), `auth`/`history` (stub screens with a back button until B10). Mirror the original flow semantics (first launch with no saved language → language picker; afterwards → home).
2. **Home screen.** Lesson select for all nine `LessonId`s + free mode entry, language toggle, and the hero visual: reuse the existing Babylon showroom scene (`src/components/babylon/showroomScene.ts`, currently mounted at `/showroom`) as the home background — static hero shot, no auto-rotation. Match the original home's structure conceptually (title, lesson buttons, PLAYER/login header can be stubbed) — you are REWRITING the UI, not restyling the old components; do not import the old R3F components.
3. **Briefing overlay.** Selecting a lesson sets `currentLesson`, `missionState: "briefing"`, shows the lesson briefing (title/description per lesson, both languages, drawn from the original components' strings as reference), with a start button → `missionState: "active"` + screen `driving`.
4. **Driving screen = Babylon DriveCanvas wired to the store.** Replace the drive scene's local input state with the store contract: keyboard writes `setPedals`/`setSteering` (and gear via `setGear`) to the store; the scene consumes `steeringAngle`/`throttle`/`brake`/`gear` from the store each frame and writes `setSpeed` (rounded display value, only on change) and `setIsOffTrack` back. Keep `src/lib/driveControls.ts` as the pure layer. The `/drive` and `/showroom` test routes stay working (they may keep local input for standalone testing, or share the store — your call, document it).
5. **Free mode.** Enters driving with `currentLesson: "free-mode"`, no briefing, drivable indefinitely, exit back to home.
6. **Exit/pause.** A way back to home from driving (button and/or Escape), resetting mission state.

## Global constraints
- 60 fps at 1920x1200 on Arc 140T (headed) on the driving screen; home hero must not tank FPS either.
- Coordinate contract untouched; do not disturb driveWorld/driveLayout or their tests.
- Test discipline (D1.a): new pure logic ships with `node --test` coverage (e.g. any screen-flow reducer/helpers you extract); React/Babylon wiring is exempt. 105/105 existing tests must not regress.
- Preserve: B5b mirror + its `handle.mirror` hook; `registerBuiltInLoaders()`; Havok side-effect import; strict-mode-safe mount/teardown (`disposed` guard pattern).
- Both languages ja/en must work on every new screen (full parity audit is B9, but do not hardcode single-language strings).
- Firebase stays fail-soft: nothing you add may crash at import without config (auth/history stubs must not touch Firebase yet).

## Reference (in-tree, read as spec — do not import into new UI)
- Original shell: `src/components/ClientApp.tsx`, `src/components/screens/*` (HomeScreen, LanguageScreen, TutorialScreen, FeedbackScreen...), `src/components/simulation/KeyboardControls.tsx`.
- Store contract: `src/lib/store.ts` (ScreenId, MissionState, LessonId, actions).
- Existing Babylon pieces: `src/components/babylon/{showroomScene.ts,driveScene.ts,DriveCanvas.tsx,driveWorld.ts,rearviewMirror.ts,raycastVehicle.ts}`.

## Verification loop
- Dev server ALREADY RUNNING on http://localhost:3000 (hot reload, this worktree). Do not start another `next dev`; do not run `npm run build`.
- Headed real-GPU screenshots via the scripts in `.claude/skills/run-driving/shots/` (`shot-drive-headed.mjs`, `shot-drive-headed-1920.mjs`; write Playwright variants there for the new flow — seed `localStorage.language` via addInitScript to skip the picker, like the original driver does, or exercise the picker deliberately). READ every PNG you cite.
- Walk the flow end-to-end in the browser via Playwright: language picker (fresh profile) → home (hero + 9 lessons + free mode) → select "straight" → briefing (both languages) → start → driving (car drives via store-fed keyboard, mirror renders, FPS 60) → exit → home → free mode → drive → exit. Cite `__driveDebug` numbers for the store-wired drive (gas moves car, gear 3 reverses).
- Gates before committing: `npm run type-check`, `npm run lint`, `npm test`.

## Report contract
Write your full report to `.superpowers/sdd/task-b7b-report.md` (screens built, store wiring decisions, screenshot paths + what each shows, flow-walk evidence, gate outputs). Commit on the current branch — you may split into a few coherent commits if natural (conventional messages, Co-Authored-By your model). Return ONLY: status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), commit sha(s), one-line test summary, concerns.
