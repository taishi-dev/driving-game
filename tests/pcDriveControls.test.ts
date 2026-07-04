import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_GEAR,
  KEYBOARD_STEER_MAGNITUDE,
  normalizeKey,
  gearForKey,
  signedThrottle,
  computeDriveInput,
  createDriveControls,
} from "../src/lib/pcDriveControls.ts";

// ─── normalizeKey ────────────────────────────────────────────────────────────
test("normalizeKey lowercases single-char keys (uppercase W -> w)", () => {
  assert.equal(normalizeKey("W"), "w");
  assert.equal(normalizeKey("w"), "w");
  assert.equal(normalizeKey("D"), "d");
  assert.equal(normalizeKey("3"), "3");
});

test("normalizeKey leaves multi-char keys untouched", () => {
  assert.equal(normalizeKey("ArrowUp"), "ArrowUp");
  assert.equal(normalizeKey("ArrowLeft"), "ArrowLeft");
});

// ─── gearForKey / gear transitions ───────────────────────────────────────────
test("default gear is D", () => {
  assert.equal(DEFAULT_GEAR, "D");
});

test("gearForKey maps 1/2/3 -> P/D/R", () => {
  assert.equal(gearForKey("1", "D"), "P");
  assert.equal(gearForKey("2", "R"), "D");
  assert.equal(gearForKey("3", "D"), "R");
});

test("gearForKey ignores non-gear keys and keeps the current gear", () => {
  assert.equal(gearForKey("w", "R"), "R");
  assert.equal(gearForKey("ArrowUp", "P"), "P");
  assert.equal(gearForKey("x", "D"), "D");
});

// ─── signedThrottle ──────────────────────────────────────────────────────────
test("signedThrottle: P holds (always 0)", () => {
  assert.equal(signedThrottle("P", 1), 0);
  assert.equal(signedThrottle("P", 0), 0);
});

test("signedThrottle: D passes gas through unsigned", () => {
  assert.equal(signedThrottle("D", 1), 1);
  assert.equal(signedThrottle("D", 0.5), 0.5);
});

test("signedThrottle: R negates gas", () => {
  assert.equal(signedThrottle("R", 1), -1);
  assert.equal(signedThrottle("R", 0.5), -0.5);
});

test("signedThrottle avoids negative zero (R with no gas is +0)", () => {
  const r = signedThrottle("R", 0);
  assert.equal(r, 0);
  assert.ok(Object.is(r, 0), "must be +0, not -0");
  assert.ok(!Object.is(r, -0), "must not be -0");
});

// ─── computeDriveInput ───────────────────────────────────────────────────────
test("computeDriveInput: W or ArrowUp = full gas, no brake", () => {
  assert.deepEqual(computeDriveInput(new Set(["w"])), { gas: 1, brake: 0, steer: 0 });
  assert.deepEqual(computeDriveInput(new Set(["ArrowUp"])), { gas: 1, brake: 0, steer: 0 });
});

test("computeDriveInput: S or ArrowDown = full brake, no gas", () => {
  assert.deepEqual(computeDriveInput(new Set(["s"])), { gas: 0, brake: 1, steer: 0 });
  assert.deepEqual(computeDriveInput(new Set(["ArrowDown"])), { gas: 0, brake: 1, steer: 0 });
});

test("computeDriveInput: D/ArrowRight steer +0.6 (right), A/ArrowLeft steer -0.6 (left)", () => {
  assert.equal(computeDriveInput(new Set(["d"])).steer, KEYBOARD_STEER_MAGNITUDE);
  assert.equal(computeDriveInput(new Set(["ArrowRight"])).steer, KEYBOARD_STEER_MAGNITUDE);
  assert.equal(computeDriveInput(new Set(["a"])).steer, -KEYBOARD_STEER_MAGNITUDE);
  assert.equal(computeDriveInput(new Set(["ArrowLeft"])).steer, -KEYBOARD_STEER_MAGNITUDE);
  assert.equal(KEYBOARD_STEER_MAGNITUDE, 0.6);
});

test("computeDriveInput: both left+right held -> steer 0", () => {
  assert.equal(computeDriveInput(new Set(["a", "d"])).steer, 0);
  assert.equal(computeDriveInput(new Set(["ArrowLeft", "ArrowRight"])).steer, 0);
});

test("computeDriveInput: no steer keys -> steer 0", () => {
  assert.equal(computeDriveInput(new Set(["w"])).steer, 0);
  assert.equal(computeDriveInput(new Set()).steer, 0);
});

test("computeDriveInput: gas + right steer combine", () => {
  assert.deepEqual(computeDriveInput(new Set(["w", "d"])), {
    gas: 1,
    brake: 0,
    steer: KEYBOARD_STEER_MAGNITUDE,
  });
});

// ─── createDriveControls (stateful, DOM-free) ────────────────────────────────
test("createDriveControls: uppercase keys normalise (Shift+W drives)", () => {
  const c = createDriveControls();
  c.keyDown("W");
  assert.equal(c.getInput().gas, 1);
  c.keyUp("W");
  assert.equal(c.getInput().gas, 0);
});

test("createDriveControls: gear key '3' shifts D -> R and persists", () => {
  const c = createDriveControls();
  assert.equal(c.getGear(), "D");
  c.keyDown("3");
  assert.equal(c.getGear(), "R");
  c.keyUp("3"); // releasing the gear key does not revert the gear
  assert.equal(c.getGear(), "R");
});

test("createDriveControls: reset() releases all held keys", () => {
  const c = createDriveControls();
  c.keyDown("w");
  c.keyDown("d");
  assert.equal(c.getInput().gas, 1);
  c.reset();
  assert.deepEqual(c.getInput(), { gas: 0, brake: 0, steer: 0 });
});

test("createDriveControls: signed throttle via gear + gas (R + W -> -1)", () => {
  const c = createDriveControls();
  c.keyDown("3"); // R
  c.keyDown("w"); // full gas
  assert.equal(signedThrottle(c.getGear(), c.getInput().gas), -1);
});
