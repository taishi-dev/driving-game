import { test } from "node:test";
import assert from "node:assert/strict";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

import { computeSteeringAndGear } from "../src/lib/vision/steeringGear.ts";

// Build a 21-point hand landmark array; only index 0 (wrist) and 9 (middle MCP)
// are read by the steering logic. `pts` overrides specific indices.
function hand(pts: Record<number, { x: number; y: number }>): NormalizedLandmark[] {
  const arr: NormalizedLandmark[] = [];
  for (let i = 0; i < 21; i++) {
    const o = pts[i];
    arr.push({ x: o?.x ?? 0, y: o?.y ?? 0, z: 0, visibility: 1 });
  }
  return arr;
}

test("zero hands -> steering 0, gear D, exact info string", () => {
  const r = computeSteeringAndGear({ landmarks: [], detections: null });
  assert.equal(r.newGear, "D");
  assert.equal(r.gearHandIndex, -1);
  assert.equal(r.steering, 0);
  assert.equal(r.info, "Hands: 0 | Gear: D | Str: 0.00");
});

test("a hand in the gear zone shifts to R and is excluded from steering", () => {
  // hand0 is in the gear zone (x>0.8, y>0.5); if it were NOT excluded, the
  // 2-hand path would yield ~0.196. With exclusion, only the upright hand1
  // drives the 1-hand path -> 0. So steering===0 proves exclusion.
  const hand0 = hand({ 0: { x: 0.9, y: 0.6 }, 9: { x: 0.9, y: 0.3 } });
  const hand1 = hand({ 0: { x: 0.5, y: 0.5 }, 9: { x: 0.5, y: 0.4 } }); // upright
  const r = computeSteeringAndGear({ landmarks: [hand0, hand1], detections: null });
  assert.equal(r.newGear, "R");
  assert.equal(r.gearHandIndex, 0);
  assert.equal(r.steering, 0);
  assert.ok(r.info.includes(" | Gear: R"));
});

test("two gear-zone hands: break on first -> only index 0 excluded", () => {
  // Both wrists in the gear zone. Without `break`, gearHandIndex would be
  // overwritten to the last (1); with break it stays 0 and hand1 steers.
  const hand0 = hand({ 0: { x: 0.85, y: 0.6 }, 9: { x: 0.85, y: 0.3 } });
  const hand1 = hand({ 0: { x: 0.9, y: 0.7 }, 9: { x: 0.9, y: 0.4 } });
  const r = computeSteeringAndGear({ landmarks: [hand0, hand1], detections: null });
  assert.equal(r.newGear, "R");
  assert.equal(r.gearHandIndex, 0);
});

test("two level hands -> angle 0 -> steering 0", () => {
  const hand0 = hand({ 0: { x: 0.3, y: 0.3 }, 9: { x: 0.3, y: 0.5 } });
  const hand1 = hand({ 0: { x: 0.7, y: 0.3 }, 9: { x: 0.7, y: 0.5 } });
  const r = computeSteeringAndGear({ landmarks: [hand0, hand1], detections: null });
  assert.equal(r.newGear, "D");
  assert.equal(r.steering, 0);
  assert.equal(r.info, "Hands: 2 | Gear: D | Str: 0.00");
});

test("two tilted hands -> -angle*0.8, clamped at the -1 rail", () => {
  const hand0 = hand({ 0: { x: 0.45, y: 0.2 }, 9: { x: 0.45, y: 0.01 } });
  const hand1 = hand({ 0: { x: 0.55, y: 0.2 }, 9: { x: 0.55, y: 0.99 } });
  const r = computeSteeringAndGear({ landmarks: [hand0, hand1], detections: null });
  assert.equal(r.steering, -1);
});

