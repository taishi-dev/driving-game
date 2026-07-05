# B5 fix brief — /drive world renders broken on real GPU

## Context (one paragraph)
Branch `E1-babylon/feature/full-port` (worktree `C:\Users\taish\code\driving\.worktrees\E1-babylon`) is a full port of the driving app to Babylon.js + Havok. Task B5 (commit 392b20d) assembled a drivable world from Quaternius GLB tiles in `src/components/babylon/driveWorld.ts`, consumed by `src/components/babylon/driveScene.ts` and mounted by `src/components/babylon/DriveCanvas.tsx` at route `/drive`. Type-check/lint/tests/build were green, but the first headed (real-GPU) visual check fails.

## Observed evidence (reproducible — two runs, identical)

Screenshots (LOOK at these first):
- `.claude/skills/run-driving/shots/drive-headed.png`
- `.claude/skills/run-driving/shots/drive-headed-2.png`

Symptoms visible in the shots:
1. Road tiles float at inconsistent heights with large gaps; the world is not a continuous road surface. The car (red test box from B4 — the box chassis itself is expected at this stage) hangs in mid-air relative to the visible geometry, while the follow camera appears to be BELOW road level looking up (horizon near bottom, sky fills the frame).
2. All world surfaces carry a strong red-to-grey gradient that does not look like the Quaternius source textures (suspect: vertex colors, wrong material/texture binding after thin-instancing, or missing environment lighting).
3. Deterministic console error on every load:
   `[DriveCanvas] scene init failed: RuntimeError: Unable to load from /models3d/world/quaternius/Street_Curve_2Lane_Curb.glb: Scene has been disposed`
   Likely React strict-mode double-mount: the first effect's scene is disposed while its async world load is in flight. Determine whether the error is just noise from the disposed first scene or whether it ABORTS part of the surviving scene's world build (note `driveScene.ts` init may throw partway, leaving a partial world — which would explain symptom 1).

Physics debug state at rest (from `window.__driveDebug.getState()`): `{"x":1.67,"y":0.46,"z":9.39,"grounded":true,"offTrack":false,"debug":{"groundedWheels":4,...}}` — physics thinks the car sits on a surface at spawn even though the visuals are broken.

## Your job
Use the systematic-debugging skill: find the root cause(s) of the three symptoms BEFORE changing code. Then fix so that:
- `/drive` shows a coherent, continuous Quaternius road (straight ~Z +24..-204 plus the turn stubs per commit 392b20d's layout) with curbs/buildings/props sitting on the ground plane at consistent heights, correctly textured (no red gradient), under the HDRI environment lighting used in the showroom scene.
- The follow camera frames the car from behind/above, road visible ahead.
- No console errors on load (make scene init abort-safe under strict-mode double-mount; aborted first-mount loads must not log as failures or corrupt the second mount).
- The B5 coordinate contract still holds: X=right, −Z=forward, Y=up, surface at Y=0; checkpoint (0,0,−90) stays inside the road strip |X|<3, Z∈[−204,24].

## Repro / verification loop
- A dev server is ALREADY RUNNING on http://localhost:3000 serving this worktree (background process from the controller). Hot reload is on. Do not start a second `next dev` (it fails on `.next/dev/lock`). Do NOT run `npm run build` while it's up.
- Headed real-GPU screenshot (headless renders differently — never judge visuals headless):
  `export PATH="$PATH:/c/Program Files/nodejs" && cd <worktree> && node .claude/skills/run-driving/shots/shot-drive-headed.mjs .claude/skills/run-driving/shots/<name>.png`
  The script also prints `driveState` and console errors. READ the PNG with your image-capable Read tool after each iteration.
- Gates before committing: `npm run type-check`, `npm run lint`, `npm test` (65 unit tests). Skip `npm run build` (dev server holds the lock); the controller will run it.

## Report contract
Write your full report to `.superpowers/sdd/b5-fix-report.md` (root cause per symptom, fix description, final screenshot path, gate outputs). Commit your fix on the current branch (conventional message, `Co-Authored-By` your model). Return ONLY: status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), commit sha(s), one-line test summary, and any concerns.
