import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import {
  checkFootStability,
  processPedalRecognition,
  type FootCalibration,
  type PedalState,
} from "../footPedalRecognition.ts";
import type { ScreenId } from "../store";

export type CalibrationStage = "idle" | "waiting_for_brake" | "calibrated";

/**
 * Pure calibration/pedal-recognition state machine, extracted verbatim from
 * VisionController's processPoseForPedals (the lines after the canvas drawing).
 * Given the already-filtered landmarks and the store snapshot, it decides which
 * store writes + which debug string the controller should apply, and returns
 * them as an intent object.
 *
 * No store, canvas, refs, or performance.now() of its own. The keyboard-mode
 * gate and the One-Euro filtering stay in the controller; this function is not
 * entered in keyboard mode. Calls the already-pure checkFootStability /
 * processPedalRecognition directly (the scoring.ts precedent: no DI).
 */
export interface PedalDecisionInput {
  /** result.landmarks[0] after One-Euro filtering, or null when no pose was detected. */
  filteredLandmarks: NormalizedLandmark[] | null;
  calibrationStage: CalibrationStage;
  pedalState: PedalState;
  footCalibration: FootCalibration | null;
  /** useDrivingStore.getState().screen; pedal recognition runs only when 'driving'. */
  screen: ScreenId;
  /** The controller's single per-frame performance.now(); fed to checkFootStability only. */
  currentTime: number;
  deltaTime: number;
  /** From computeSteeringAndGear(...).info; prefixes every pedal debug string. */
  handInfo: string;
}

export interface PedalDecision {
  /** Present iff the original branch called setFootCalibration. Wrapped so a null value is distinguishable from "no write". */
  setFootCalibration?: { value: FootCalibration | null };
  /** Present iff the original branch called setCalibrationStage. */
  setCalibrationStage?: CalibrationStage;
  /** Present iff the original branch called updatePedalState. */
  updatePedalState?: PedalState;
  /** Always present: the exact string the original passed to setDebugInfoThrottled. */
  debugInfo: string;
}

export function decidePedalActions(input: PedalDecisionInput): PedalDecision {
  const { filteredLandmarks, calibrationStage, pedalState, footCalibration, screen, currentTime, deltaTime, handInfo } = input;

  const decision: PedalDecision = { debugInfo: handInfo };

  // Handling based on the calibration stage
  if (["idle", "waiting_for_brake"].includes(calibrationStage)) {
    // During calibration - check foot-position stability
    if (filteredLandmarks) {
      const stabilityCheck = checkFootStability(filteredLandmarks, footCalibration, currentTime);

      if (stabilityCheck.calibration) {
        decision.setFootCalibration = { value: stabilityCheck.calibration };

        if (stabilityCheck.isStable) {
          // Calibration complete once the foot stayed stable long enough.
          decision.setCalibrationStage = "calibrated";
          decision.debugInfo = `${handInfo} | Foot calibration complete!`;
          // NOTE: do NOT auto-navigate to the driving screen here (the original
          // explicitly avoided it; screen transitions are owned by the UI).
        } else {
          // Stabilizing - show the progress
          const progressPercent = (stabilityCheck.progress * 100).toFixed(0);
          decision.debugInfo = `${handInfo} | Please keep your foot still... ${progressPercent}%`;

          // On the first pass, advance idle -> waiting_for_brake
          if (calibrationStage === "idle") {
            decision.setCalibrationStage = "waiting_for_brake";
          }
        }
      } else {
        decision.debugInfo = `${handInfo} | Foot not detected. Please sit in the chair`;
      }
    } else {
      decision.debugInfo = `${handInfo} | Foot not detected`;
    }
  } else if (calibrationStage === "calibrated" && footCalibration && footCalibration.isCalibrated) {
    // Calibration complete - run pedal recognition
    if (filteredLandmarks) {
      // Run pedal recognition only when the screen is 'driving'
      if (screen === "driving") {
        const recognitionResult = processPedalRecognition(
          filteredLandmarks,
          footCalibration,
          pedalState,
          deltaTime,
        );

        decision.setFootCalibration = { value: recognitionResult.updatedCalibration };
        decision.updatePedalState = recognitionResult.pedalState;

        const { throttle, brake, isAccelPressed, isBrakePressed } = recognitionResult.pedalState;
        decision.debugInfo =
          `${handInfo} | Accel: ${isAccelPressed ? "ON" : "OFF"} (${(throttle * 100).toFixed(0)}%) | ` +
          `Brake: ${isBrakePressed ? "ON" : "OFF"} (${(brake * 100).toFixed(0)}%)`;
      } else {
        // Reset the pedal state outside the driving screen
        decision.updatePedalState = {
          throttle: 0,
          brake: 0,
          isAccelPressed: false,
          isBrakePressed: false,
          brakePressDuration: 0,
          brakePressCount: 0,
        };
        decision.debugInfo = `${handInfo} | Calibration complete`;
      }
    } else {
      decision.debugInfo = `${handInfo} | Foot not detected`;
    }
  } else {
    decision.debugInfo = handInfo;
  }

  return decision;
}
