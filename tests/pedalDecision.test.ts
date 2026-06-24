import { test } from "node:test";
import assert from "node:assert/strict";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

import { decidePedalActions } from "../src/lib/vision/pedalDecision.ts";
import {
  calibrateFootPosition,
  processPedalRecognition,
  STABILITY_DURATION_MS,
  type FootCalibration,
  type PedalState,
} from "../src/lib/footPedalRecognition.ts";

const HANDINFO = "Hands: 0 | Gear: D | Str: 0.00";

const ZERO_PEDAL: PedalState = {
  throttle: 0,
  brake: 0,
  isAccelPressed: false,
  isBrakePressed: false,
  brakePressDuration: 0,
  brakePressCount: 0,
};

// 33-point pose fixture. All landmarks present (so the helpers never read
// undefined); overrides set position/visibility for specific indices.
function pose(overrides: Record<number, { x?: number; y?: number; z?: number; visibility?: number }> = {}): NormalizedLandmark[] {
  const arr: NormalizedLandmark[] = [];
  for (let i = 0; i < 33; i++) {
    const o = overrides[i] ?? {};
    arr.push({ x: o.x ?? 0.5, y: o.y ?? 0.5, z: o.z ?? 0, visibility: o.visibility ?? 1 });
  }
  return arr;
}

