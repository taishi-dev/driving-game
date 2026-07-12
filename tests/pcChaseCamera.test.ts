import { test } from "node:test";
import assert from "node:assert/strict";

import {
  flattenHeading,
  chaseCameraPose,
  type ChaseCameraConfig,
} from "../src/lib/pcChaseCamera.ts";

const CFG: ChaseCameraConfig = { distance: 8.5, height: 3.2, lookAhead: 4, lookHeight: 1 };

test("flattenHeading drops the Y component and normalizes to the XZ plane", () => {
  const h = flattenHeading({ x: 0, y: 5, z: -2 });
  assert.equal(h.y, 0);
  assert.ok(Math.abs(Math.hypot(h.x, h.z) - 1) < 1e-9, "heading is unit length on XZ");
  assert.ok(h.z < 0, "preserves the −Z facing");
});

test("a rolled/pitched chassis produces the SAME heading as a level one (roll/pitch discarded)", () => {
  // Level car facing −Z.
  const level = flattenHeading({ x: 0, y: 0, z: -1 });
  // Same heading but the forward axis has been tilted up by pitch AND skewed by
  // roll (its Y grew, X wobbled) — the flattened ground heading must be identical
  // once re-normalized, because only the XZ projection is used.
  const tilted = flattenHeading({ x: 0.0, y: 0.9, z: -1 });
  assert.ok(Math.abs(level.x - tilted.x) < 1e-9);
  assert.ok(Math.abs(level.z - tilted.z) < 1e-9);
});

test("a near-vertical forward (flipped car) falls back to +Z instead of NaN", () => {
  const h = flattenHeading({ x: 0, y: 1, z: 0 });
  assert.deepEqual(h, { x: 0, y: 0, z: 1 });
});

test("camera sits behind + above the car and looks ahead, on the ground heading", () => {
  // Car at origin facing −Z.
  const pose = chaseCameraPose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, CFG);
  // Behind = +Z (opposite the −Z heading), raised by height.
  assert.deepEqual(pose.position, { x: 0, y: 3.2, z: 8.5 });
  // Target ahead = −Z, raised by lookHeight.
  assert.deepEqual(pose.target, { x: 0, y: 1, z: -4 });
});

test("camera Y never inherits chassis roll — height is a pure world-up offset", () => {
  // Whatever the heading, the camera Y is exactly carPos.y + height and the
  // target Y is carPos.y + lookHeight: no term depends on roll/pitch.
  const carY = 1.5;
  const pose = chaseCameraPose({ x: 3, y: carY, z: -20 }, flattenHeading({ x: 1, y: 4, z: 0.2 }), CFG);
  assert.equal(pose.position.y, carY + CFG.height);
  assert.equal(pose.target.y, carY + CFG.lookHeight);
});
