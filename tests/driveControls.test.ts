import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_GEAR,
  STEER_MAGNITUDE,
  GEAR_KEY_MAP,
  gearForKey,
  nextGear,
  isGasPressed,
  isBrakePressed,
  isLeftPressed,
  isRightPressed,
  computeSteer,
  driveThrottleForGear,
  driveInputFromKeys,
} from "../src/lib/driveControls.ts";

// ─── Gear state machine ─────────────────────────────────────────────────────

test("DEFAULT_GEAR is D (matches the original app's default)", () => {
  assert.equal(DEFAULT_GEAR, "D");
});

test("GEAR_KEY_MAP assigns 1/2/3 to P/D/R (no conflict with WASD/arrows/reset)", () => {
  assert.deepEqual(GEAR_KEY_MAP, { "1": "P", "2": "D", "3": "R" });
});

test("gearForKey resolves gear-select keys", () => {
  assert.equal(gearForKey("1"), "P");
  assert.equal(gearForKey("2"), "D");
  assert.equal(gearForKey("3"), "R");
});

test("gearForKey returns undefined for non-gear keys (incl. the reset key)", () => {
  assert.equal(gearForKey("r"), undefined);
  assert.equal(gearForKey("R"), undefined);
  assert.equal(gearForKey("w"), undefined);
  assert.equal(gearForKey("ArrowUp"), undefined);
});

test("nextGear switches to the gear mapped by the key", () => {
  assert.equal(nextGear("D", "3"), "R");
  assert.equal(nextGear("R", "1"), "P");
  assert.equal(nextGear("P", "2"), "D");
});

test("nextGear leaves the gear unchanged for a non-gear key", () => {
  assert.equal(nextGear("D", "w"), "D");
  assert.equal(nextGear("R", "ArrowUp"), "R");
});

// ─── Key-state predicates (Caps-Lock-safe: single chars normalized to lower) ─

test("isGasPressed is true for w, W (caps), or ArrowUp", () => {
  assert.equal(isGasPressed({ w: true }), true);
  assert.equal(isGasPressed({ ArrowUp: true }), true);
  assert.equal(isGasPressed({}), false);
});

test("isBrakePressed is true for s or ArrowDown", () => {
  assert.equal(isBrakePressed({ s: true }), true);
  assert.equal(isBrakePressed({ ArrowDown: true }), true);
  assert.equal(isBrakePressed({}), false);
});

test("isLeftPressed / isRightPressed read a/d and arrow keys", () => {
  assert.equal(isLeftPressed({ a: true }), true);
  assert.equal(isLeftPressed({ ArrowLeft: true }), true);
  assert.equal(isRightPressed({ d: true }), true);
  assert.equal(isRightPressed({ ArrowRight: true }), true);
});

// ─── Steering ────────────────────────────────────────────────────────────────

test("computeSteer returns +STEER_MAGNITUDE when only right is pressed", () => {
  assert.equal(computeSteer({ d: true }), STEER_MAGNITUDE);
});

test("computeSteer returns -STEER_MAGNITUDE when only left is pressed", () => {
  assert.equal(computeSteer({ a: true }), -STEER_MAGNITUDE);
});

test("computeSteer returns 0 when neither or both are pressed", () => {
  assert.equal(computeSteer({}), 0);
  assert.equal(computeSteer({ a: true, d: true }), 0);
});

test("STEER_MAGNITUDE is the original app's partial-steer constant (0.6)", () => {
  assert.equal(STEER_MAGNITUDE, 0.6);
});

// ─── Gear -> signed drive force (the core B6 contract) ──────────────────────

test("driveThrottleForGear: D passes the raw (forward) throttle through unchanged", () => {
  assert.equal(driveThrottleForGear("D", 1), 1);
  assert.equal(driveThrottleForGear("D", 0), 0);
});

test("driveThrottleForGear: R negates the raw throttle (drive force reversed)", () => {
  assert.equal(driveThrottleForGear("R", 1), -1);
  assert.equal(driveThrottleForGear("R", 0), 0);
});

test("driveThrottleForGear: P is always zero regardless of gas input", () => {
  assert.equal(driveThrottleForGear("P", 1), 0);
  assert.equal(driveThrottleForGear("P", 0), 0);
});

// ─── Full input pipeline (what DriveCanvas feeds vehicle.setInput each frame) ─

test("driveInputFromKeys: D + gas -> forward throttle, no brake, no steer", () => {
  const input = driveInputFromKeys({ w: true }, "D");
  assert.deepEqual(input, { throttle: 1, brake: 0, steer: 0 });
});

test("driveInputFromKeys: R + gas -> negative (reverse) throttle", () => {
  const input = driveInputFromKeys({ w: true }, "R");
  assert.equal(input.throttle, -1);
});

test("driveInputFromKeys: P + gas -> zero throttle even though gas is held", () => {
  const input = driveInputFromKeys({ w: true }, "P");
  assert.equal(input.throttle, 0);
});

test("driveInputFromKeys: brake passes through independent of gear", () => {
  assert.equal(driveInputFromKeys({ s: true }, "P").brake, 1);
  assert.equal(driveInputFromKeys({ s: true }, "D").brake, 1);
  assert.equal(driveInputFromKeys({ s: true }, "R").brake, 1);
});

test("driveInputFromKeys: steer is independent of gear (not inverted in reverse)", () => {
  assert.equal(driveInputFromKeys({ a: true }, "D").steer, -STEER_MAGNITUDE);
  assert.equal(driveInputFromKeys({ a: true }, "R").steer, -STEER_MAGNITUDE);
});
