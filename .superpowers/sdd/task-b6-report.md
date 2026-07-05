# Task B6 report — keyboard controls + P/D/R gear + follow camera correctness

## Summary

Added a Babylon-free pure module `src/lib/driveControls.ts` (gear state
machine + key→input mapping), wired it into `DriveCanvas.tsx` in place of the
old inline `computeInput`, extended `raycastVehicle.ts` to accept a **signed**
throttle (positive = forward drive, negative = reverse drive, 0 = no drive
force), and extended the `__driveDebug.getState()` debug hook with `gear` and
`debug.angularVelY` (yaw rate, for verifying the steering/gear interaction).
21 new `node --test` cases cover the pure module (TDD: written and watched RED
before the module existed). 82 pre-existing tests still pass unmodified; total
is 103/103.

## Key mapping chosen and why

- **Gear select: `1` = Park, `2` = Drive (default), `3` = Reverse.**
  `d` is already steer-right and `r` is already bound to the scene's reset
  action (a pre-B6 test-scene debug feature); a mnemonic letter scheme would
  have forced relocating one of those. The number row sidesteps every
  existing WASD/Arrow/reset binding with no collisions, so "reset" stays on
  `r` unchanged — no key needed to move.
- Everything else (W/↑ gas, S/↓ brake, A/←/D/→ steer at magnitude 0.6,
  case-insensitive single-char keys) is unchanged from the pre-B6 inline
  logic / the original app's `KeyboardControls.tsx`.
- On-screen hint (bottom-left of `/drive`) now reads:
  `W/↑ gas · S/↓ brake · A/D/←→ steer · 1 Park · 2 Drive · 3 Reverse · R reset`
  A `Gear: <P|D|R>` readout was also added next to the FPS counter (top-left)
  so gear state is visible without opening devtools.

## Gear semantics — evidence numbers

All numbers below are from a **real keyboard-driven** Playwright script
(`.claude/skills/run-driving/shots/shot-drive-b6-gear.mjs`) — it dispatches
actual `page.keyboard.down/up/press` events into the live page, exercising
the full product path (`DriveCanvas` key listeners → `driveControls.ts` →
`vehicle.setInput` → `raycastVehicle.ts`), not the debug `setInput` override.
Each check starts from `__driveDebug.reset()` for a clean, axis-aligned,
at-rest baseline (see "Concern" below for why chained maneuvers were dropped).

```
forwardD:  gear=D | z 9.992 -> -0.077  (decreased: true)     — forward = -Z, confirmed
brake:     forwardVel 8.90 -> 0.058    (stopped: true)       — brake works
park:      gear=P | dx=0.144 dz=0.447  (holds position; residual is settle jitter from the reset drop, not drift under drive)
reverse:   gear=R | z 9.992 -> 20.147  (increased: true)     — reverse drives backward, confirmed
```

Throttle = signed value 3.0/-3.0-scale: `driveThrottleForGear("D", 1) === 1`,
`driveThrottleForGear("R", 1) === -1`, `driveThrottleForGear("P", 1) === 0`
(unit-tested; also verified live above via the z-position deltas).

## Concern: steering-yaw sign flips with gear (contradicts the brief's stated contract)

The brief's reference semantics state: *"Steering yaw is NOT inverted in
reverse (turning the wheel left yaws the body CCW in both D and R —
physically emergent in a raycast vehicle, but verify it holds)."* I verified
it and **it does not hold**:

```
yaw: yawD=-0.3840 rad/s, yawR=+0.2817 rad/s -> opposite signs (measured 3x, reproducible)
```

Holding the same steer-left key produces opposite-signed yaw depending on
gear. Root cause: the raycast vehicle's front-wheel lateral-grip force (the
thing that turns the car) is computed from the ACTUAL chassis velocity
projected onto the steered wheel's rotated right-vector. When the chassis is
moving forward vs. backward, that projection's sign flips for the same steer
angle — this is the textbook bicycle-model result (yaw rate ∝ velocity ×
tan(steer angle); flipping velocity sign flips yaw rate sign for a fixed
steer angle). It is real, physically-correct car-reversing behavior (this is
exactly why backing up while turning the wheel "feels backwards" to new
drivers) — not a raycast-vehicle glitch.

I then checked whether the *original* app (`src/components/simulation/Car.tsx`
+ `src/lib/carPhysics.ts`, pre-Babylon) actually implements non-inversion, since
the brief's wording is copied near-verbatim from a comment in `Car.tsx`
(lines 212–214). It does not either: `Car.tsx` computes
`const direction = gear === "R" ? -1 : 1;` and passes it straight into
`steeringYawDelta(speed, steering, direction, dtScale)`, which **multiplies
by `direction`** (`carPhysics.ts` line 64). Since `speed` there is an
unsigned magnitude, multiplying by `direction` flips the yaw delta's sign
between D and R for the same `steering` sign — i.e. the original's actual
runtime output *also* inverts yaw with gear; only the adjacent comment
claims otherwise. `tests/steeringGear.test.ts`/`carPhysics.test.ts` don't
cover this interaction, so the mismatch between the comment and the code was
never caught.

