# Task B5b brief (verbatim from docs/superpowers/plans/2026-07-01-e1-babylon-full-port.md)

**B5b Rearview mirror.** RenderTargetTexture with a rear-facing camera onto a mirror-plane material; count its per-frame cost in B12. Acceptance: mirror shows the scene behind; graded mirror checkpoints work.

## Controller resolutions of ambiguity
- "Graded mirror checkpoints" belong to the lesson/scoring system, which arrives in B7 on this branch. The B5b-level acceptance is: the mirror renders the scene BEHIND the car correctly (RTT + rear-facing camera bound to the car), updates live as the car moves, and exposes a clean hook the B7 checkpoint system can query (e.g. a "mirror is visible/active" flag or glance-detection stays webcam-side — do NOT build checkpoint grading here).
- In the original Three.js app the mirror is a screen-space rearview mirror UI element at the top of the driving view (check `git show main:src/components/... ` only if needed for placement reference — but this branch is a rewrite; match the CONCEPT, not the code). A screen-space overlay plane at top-center of the /drive view showing the rear RTT is the expected shape; a 3D mirror glued to the car box is not required.
- Mirror RTT resolution: keep modest (e.g. 512x256-ish) — per-frame cost gets measured in B12; make the RTT render list the world + car, not UI.
- The rear camera must look backward (+Z when the car faces −Z), attached to the car's frame so it turns with the car, positioned roughly at the driver's mirror height.

## Global constraints that bind this task
- 60 fps at 1920x1200 on Arc 140T (headed, real-GPU measurement — not headless). The FPS readout must stay at 60 with the mirror on.
- Assets: only license-verified assets under `public/models3d/` and `assets/source/`.
- Coordinate contract: X=right, −Z=forward, Y=up; do not disturb the world layout or `src/lib/driveLayout.ts` contract (69/69 tests must stay green).
- Test discipline (D1.a): any new pure logic ships with `node --test` coverage; rendering-only code does not need unit tests.

## Verification loop
- Dev server ALREADY RUNNING on http://localhost:3000 with hot reload for this worktree. Do not start another `next dev`; do not run `npm run build`.
- Headed real-GPU screenshot: `export PATH="$PATH:/c/Program Files/nodejs" && cd <worktree> && node .claude/skills/run-driving/shots/shot-drive-headed.mjs .claude/skills/run-driving/shots/drive-b5b.png` — READ the PNG: the mirror overlay must show road/buildings RECEDING BEHIND the car (i.e. the +Z direction — at spawn that is the short tail of road behind the start), not a copy of the forward view.
- Stronger check: drive forward first so behind/ahead differ, then screenshot. The script `.claude/skills/run-driving/shots/shot-drive-headed.mjs` doesn't drive; write your own variant in the gitignored `.claude/skills/run-driving/shots/` dir that holds ArrowUp/W for a few seconds via Playwright keyboard before screenshotting (see `window.__driveDebug.getState()` for position evidence).
- Gates before committing: `npm run type-check`, `npm run lint`, `npm test` (69 passing now; must not regress).

## Report contract
Write your full report to `.superpowers/sdd/task-b5b-report.md` (what you built, screenshot paths + what they show, gate outputs, FPS evidence). Commit on the current branch (conventional message, Co-Authored-By your model). Return ONLY: status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), commit sha(s), one-line test summary, concerns.
