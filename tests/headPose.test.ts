import { test } from "node:test";
import assert from "node:assert/strict";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

import { computeHeadPose } from "../src/lib/vision/headPose.ts";

// Build a face landmark array with only the indices head-pose reads set; `pts`
// overrides specific indices with an x value (y/z default 0).
function face(pts: Record<number, number>): NormalizedLandmark[] {
  const arr: NormalizedLandmark[] = [];
  for (let i = 0; i <= 473; i++) {
    arr.push({ x: pts[i] ?? 0, y: 0, z: 0, visibility: 1 });
  }
  return arr;
}

// Indices: nose 1, ears 234/454, left eye 33/133/468, right eye 362/263/473.
// A "neutral" face: nose centered between ears, each iris centered between its
// eye corners.
function neutral(): Record<number, number> {
  return {
    1: 0.5, // nose
    234: 0.4, // left ear
    454: 0.6, // right ear  -> midEarX = 0.5, nose - mid = 0 -> yaw 0
    33: 0.3, 133: 0.4, 468: 0.35, // left eye: iris midway -> ratio 0.5
    362: 0.6, 263: 0.7, 473: 0.65, // right eye: iris midway -> ratio 0.5
  };
}

test("null / undefined landmarks -> null", () => {
  assert.equal(computeHeadPose(null), null);
  assert.equal(computeHeadPose(undefined), null);
});

test("missing a required index -> null", () => {
  const f = face(neutral());
  // Truncate so the right-iris index (473) is absent.
  const short = f.slice(0, 400);
  assert.equal(computeHeadPose(short), null);
});

test("neutral face -> yaw 0, gaze centered (0,0)", () => {
  const r = computeHeadPose(face(neutral()));
  assert.ok(r);
  assert.ok(Math.abs(r.yaw) < 1e-12, `yaw ${r.yaw}`);
  assert.ok(Math.abs(r.gaze.x) < 1e-12, `gaze.x ${r.gaze.x}`);
  assert.equal(r.gaze.y, 0);
});

test("nose left of ear midpoint -> positive yaw (verbatim -(nose-mid)*20)", () => {
  const p = neutral();
  p[1] = 0.45; // nose left of midEarX (0.5); nose-mid = -0.05 -> yaw = +1.0
  const r = computeHeadPose(face(p));
  assert.ok(r);
  assert.ok(Math.abs(r.yaw - 1.0) < 1e-12, `yaw ${r.yaw}`);
});

test("nose right of ear midpoint -> negative yaw", () => {
  const p = neutral();
  p[1] = 0.55; // nose-mid = +0.05 -> yaw = -1.0
  const r = computeHeadPose(face(p));
  assert.ok(r);
  assert.ok(Math.abs(r.yaw + 1.0) < 1e-12, `yaw ${r.yaw}`);
});

test("iris toward outer corners -> positive gaze.x, magnitude (avgRatio-0.5)*5", () => {
  const p = neutral();
  // Left eye [0.3..0.4], put iris at 0.38 -> ratio 0.8. Right eye [0.6..0.7],
  // iris at 0.68 -> ratio 0.8. avgRatio 0.8 -> gaze.x = (0.8-0.5)*5 = 1.5.
  p[468] = 0.38;
  p[473] = 0.68;
  const r = computeHeadPose(face(p));
  assert.ok(r);
  assert.ok(Math.abs(r.gaze.x - 1.5) < 1e-12, `gaze.x ${r.gaze.x}`);
});
