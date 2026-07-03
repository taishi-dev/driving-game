import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getVisionStatusDisplay,
  cameraErrorMessage,
  progressPercentFromDebugInfo,
} from "../src/lib/vision/visionStatus.ts";
import type { PedalState } from "../src/lib/footPedalRecognition.ts";

const idlePedals: PedalState = {
  throttle: 0,
  brake: 0,
  isAccelPressed: false,
  isBrakePressed: false,
  brakePressDuration: 0,
  brakePressCount: 0,
};

test("progressPercentFromDebugInfo extracts the first percentage", () => {
  assert.equal(progressPercentFromDebugInfo("Hands: 0 | Please keep your foot still... 45%"), 45);
  assert.equal(progressPercentFromDebugInfo("100%"), 100);
});

test("progressPercentFromDebugInfo returns 0 when no percentage present", () => {
  assert.equal(progressPercentFromDebugInfo("Hands: 0 | Foot not detected"), 0);
  assert.equal(progressPercentFromDebugInfo(""), 0);
});

test("starting/idle-camera state shows the raw debugInfo as the message (info tone)", () => {
  const view = getVisionStatusDisplay(
    { calibrationStage: "idle", pedalState: idlePedals, footCalibrated: false, debugInfo: "Loading AI Models..." },
    "en",
  );
  assert.equal(view.tone, "info");
  assert.equal(view.message, "Loading AI Models...");
  assert.match(view.title, /Starting camera/);
});

test("waiting_for_brake reports calibration progress in both languages", () => {
  const en = getVisionStatusDisplay(
    { calibrationStage: "waiting_for_brake", pedalState: idlePedals, footCalibrated: false, debugInfo: "still... 60%" },
    "en",
  );
  assert.equal(en.tone, "calibrating");
  assert.match(en.message, /60%/);
  assert.match(en.message, /5 seconds/);

  const ja = getVisionStatusDisplay(
    { calibrationStage: "waiting_for_brake", pedalState: idlePedals, footCalibrated: false, debugInfo: "still... 60%" },
    "ja",
  );
  assert.equal(ja.tone, "calibrating");
  assert.match(ja.message, /60%/);
  assert.notEqual(ja.title, en.title); // localized
});

test("calibrated + brake pressed reports braking force", () => {
  const view = getVisionStatusDisplay(
    {
      calibrationStage: "calibrated",
      pedalState: { ...idlePedals, brake: 0.42, isBrakePressed: true },
      footCalibrated: true,
      debugInfo: "",
    },
    "en",
  );
  assert.equal(view.tone, "brake");
  assert.match(view.message, /42%/);
});

test("calibrated + accel pressed reports throttle", () => {
  const view = getVisionStatusDisplay(
    {
      calibrationStage: "calibrated",
      pedalState: { ...idlePedals, throttle: 0.7, isAccelPressed: true },
      footCalibrated: true,
      debugInfo: "",
    },
    "en",
  );
  assert.equal(view.tone, "accel");
  assert.match(view.message, /70%/);
});

test("calibrated + no pedal is idle", () => {
  const view = getVisionStatusDisplay(
    { calibrationStage: "calibrated", pedalState: idlePedals, footCalibrated: true, debugInfo: "" },
    "en",
  );
  assert.equal(view.tone, "idle");
});

test("calibrated but not yet calibrated flag falls back to info tone", () => {
  const view = getVisionStatusDisplay(
    { calibrationStage: "calibrated", pedalState: idlePedals, footCalibrated: false, debugInfo: "x" },
    "en",
  );
  assert.equal(view.tone, "info");
});

test("cameraErrorMessage localizes all three kinds", () => {
  for (const kind of ["unsupported", "denied", "error"] as const) {
    const en = cameraErrorMessage(kind, "en");
    const ja = cameraErrorMessage(kind, "ja");
    assert.ok(en.title.length > 0 && en.body.length > 0);
    assert.ok(ja.title.length > 0 && ja.body.length > 0);
    assert.notEqual(en.body, ja.body); // genuinely localized
  }
});
