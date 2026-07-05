# Task B6 brief (verbatim from docs/superpowers/plans/2026-07-01-e1-babylon-full-port.md)

**B6 Controls + reverse gear.** Keyboard drive (throttle/brake/steer), reverse gear (P/D/R), and the follow camera. Acceptance: all inputs move the car correctly incl. reverse.

## Reference semantics from the original app (rewrite per D1.a — match the CONTRACT, not the code)

- Keyboard (original `src/components/simulation/KeyboardControls.tsx` on main): W/ArrowUp = gas (0/1), S/ArrowDown = brake (0/1), A/ArrowLeft = steer left, D/ArrowRight = steer right at partial magnitude 0.6 (physics applies its own curve on top). Single-char keys normalized to lowercase so Caps/Shift WASD works. Keyboard steering is the fallback; the webcam (B11) will override steering when active.
- Gear is a store-level state `"P" | "D" | "R"`, default `"D"`. Semantics: D = forward drive force; R = drive force reversed; P = no drive force (car holds/rolls to stop under brake/friction). Steering yaw is NOT inverted in reverse (turning the wheel left yaws the body CCW in both D and R — physically emergent in a raycast vehicle, but verify it holds).
- In the original, gear changes come from webcam hand gestures (B11 here) and there is NO keyboard gear input. This branch needs a keyboard gear input NOW so B6 is drive-testable: pick a sane mapping and document it in the on-screen key hint. CONSTRAINT: the current /drive scene binds `R` = reset car — if you use `r` for reverse, move reset to another key; whatever you choose, the on-screen hint at the bottom of /drive must reflect the final mapping.
- Existing branch state: `driveScene.ts` already has keyboard gas/brake/steer + follow camera from B4/B5 (test-scene style) and `raycastVehicle.ts` applies drive/steer/brake forces. B6's job is to bring these to the product contract above: proper gear state machine influencing drive force sign/zero, clean input module (not test-scene inline hacks) that B11's webcam layer can later feed the same way the keyboard does, and follow-camera behavior that stays correct while reversing (camera stays behind the car's FRONT orientation — do not flip the camera in reverse).

## Global constraints that bind this task
- 60 fps at 1920x1200 on Arc 140T (headed) with everything on.
- Coordinate contract: X=right, −Z=forward, Y=up; do not disturb world layout, `src/lib/driveLayout.ts`, or its tests.
- Test discipline (D1.a): new pure logic (gear state machine, input→force mapping decisions, steering normalization) ships with `node --test` coverage in a Babylon-free module; rendering/scene wiring is exempt. 82/82 tests must not regress.
- Do not regress: mirror (B5b) must keep rendering; `registerBuiltInLoaders()` and Havok side-effect imports stay.

## Verification loop
- Dev server ALREADY RUNNING on http://localhost:3000 (hot reload, this worktree). Do not start another `next dev`; do not run `npm run build`.
- Headed real-GPU screenshots via `.claude/skills/run-driving/shots/shot-drive-headed.mjs <out.png>` (1280x800) and `shot-drive-headed-1920.mjs` (1920x1200). Write your own Playwright variant in that gitignored dir to drive: hold gas, verify z decreases (forward = −Z) via `window.__driveDebug.getState()`; switch to R, hold gas, verify z increases (backward) and steering yaw direction is unchanged; switch to P, hold gas, verify no drive (position ~static); verify brake stops the car. Cite the numbers in your report.
- READ your screenshots: follow camera stays behind the car in reverse; on-screen key hint shows the new mapping; mirror still renders; FPS readout 60.
- Gates before committing: `npm run type-check`, `npm run lint`, `npm test`.

## Report contract
Write your full report to `.superpowers/sdd/task-b6-report.md` (key mapping chosen and why, gear semantics evidence numbers, screenshot paths, gate outputs). Commit on the current branch (conventional message, Co-Authored-By your model). Return ONLY: status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), commit sha(s), one-line test summary, concerns.
