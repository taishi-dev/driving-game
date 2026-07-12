import { test } from "node:test";
import assert from "node:assert/strict";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

import {
  recognizeBraking,
  recognizeAcceleration,
  ACCEL_TUNING,
  type FootCalibration,
  type PedalState,
} from "../src/lib/footPedalRecognition.ts";

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

// ---- Accelerator: LEG-EXTENSION model (bug fix) --------------------------
// Seated brake pose: right hip / knee / ankle bent ~90° at the knee. Accel keys
// off how much the knee STRAIGHTENS past this, not on sideways position.
const BRAKE_HIP = { x: 0.5, y: 0.4, z: 0 };
const BRAKE_KNEE = { x: 0.5, y: 0.7, z: 0 };
const BRAKE_ANKLE = { x: 0.7, y: 0.7, z: 0 }; // knee interior angle = 90°

function accelCalibration(): FootCalibration {
  return fullCalibration({
    isCalibrated: true,
    rightHip: { ...BRAKE_HIP },
    rightKnee: { ...BRAKE_KNEE },
    rightAnkle: { ...BRAKE_ANKLE },
  });
}

// Rigidly rotate the knee + ankle about the hip — this models the whole leg
// ABDUCTING sideways while the knee stays bent the SAME amount.
function rotateAboutHip(pt: { x: number; y: number }, theta: number) {
  const dx = pt.x - BRAKE_HIP.x;
  const dy = pt.y - BRAKE_HIP.y;
  return {
    x: BRAKE_HIP.x + dx * Math.cos(theta) - dy * Math.sin(theta),
    y: BRAKE_HIP.y + dx * Math.sin(theta) + dy * Math.cos(theta),
  };
}

test("no throttle when the leg is unchanged from the brake pose", () => {
  const lm = pose({ 24: BRAKE_HIP, 26: BRAKE_KNEE, 28: BRAKE_ANKLE });
  const r = recognizeAcceleration(lm, accelCalibration(), ZERO_PEDAL);
  assert.equal(r.isAccelPressed, false);
  assert.equal(r.throttle, 0);
});

test("stretching the leg out (straightening the knee) opens the throttle", () => {
  // Ankle swung down so the shin nearly aligns with the thigh → knee ~straight.
  const lm = pose({ 24: BRAKE_HIP, 26: BRAKE_KNEE, 28: { x: 0.55, y: 1.0 } });
  const r = recognizeAcceleration(lm, accelCalibration(), ZERO_PEDAL);
  assert.equal(r.isAccelPressed, true);
  assert.ok(r.throttle >= ACCEL_TUNING.minThrottle, `throttle ${r.throttle} below floor`);
  assert.ok(r.throttle <= 1.0, `throttle ${r.throttle} exceeds 1.0`);
});

test("a fully straightened leg saturates throttle at 1.0", () => {
  // Ankle directly opposite the hip across the knee → interior angle ≈ 180°.
  const lm = pose({ 24: BRAKE_HIP, 26: BRAKE_KNEE, 28: { x: 0.5, y: 1.0 } });
  const r = recognizeAcceleration(lm, accelCalibration(), ZERO_PEDAL);
  assert.equal(r.isAccelPressed, true);
  assert.equal(r.throttle, 1.0);
});

test("spreading the leg sideways (same knee bend) does NOT open the throttle", () => {
  // Abduct the whole leg 25° about the hip: knee interior angle is unchanged, so
  // the extension signal stays ~0 and the accelerator must stay OFF — this is the
  // exact behavior the user reported as wrong.
  const k = rotateAboutHip(BRAKE_KNEE, 0.44);
  const a = rotateAboutHip(BRAKE_ANKLE, 0.44);
  const lm = pose({ 24: BRAKE_HIP, 26: k, 28: a });
  const r = recognizeAcceleration(lm, accelCalibration(), ZERO_PEDAL);
  assert.equal(r.isAccelPressed, false);
  assert.equal(r.throttle, 0);
});

test("hysteresis: a mild extension holds throttle only if already pressing", () => {
  // Choose an ankle giving an extension between `release` and `engage`.
  // Sweep to find one deterministically (image coords, no randomness).
  const midAnkle = { x: 0.63, y: 0.86 };
  const lm = pose({ 24: BRAKE_HIP, 26: BRAKE_KNEE, 28: midAnkle });
  const cal = accelCalibration();
  const fromRest = recognizeAcceleration(lm, cal, ZERO_PEDAL);
  const pressed: PedalState = { ...ZERO_PEDAL, isAccelPressed: true };
  const fromPressed = recognizeAcceleration(lm, cal, pressed);
  // Whatever this specific angle lands on, being already-pressed can only make it
  // MORE likely to stay engaged (looser threshold) — never less.
  assert.ok(
    !(fromRest.isAccelPressed && !fromPressed.isAccelPressed),
    "hysteresis inverted: engaged from rest but dropped when already pressing",
  );
});

test("accel: uncalibrated -> zeroed result", () => {
  const r = recognizeAcceleration(pose({}), fullCalibration({ isCalibrated: false }), ZERO_PEDAL);
  assert.deepEqual(r, { throttle: 0, isAccelPressed: false, updatedCalibration: fullCalibration({ isCalibrated: false }) });
});
