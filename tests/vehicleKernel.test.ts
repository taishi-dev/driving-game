import { test } from "node:test";
import assert from "node:assert/strict";

import {
  suspensionForce,
  driveForceMagnitude,
  overSpeedDragMagnitude,
} from "../src/lib/vehicleKernel.ts";

// These mirror VEHICLE_TUNING in src/components/babylon/raycastVehicle.ts.
// (That module imports Babylon, so it can't be pulled into node --test; the
// class calls these exact kernel functions, so testing them tests the real math.)
const STIFFNESS = 35000;
const DAMPING = 4000;
const ENGINE_FORCE = 4200;
const CHASSIS_MASS = 800;
const MAX_SPEED = 15.5;
const OVER_SPEED_DRAG = 4;

// ── suspensionForce ──────────────────────────────────────────────────────────

test("suspensionForce: pure spring term when the contact is not moving", () => {
  // No compression velocity → force is spring only.
  assert.equal(suspensionForce(0.1, 0, STIFFNESS, DAMPING), 0.1 * STIFFNESS);
  assert.equal(suspensionForce(0, 0, STIFFNESS, DAMPING), 0);
});

test("suspensionForce: a compressing contact adds damping, an extending one subtracts", () => {
  // Large spring term so both results stay positive (past the never-pull clamp).
  const spring = 0.5 * STIFFNESS; // 17500 N
  // Compressing (approaching, compressionVel < 0) → damper ADDS to the spring.
  const compressing = suspensionForce(0.5, -1, STIFFNESS, DAMPING);
  assert.equal(compressing, spring + DAMPING);
  // Extending (compressionVel > 0) → damper SUBTRACTS.
  const extending = suspensionForce(0.5, 1, STIFFNESS, DAMPING);
  assert.equal(extending, spring - DAMPING);
  assert.ok(extending < compressing);
});

test("suspensionForce: clamps to 0 — the suspension only pushes, never pulls", () => {
  // Tiny spring term, large extending damper term → would go negative → clamps.
  assert.equal(suspensionForce(0.01, 5, STIFFNESS, DAMPING), 0);
  // Negative compression (past rest, wheel hanging) with no damping → clamps.
  assert.equal(suspensionForce(-0.1, 0, STIFFNESS, DAMPING), 0);
});

// ── driveForceMagnitude ──────────────────────────────────────────────────────

test("driveForceMagnitude: positive throttle drives forward, split across powered wheels", () => {
  assert.equal(driveForceMagnitude(ENGINE_FORCE, 1, 2), ENGINE_FORCE / 2);
  assert.equal(driveForceMagnitude(ENGINE_FORCE, 0.5, 2), (ENGINE_FORCE * 0.5) / 2);
});

test("driveForceMagnitude: negative throttle (reverse gear) flips the sign", () => {
  assert.equal(driveForceMagnitude(ENGINE_FORCE, -1, 2), -ENGINE_FORCE / 2);
  // Sign strictly negative for a reverse request.
  assert.ok(driveForceMagnitude(ENGINE_FORCE, -0.3, 2) < 0);
});

test("driveForceMagnitude: zero throttle yields zero force", () => {
  assert.equal(driveForceMagnitude(ENGINE_FORCE, 0, 2), 0);
});

// ── overSpeedDragMagnitude ───────────────────────────────────────────────────

test("overSpeedDragMagnitude: no drag at or below the cap", () => {
  assert.equal(overSpeedDragMagnitude(0, MAX_SPEED, CHASSIS_MASS, OVER_SPEED_DRAG), 0);
  assert.equal(overSpeedDragMagnitude(MAX_SPEED, MAX_SPEED, CHASSIS_MASS, OVER_SPEED_DRAG), 0);
  assert.equal(
    overSpeedDragMagnitude(MAX_SPEED - 1, MAX_SPEED, CHASSIS_MASS, OVER_SPEED_DRAG),
    0,
  );
});

test("overSpeedDragMagnitude: ramps linearly with the excess above the cap", () => {
  const excess = 2;
  assert.equal(
    overSpeedDragMagnitude(MAX_SPEED + excess, MAX_SPEED, CHASSIS_MASS, OVER_SPEED_DRAG),
    excess * CHASSIS_MASS * OVER_SPEED_DRAG,
  );
  // Twice the excess → twice the drag.
  const d1 = overSpeedDragMagnitude(MAX_SPEED + 1, MAX_SPEED, CHASSIS_MASS, OVER_SPEED_DRAG);
  const d2 = overSpeedDragMagnitude(MAX_SPEED + 2, MAX_SPEED, CHASSIS_MASS, OVER_SPEED_DRAG);
  assert.equal(d2, 2 * d1);
});