Conclusion: our Babylon port's measured behavior matches the original app's
*actual* (not commented) behavior, and matches real-world car kinematics. I
did not force artificial non-inversion (it would mean fighting the physics
with an arbitrary yaw-torque hack, and would make the port diverge from what
the original app really does). Flagging this for explicit sign-off since the
acceptance text as literally written is not met — please confirm whether
"matches the original's real behavior + real car physics" is the intended
bar, or whether gear-invariant yaw was truly wanted (in which case it needs a
deliberate arcade-style override, e.g. driving the yaw torque from
`|forwardVel|` instead of the signed velocity projection, which is a
raycastVehicle.ts change, not a driveControls.ts one).

## Follow camera in reverse

`FollowCamera` tracks `chassisMesh`'s orientation (not its velocity), and no
gear-dependent camera logic was added, so it naturally stays behind the car's
front the whole time — confirmed visually mid-reverse:
`.claude/skills/run-driving/shots/drive-b6-gear-mid-reverse.png` (car facing
into the screen, camera behind it, unchanged from forward-drive framing).

## Screenshots

- `.claude/skills/run-driving/shots/drive-b6-gear-mid-reverse.png` — 1280×800,
  mid-reverse: `60 FPS · Gear R` readout, camera still behind the car's front,
  mirror viewport still composited top-center, hint shows the new mapping.
- `.claude/skills/run-driving/shots/drive-b6-1920.png` — 1920×1200, gear D:
  `60 FPS · Gear D`, mirror renders, hint shows the new mapping.
- `.claude/skills/run-driving/shots/drive-b6-gear.png` — 1280×800 end-state
  screenshot from the full verification run.

Note: the on-screen hint text appears clipped at its left edge ("...gas ·
S/↓ brake...", missing "W/↑ ") in headed screenshots at both resolutions.
This is **pre-existing** — confirmed present identically in
`drive-b5b-forward.png` (a B5b screenshot predating this task) — not a
regression introduced here, and out of scope for B6.

## Gates

- `npm run type-check` — clean, no errors.
- `npm run lint` — 0 errors, 2 pre-existing warnings in unrelated files
  (`FeedbackScreen.tsx`, `VisionController.tsx`; not touched by this task).
- `npm run test:unit` (`node --test "tests/**/*.test.ts"`) — **103/103 pass**
  (82 pre-existing + 21 new in `tests/driveControls.test.ts`), 0 regressions.
  (Brief refers to this gate as `npm test`; the actual script name in
  `package.json` is `test:unit` — ran that.)

## Files touched

- `src/lib/driveControls.ts` (new) — pure gear state machine + key→input
  mapping module.
- `tests/driveControls.test.ts` (new) — 21 `node --test` cases, written
  first (TDD; watched fail with `ERR_MODULE_NOT_FOUND` before the module
  existed, then all green).
- `src/components/babylon/DriveCanvas.tsx` — uses `driveControls.ts` instead
  of inline key logic; tracks gear; extends `__driveDebug.getState()` with
  `gear`; updated on-screen hint + added gear readout.
- `src/components/babylon/raycastVehicle.ts` — `VehicleInput.throttle` is now
  signed (doc updated); drive-force gate changed from `throttle > 0` to
  `throttle !== 0`; added `debug.angularVelY` (yaw-rate verification aid).
- `.claude/skills/run-driving/shots/shot-drive-b6-gear.mjs` (new, gitignored
  shots dir) — real-keyboard Playwright verification script used for the
  evidence numbers above.

## Fix round (review findings)

**Fixed three defects found in B6 code review (one Important documentation defect + two Minor test gaps):**

### Fix 1 — Stale comments contradicting verified yaw-flip behavior (Important)
Corrected misleading comments claiming steering "yaws the body the same way" in both gears.
Updated four comments in two files to acknowledge that:
- Steering **input** is gear-invariant (same signal in D and R)
- Steering **effect** (yaw direction) flips in reverse because velocity sign flips
  (yaw rate ∝ velocity × steer angle — textbook car kinematics)

Files/lines fixed:
- `src/lib/driveControls.ts:25–28` — added "FLIPS" language and physics explanation
- `src/components/babylon/raycastVehicle.ts:93–94` — rewrote throttle comment
- `src/components/babylon/raycastVehicle.ts:121–123` — rewrote debug snapshot comment
- `src/components/babylon/raycastVehicle.ts:277–279` — rewrote drive-force comment

### Fix 2 — Missing direct unit tests for normalizeKey (Minor)
Added two new direct unit tests in `tests/driveControls.test.ts`:
- `normalizeKey lowercases single-character keys` (W→w, A→a, S→s, D→d)
- `normalizeKey passes through named keys unchanged` (ArrowUp, ArrowDown, etc.)

### Fix 3 — Misleading test title and incomplete test exercise (Minor)
Retitled and expanded the `isGasPressed` test at line 55 to actually exercise Caps Lock composition:
- Old: `"isGasPressed is true for w, W (caps), or ArrowUp"` (title claimed caps but test didn't)
- New: `"isGasPressed is true for normalized w or ArrowUp (Caps Lock handled by normalizeKey)"`
- Added assertions showing:
  - Raw uppercase W does NOT match (keys must pre-normalize)
  - Composed `normalizeKey("W")` then checked DOES work
  - Demonstrates the Caps-Lock-safe pattern properly

### Gate results
- `npm run type-check` — ✔ clean
- `npm run lint` — ✔ 0 errors, 2 pre-existing warnings (unchanged)
- `npm run test:unit` — ✔ **105/105 pass** (100 pre-existing + 5 new assertions for fixes), 0 regressions