test("two tilted hands the other way -> clamps at the +1 rail (sign check)", () => {
  // right MCP far above left MCP -> negative angle -> positive steering.
  const hand0 = hand({ 0: { x: 0.45, y: 0.2 }, 9: { x: 0.45, y: 0.99 } });
  const hand1 = hand({ 0: { x: 0.55, y: 0.2 }, 9: { x: 0.55, y: 0.01 } });
  const r = computeSteeringAndGear({ landmarks: [hand0, hand1], detections: null });
  assert.equal(r.steering, 1);
});

test("two mildly tilted hands -> exactly -angle*0.8", () => {
  const hand0 = hand({ 0: { x: 0.4, y: 0.4 }, 9: { x: 0.4, y: 0.4 } });
  const hand1 = hand({ 0: { x: 0.6, y: 0.4 }, 9: { x: 0.6, y: 0.5 } });
  const r = computeSteeringAndGear({ landmarks: [hand0, hand1], detections: null });
  // left=hand0[9]=(0.4,0.4), right=hand1[9]=(0.6,0.5): dy=0.1, dx=0.2
  const expected = -Math.atan2(0.1, 0.2) * 0.8;
  assert.ok(Math.abs(r.steering - expected) < 1e-12, `steering ${r.steering} != ${expected}`);
});

test("deadzone: raw |steering| < 0.05 snaps to exactly 0", () => {
  // left=hand0[9]=(0.4,0.5), right=hand1[9]=(0.6,0.503): tiny angle -> ~0.012
  const hand0 = hand({ 0: { x: 0.4, y: 0.3 }, 9: { x: 0.4, y: 0.5 } });
  const hand1 = hand({ 0: { x: 0.6, y: 0.3 }, 9: { x: 0.6, y: 0.503 } });
  const r = computeSteeringAndGear({ landmarks: [hand0, hand1], detections: null });
  assert.equal(r.steering, 0);
});

test("deadzone: raw |steering| > 0.05 passes through unchanged", () => {
  const hand0 = hand({ 0: { x: 0.4, y: 0.3 }, 9: { x: 0.4, y: 0.5 } });
  const hand1 = hand({ 0: { x: 0.6, y: 0.3 }, 9: { x: 0.6, y: 0.52 } });
  const r = computeSteeringAndGear({ landmarks: [hand0, hand1], detections: null });
  const expected = -Math.atan2(0.02, 0.2) * 0.8; // ~ -0.0798
  assert.notEqual(r.steering, 0);
  assert.ok(Math.abs(r.steering - expected) < 1e-12, `steering ${r.steering} != ${expected}`);
});

test("one upright hand -> 0 (neutral is -PI/2)", () => {
  const h = hand({ 0: { x: 0.5, y: 0.5 }, 9: { x: 0.5, y: 0.4 } });
  const r = computeSteeringAndGear({ landmarks: [h], detections: null });
  assert.equal(r.steering, 0);
  assert.equal(r.angle, 0);
});

test("one hand at 180deg exercises the diff>PI normalization, clamps to -1", () => {
  // middle to the left of wrist, same y -> handAngle = PI; diff = 3PI/2 -> -PI/2
  const h = hand({ 0: { x: 0.5, y: 0.5 }, 9: { x: 0.4, y: 0.5 } });
  const r = computeSteeringAndGear({ landmarks: [h], detections: null });
  assert.ok(Math.abs(r.angle - -Math.PI / 2) < 1e-12, `angle ${r.angle}`);
  assert.equal(r.steering, -1);
});

test("object detection appends ' | Obj: <name>' only when a category is present", () => {
  const base = { landmarks: [] as NormalizedLandmark[][] };
  assert.ok(computeSteeringAndGear({ ...base, detections: [{ categories: [{ categoryName: "cup" }] }] }).info.endsWith(" | Obj: cup"));
  assert.ok(!computeSteeringAndGear({ ...base, detections: [] }).info.includes(" | Obj:"));
  assert.ok(!computeSteeringAndGear({ ...base, detections: null }).info.includes(" | Obj:"));
  assert.ok(!computeSteeringAndGear({ ...base, detections: [{ categories: [] }] }).info.includes(" | Obj:"));
});