// A valid pose where the right-side joints are clearly visible, so
// calibrateFootPosition succeeds.
function validPose(): NormalizedLandmark[] {
  return pose({
    23: { x: 0.4, y: 0.5 }, // left hip
    24: { x: 0.6, y: 0.5 }, // right hip
    25: { x: 0.4, y: 0.7 }, // left knee
    26: { x: 0.6, y: 0.7 }, // right knee
    27: { x: 0.4, y: 0.85 }, // left ankle
    28: { x: 0.5, y: 0.8 }, // right ankle
    29: { x: 0.4, y: 0.9 }, // left heel
    30: { x: 0.55, y: 0.85 }, // right heel
    31: { x: 0.4, y: 0.95 }, // left foot index
    32: { x: 0.6, y: 0.9 }, // right foot index
  });
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

test("idle + null landmarks -> only 'Foot not detected'", () => {
  const d = decidePedalActions({
    filteredLandmarks: null, calibrationStage: "idle", pedalState: ZERO_PEDAL,
    footCalibration: null, screen: "driving", currentTime: 0, deltaTime: 16, handInfo: HANDINFO,
  });
  assert.equal(d.debugInfo, `${HANDINFO} | Foot not detected`);
  assert.equal(d.setFootCalibration, undefined);
  assert.equal(d.setCalibrationStage, undefined);
  assert.equal(d.updatePedalState, undefined);
});

test("idle + first stabilizing pass -> setFootCalibration + waiting_for_brake + 0%", () => {
  const d = decidePedalActions({
    filteredLandmarks: validPose(), calibrationStage: "idle", pedalState: ZERO_PEDAL,
    footCalibration: null, screen: "driving", currentTime: 1000, deltaTime: 16, handInfo: HANDINFO,
  });
  assert.ok(d.setFootCalibration, "expected a setFootCalibration intent");
  assert.equal(d.setCalibrationStage, "waiting_for_brake");
  assert.equal(d.debugInfo, `${HANDINFO} | Please keep your foot still... 0%`);
});

test("held past the stability window -> calibrated + 'Foot calibration complete!', no navigation", () => {
  // startTime must be non-zero: checkFootStability treats a falsy start as "unset".
  const prev = fullCalibration({ stabilityCheckStartTime: 100, stabilityCheckPosition: { x: 0.5, y: 0.8, z: 0 } });
  const d = decidePedalActions({
    filteredLandmarks: validPose(), // right ankle (28) at (0.5,0.8) matches stabilityCheckPosition
    calibrationStage: "waiting_for_brake", pedalState: ZERO_PEDAL,
    footCalibration: prev, screen: "driving", currentTime: 100 + STABILITY_DURATION_MS + 100, deltaTime: 16, handInfo: HANDINFO,
  });
  assert.equal(d.setCalibrationStage, "calibrated");
  assert.equal(d.debugInfo, `${HANDINFO} | Foot calibration complete!`);
  assert.ok(d.setFootCalibration, "expected setFootCalibration");
  assert.equal(d.setFootCalibration!.value!.isCalibrated, true);
});

test("idle + landmarks but invisible right ankle -> 'sit in the chair'", () => {
  const bad = validPose();
  bad[28] = { ...bad[28], visibility: 0.3 }; // right ankle not confident -> calibrate returns null
  const d = decidePedalActions({
    filteredLandmarks: bad, calibrationStage: "idle", pedalState: ZERO_PEDAL,
    footCalibration: null, screen: "driving", currentTime: 0, deltaTime: 16, handInfo: HANDINFO,
  });
  assert.equal(d.debugInfo, `${HANDINFO} | Foot not detected. Please sit in the chair`);
  assert.equal(d.setFootCalibration, undefined);
  assert.equal(d.setCalibrationStage, undefined);
});

test("calibrated + screen 'driving' -> recognition wired correctly", () => {
  const cal = { ...calibrateFootPosition(validPose())!, isCalibrated: true };
  const lm = validPose();
  const expected = processPedalRecognition(lm, cal, ZERO_PEDAL, 16);
  const d = decidePedalActions({
    filteredLandmarks: lm, calibrationStage: "calibrated", pedalState: ZERO_PEDAL,
    footCalibration: cal, screen: "driving", currentTime: 0, deltaTime: 16, handInfo: HANDINFO,
  });
  assert.deepEqual(d.setFootCalibration?.value, expected.updatedCalibration);
  assert.deepEqual(d.updatePedalState, expected.pedalState);
  const { throttle, brake, isAccelPressed, isBrakePressed } = expected.pedalState;
  const expectedDebug =
    `${HANDINFO} | Accel: ${isAccelPressed ? "ON" : "OFF"} (${(throttle * 100).toFixed(0)}%) | ` +
    `Brake: ${isBrakePressed ? "ON" : "OFF"} (${(brake * 100).toFixed(0)}%)`;
  assert.equal(d.debugInfo, expectedDebug);
  assert.equal(d.setCalibrationStage, undefined);
  // Structural check, independent of the recomputed string above, to catch a
  // spacing / toFixed / ON-OFF wording regression in the format itself.
  assert.match(
    d.debugInfo,
    /^Hands: 0 \| Gear: D \| Str: 0\.00 \| Accel: (ON|OFF) \(\d+%\) \| Brake: (ON|OFF) \(\d+%\)$/,
  );
});

test("waiting_for_brake + partial progress -> 50%, and stage is NOT re-written", () => {
  // Already past idle, mid-stabilization (elapsed 1500 of 3000 -> progress 0.5).
  const prev = fullCalibration({ stabilityCheckStartTime: 100, stabilityCheckPosition: { x: 0.5, y: 0.8, z: 0 } });
  const d = decidePedalActions({
    filteredLandmarks: validPose(), // right ankle (28) at (0.5,0.8) matches stabilityCheckPosition
    calibrationStage: "waiting_for_brake", pedalState: ZERO_PEDAL,
    footCalibration: prev, screen: "driving", currentTime: 100 + STABILITY_DURATION_MS * 0.5, deltaTime: 16, handInfo: HANDINFO,
  });
  assert.ok(d.setFootCalibration, "expected setFootCalibration");
  assert.equal(d.setCalibrationStage, undefined); // not re-written once past idle
  assert.equal(d.debugInfo, `${HANDINFO} | Please keep your foot still... 50%`);
});

test("calibrated + screen 'home' -> zeroed reset + 'Calibration complete', no recognition", () => {
  const cal = { ...calibrateFootPosition(validPose())!, isCalibrated: true };
  const d = decidePedalActions({
    filteredLandmarks: validPose(), calibrationStage: "calibrated", pedalState: ZERO_PEDAL,
    footCalibration: cal, screen: "home", currentTime: 0, deltaTime: 16, handInfo: HANDINFO,
  });
  assert.deepEqual(d.updatePedalState, {
    throttle: 0, brake: 0, isAccelPressed: false, isBrakePressed: false, brakePressDuration: 0, brakePressCount: 0,
  });
  assert.equal(d.debugInfo, `${HANDINFO} | Calibration complete`);
  assert.equal(d.setFootCalibration, undefined);
  assert.equal(d.setCalibrationStage, undefined);
});

test("calibrated + null landmarks -> 'Foot not detected'", () => {
  const cal = { ...calibrateFootPosition(validPose())!, isCalibrated: true };
  const d = decidePedalActions({
    filteredLandmarks: null, calibrationStage: "calibrated", pedalState: ZERO_PEDAL,
    footCalibration: cal, screen: "driving", currentTime: 0, deltaTime: 16, handInfo: HANDINFO,
  });
  assert.equal(d.debugInfo, `${HANDINFO} | Foot not detected`);
  assert.equal(d.updatePedalState, undefined);
});

test("calibrated stage but not isCalibrated -> else branch, debugInfo === handInfo", () => {
  const d = decidePedalActions({
    filteredLandmarks: validPose(), calibrationStage: "calibrated", pedalState: ZERO_PEDAL,
    footCalibration: fullCalibration({ isCalibrated: false }), screen: "driving", currentTime: 0, deltaTime: 16, handInfo: HANDINFO,
  });
  assert.equal(d.debugInfo, HANDINFO);
  assert.equal(d.setFootCalibration, undefined);
  assert.equal(d.setCalibrationStage, undefined);
  assert.equal(d.updatePedalState, undefined);
});
