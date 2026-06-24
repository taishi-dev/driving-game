import { test } from "node:test";
import assert from "node:assert/strict";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

import { recognizeBraking, type FootCalibration, type PedalState } from "../src/lib/footPedalRecognition.ts";

const ZERO_PEDAL: PedalState = {
  throttle: 0, brake: 0, isAccelPressed: false, isBrakePressed: false, brakePressDuration: 0, brakePressCount: 0,
};

// 33-point pose; only hips(23,24), right knee(26), ankle(28), foot index(32) are read by recognizeBraking.
function pose(o: Record<number, { x: number; y: number; z?: number }>): NormalizedLandmark[] {
  const a: NormalizedLandmark[] = [];
  for (let i = 0; i < 33; i++) {
    const p = o[i];
    a.push({ x: p?.x ?? 0.5, y: p?.y ?? 0.5, z: p?.z ?? 0, visibility: 1 });
  }
  return a;
}

function fullCalibration(overrides: Partial<FootCalibration> = {}): FootCalibration {
  const p = { x: 0, y: 0, z: 0 };
  return {
    rightAnkle: { ...p }, rightHeel: { ...p }, rightFootIndex: { ...p }, rightKnee: { ...p },
    leftAnkle: { ...p }, leftHeel: { ...p }, leftFootIndex: { ...p }, leftKnee: { ...p },
    leftHip: { ...p }, rightHip: { ...p }, hipCenter: { ...p },
    rightFootAngle: 0, leftFootAngle: 0, hipToRightKneeAngle: 0,
    accelPressPosition: null, accelPressAngle: null,
    isCalibrated: false, stabilityCheckStartTime: null, stabilityCheckPosition: null,
    smoothedKneeAngle: null, smoothedFootAngle: null, smoothedHipCenter: null, smoothedRightKnee: null,
    ...overrides,
  };
}

test("brake never exceeds the documented 1.0, even at maximum foot tilt", () => {
  // hips midpoint (0.5,0.5), right knee (0.6,0.7) -> hip-to-knee angle atan2(0.2,0.1);
  // matching calibration so angleDiff ~ 0 (< BRAKE_ANGLE_THRESHOLD) -> brake pressed.
  const hipToKnee = Math.atan2(0.2, 0.1);
  const cal = fullCalibration({ isCalibrated: true, hipToRightKneeAngle: hipToKnee, rightFootAngle: 0 });
  // foot tilt: ankle (0.5,0.8) -> foot index (0.6,0.85) -> foot angle atan2(0.05,0.1) ~ 0.46,
  // which is past MAX_BRAKE_FOOT_ANGLE (0.4), so the angle-based brake saturates.
  const lm = pose({ 23: { x: 0.4, y: 0.5 }, 24: { x: 0.6, y: 0.5 }, 26: { x: 0.6, y: 0.7 }, 28: { x: 0.5, y: 0.8 }, 32: { x: 0.6, y: 0.85 } });

  const r = recognizeBraking(lm, cal, ZERO_PEDAL, 16);

  assert.equal(r.isBrakePressed, true);
  assert.ok(r.brake <= 1.0, `brake ${r.brake} exceeds the documented 0..1 range`);
  assert.equal(r.brake, 1.0); // saturates exactly at the cap
});

test("no brake when the leg posture is unchanged from calibration (foot flat)", () => {
  const hipToKnee = Math.atan2(0.2, 0.1);
  const cal = fullCalibration({ isCalibrated: true, hipToRightKneeAngle: hipToKnee, rightFootAngle: Math.atan2(0, 0.1) });
  // foot index level with ankle -> foot angle 0, equal to calibration -> no tilt -> brake 0
  const lm = pose({ 23: { x: 0.4, y: 0.5 }, 24: { x: 0.6, y: 0.5 }, 26: { x: 0.6, y: 0.7 }, 28: { x: 0.5, y: 0.8 }, 32: { x: 0.6, y: 0.8 } });

  const r = recognizeBraking(lm, cal, ZERO_PEDAL, 16);
  assert.equal(r.brake, 0);
});

test("uncalibrated -> zeroed result", () => {
  const r = recognizeBraking(pose({}), fullCalibration({ isCalibrated: false }), ZERO_PEDAL, 16);
  assert.deepEqual(r, { brake: 0, isBrakePressed: false, brakePressDuration: 0, brakePressCount: 0 });
});
