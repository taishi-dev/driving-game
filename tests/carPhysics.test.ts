import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CAR_PHYSICS,
  STEERING,
  stepSpeed,
  steeringYawDelta,
  forwardStep,
  dtScaleFromDelta,
  smoothingAlpha,
} from "../src/lib/carPhysics.ts";

// Helper: simulate holding the throttle from a given starting speed for `seconds`
// of SIMULATED time at a given frame rate, accumulating forward distance the same
// way Car.tsx does (update speed, then move by the post-update speed).
function driveForward({
  fps,
  seconds,
  startSpeed,
  throttle = 1,
}: {
  fps: number;
  seconds: number;
  startSpeed: number;
  throttle?: number;
}): { distance: number; speed: number } {
  const delta = 1 / fps;
  const dt = dtScaleFromDelta(delta);
  const steps = Math.round(fps * seconds);
  let speed = startSpeed;
  let distance = 0;
  for (let i = 0; i < steps; i++) {
    speed = stepSpeed(speed, { throttle, brake: 0 }, dt);
    distance += forwardStep(speed, 1, dt);
  }
  return { distance, speed };
}

// THE BUG THIS GUARDS: Car physics used to advance a fixed amount per FRAME with
// no delta, so a slower frame rate (e.g. headless CI's software rasterizer) made
// the car cover proportionally less ground per wall-clock second and the
// drive-to-goal e2e timed out. Distance per simulated second must be independent
// of frame rate.
test("forward distance over fixed simulated time is frame-rate independent", () => {
  // Start already at top speed so this isolates the movement integration from the
  // speed ramp-up; at steady speed the distance must match to within float noise.
  const fast = driveForward({ fps: 60, seconds: 1, startSpeed: CAR_PHYSICS.maxSpeed });
  const slow = driveForward({ fps: 20, seconds: 1, startSpeed: CAR_PHYSICS.maxSpeed });
  assert.ok(
    Math.abs(fast.distance - slow.distance) < 1e-9,
    `distance should match across frame rates: 60fps=${fast.distance} 20fps=${slow.distance}`,
  );
});

test("accelerating from rest covers ~same distance regardless of frame rate", () => {
  const fast = driveForward({ fps: 60, seconds: 2, startSpeed: 0 });
  const slow = driveForward({ fps: 20, seconds: 2, startSpeed: 0 });
  // The exponential speed approach is only approximate across step sizes, so allow
  // a small tolerance here (the steady-state test above is the exact guard).
  const relErr = Math.abs(fast.distance - slow.distance) / fast.distance;
  assert.ok(relErr < 0.05, `accel distance within 5%: 60fps=${fast.distance} 20fps=${slow.distance} (relErr=${relErr})`);
});

// FEEL UNCHANGED AT 60FPS: dtScale must be exactly 1 at 60fps so the hand-tuned
// per-frame constants behave identically to the legacy code on a 60fps machine.
test("dtScaleFromDelta is 1.0 at 60fps", () => {
  assert.equal(dtScaleFromDelta(1 / 60), 1);
});

test("a single 60fps throttle step from rest reproduces the legacy increment", () => {
  // Legacy: speed += (maxSpeed * throttle - speed) * acceleration
  const next = stepSpeed(0, { throttle: 1, brake: 0 }, 1);
  assert.equal(next, CAR_PHYSICS.maxSpeed * CAR_PHYSICS.acceleration);
});

test("steering yaw delta scales with dt and is zero below the speed threshold", () => {
  // Below the |speed|>0.001 threshold there is no rotation.
  assert.equal(steeringYawDelta(0, 1, 1, 1), 0);
  // At 20fps (dt=3) the per-frame yaw change is 3x the 60fps (dt=1) change, so
  // total rotation over equal simulated time matches.
  const oneStep60 = steeringYawDelta(CAR_PHYSICS.maxSpeed, 1, 1, 1);
  const oneStep20 = steeringYawDelta(CAR_PHYSICS.maxSpeed, 1, 1, 3);
  assert.ok(Math.abs(oneStep20 - oneStep60 * 3) < 1e-12);
});

// Camera/ghost/replay smoothing used to lerp by a CONSTANT factor every frame, so
// at a higher frame rate the camera converged on its target faster (snappier) and
// at a lower frame rate it lagged — frame-rate-dependent feel, the same class of
// bug as the per-frame physics. smoothingAlpha corrects a per-frame lerp factor
// for the real time step so the camera converges the same amount per wall-clock
// second at any frame rate.

// Simulate lerping a scalar from 0 toward 1 for `seconds` at `fps` and return the
// remaining gap to the target (1 - value).
function smoothToTarget({ fps, seconds, base }: { fps: number; seconds: number; base: number }): number {
  const dt = dtScaleFromDelta(1 / fps);
  const steps = Math.round(fps * seconds);
  let v = 0;
  for (let i = 0; i < steps; i++) {
    v += (1 - v) * smoothingAlpha(base, dt);
  }
  return 1 - v;
}

test("smoothingAlpha is the identity at 60fps (feel unchanged)", () => {
  // dtScale === 1 must return the base factor (within float noise) so 60fps feel
  // is unchanged from the legacy constant-lerp behavior.
  assert.ok(Math.abs(smoothingAlpha(0.5, 1) - 0.5) < 1e-12);
  assert.ok(Math.abs(smoothingAlpha(0.1, 1) - 0.1) < 1e-12);
});

test("smoothed convergence over fixed simulated time is frame-rate independent", () => {
  const fast = smoothToTarget({ fps: 60, seconds: 1, base: 0.5 });
  const slow = smoothToTarget({ fps: 20, seconds: 1, base: 0.5 });
  assert.ok(
    Math.abs(fast - slow) < 1e-9,
    `remaining gap should match across frame rates: 60fps=${fast} 20fps=${slow}`,
  );
});

test("smoothingAlpha stays within [0,1] for sane inputs", () => {
  // dtScale up to the Car.tsx clamp of 4; alpha must remain a valid lerp factor.
  for (const dt of [1, 2, 3, 4]) {
    const a = smoothingAlpha(0.5, dt);
    assert.ok(a >= 0 && a <= 1, `alpha out of range at dt=${dt}: ${a}`);
  }
});

test("steeringYawDelta is defined by the exported STEERING constants", () => {
  const { maxSpeed, turnSpeed } = CAR_PHYSICS;
  const { curveExponent, boost, rateMultiplier } = STEERING;
  const speed = maxSpeed, steering = 0.5, dir = 1, dt = 1;
  const curved = Math.sign(steering) * Math.pow(Math.abs(steering), curveExponent);
  const expected = -(curved * boost * turnSpeed * (speed / maxSpeed) * rateMultiplier * dir) * dt;
  assert.ok(
    Math.abs(steeringYawDelta(speed, steering, dir, dt) - expected) < 1e-12,
    "steeringYawDelta must be computed from the exported STEERING constants",
  );
});

test("stepSpeed braking uses CAR_PHYSICS.brakeRate", () => {
  const { brakeRate } = CAR_PHYSICS;
  const speed = 1;
  assert.equal(stepSpeed(speed, { throttle: 0, brake: 1 }, 1), speed - brakeRate);
});
