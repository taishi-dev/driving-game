/**
 * Utility functions for recognizing foot pedal operations.
 * Uses the MediaPipe PoseLandmarker to recognize the accelerator and brake from
 * the position and angle of the foot.
 *
 * ## Usage
 *
 * ### 1. Calibration (initial setup)
 * At the start of driving, while the user is seated in the chair and pressing
 * the brake:
 * ```typescript
 * import { calibrateFootPosition } from './footPedalRecognition';
 *
 * // Landmarks obtained from the MediaPipe PoseLandmarker
 * const calibration = calibrateFootPosition(landmarks);
 * if (calibration) {
 *   // Save to the store
 *   useDrivingStore.getState().setFootCalibration(calibration);
 *   useDrivingStore.getState().setCalibrationStage('calibrated');
 * }
 * ```
 *
 * ### 2. Running pedal recognition
 * Call the following on each frame:
 * ```typescript
 * import { processPedalRecognition } from './footPedalRecognition';
 *
 * const store = useDrivingStore.getState();
 * const result = processPedalRecognition(
 *   landmarks,
 *   store.footCalibration,
 *   store.pedalState,
 *   deltaTime // Elapsed time since the previous frame (ms)
 * );
 *
 * // Update the calibration (record the accelerator press position)
 * store.setFootCalibration(result.updatedCalibration);
 *
 * // Update the pedal state (throttle/brake are updated automatically too)
 * store.updatePedalState(result.pedalState);
 * ```
 *
 * ## Behavior specification
 *
 * ### Calibration
 * - Sit in the chair and place the right foot in the brake position
 * - Keep the foot still for 5 seconds
 * - Calibration completes automatically once the foot position is stable
 * - Transitions automatically to the driving screen even while paused or on the start screen
 *
 * ### Accelerator
 * - Moving the foot from the initial position (brake position) to the right (left as seen by the camera) turns the accelerator ON
 * - Records the pressed position and holds the accelerator at that position
 * - Returning to the initial position, or moving to a place different from the pressed position, turns the accelerator OFF
 * - When the accelerator is OFF, creep produces slow forward movement (throttle = 0.05)
 * - Adjusts the accelerator strength by the angle of the foot tip (it gets stronger as the tip lowers)
 *
 * ### Brake
 * - Tilting the foot tip toward the ground relative to the initial position (reference position) turns the brake ON
 * - Controls the brake strength by the degree of tilt
 * - A short brake (under 300ms) acts as a pumping brake with weak deceleration
 * - A long brake (1 second or more) gradually increases the deceleration
 */

import { NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * How long (ms) the foot must stay still for calibration to complete.
 * Shared so the calibration logic and the on-screen progress indicator agree.
 */
export const STABILITY_DURATION_MS = 5000;

/**
 * Type that stores the initial position and angle of the foot
 */
export interface FootCalibration {
  // Reference position of the right foot (while pressing the brake)
  rightAnkle: { x: number; y: number; z: number };
  rightHeel: { x: number; y: number; z: number };
  rightFootIndex: { x: number; y: number; z: number };
  rightKnee: { x: number; y: number; z: number };

  // Reference position of the left foot
  leftAnkle: { x: number; y: number; z: number };
  leftHeel: { x: number; y: number; z: number };
  leftFootIndex: { x: number; y: number; z: number };
  leftKnee: { x: number; y: number; z: number };

  // Reference position of the hips
  leftHip: { x: number; y: number; z: number };
  rightHip: { x: number; y: number; z: number };
  hipCenter: { x: number; y: number; z: number };

  // Reference angles (foot-tip angles)
  rightFootAngle: number;
  leftFootAngle: number;

  // Angle from the hip midpoint to the right knee (reference while braking)
  hipToRightKneeAngle: number;

  // Position when the accelerator is pressed (recorded on the first press)
  accelPressPosition: { x: number; y: number; z: number } | null;
  accelPressAngle: number | null;

  // Calibration-complete flag
  isCalibrated: boolean;

  // For the stability check (verifying position over 5 seconds)
  stabilityCheckStartTime: number | null;
  stabilityCheckPosition: { x: number; y: number; z: number } | null;

  // For smoothing (stores the previous values)
  smoothedKneeAngle: number | null;
  smoothedFootAngle: number | null;
  smoothedHipCenter: { x: number; y: number; z: number } | null;
  smoothedRightKnee: { x: number; y: number; z: number } | null;
}

/**
 * State of the pedal operation
 */
export interface PedalState {
  throttle: number; // 0.0 - 1.0
  brake: number; // 0.0 - 1.0
  isAccelPressed: boolean; // Whether the accelerator is pressed
  isBrakePressed: boolean; // Whether the brake is pressed
  brakePressDuration: number; // How long the brake has been pressed (ms)
  brakePressCount: number; // Number of times the brake was pressed (for pumping braking)
}

/**
 * Indices of the MediaPipe pose landmarks
 * https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
 */
const POSE_LANDMARKS = {
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
};

/**
 * Calculate the angle from the ankle to the foot tip (radians)
 * Computes the tilt relative to the ground
 */
function calculateFootAngle(
  ankle: NormalizedLandmark,
  footIndex: NormalizedLandmark
): number {
  const dy = footIndex.y - ankle.y;
  const dx = footIndex.x - ankle.x;
  return Math.atan2(dy, dx);
}

/**
 * Calculate the angle between two points (radians)
 * Angle relative to the horizontal line
 */
function calculateAngleBetweenPoints(
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number }
): number {
  const dy = p2.y - p1.y;
  const dx = p2.x - p1.x;
  return Math.atan2(dy, dx);
}

/**
 * Calculate the distance between two points
 */
function calculateDistance(
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number }
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Initial calibration: record the foot position and angle while pressing the brake
 */
export function calibrateFootPosition(
  landmarks: NormalizedLandmark[]
): FootCalibration | null {
  if (landmarks.length < 33) {
    return null; // No pose detected
  }

  const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
  const leftKnee = landmarks[POSE_LANDMARKS.LEFT_KNEE];
  const rightKnee = landmarks[POSE_LANDMARKS.RIGHT_KNEE];
  const rightAnkle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];
  const rightHeel = landmarks[POSE_LANDMARKS.RIGHT_HEEL];
  const rightFootIndex = landmarks[POSE_LANDMARKS.RIGHT_FOOT_INDEX];
  const leftAnkle = landmarks[POSE_LANDMARKS.LEFT_ANKLE];
  const leftHeel = landmarks[POSE_LANDMARKS.LEFT_HEEL];
  const leftFootIndex = landmarks[POSE_LANDMARKS.LEFT_FOOT_INDEX];

  // Check landmark confidence (when visibility is present)
  const minVisibility = 0.5;
  if (
    rightAnkle.visibility !== undefined && rightAnkle.visibility < minVisibility ||
    rightFootIndex.visibility !== undefined && rightFootIndex.visibility < minVisibility ||
    rightKnee.visibility !== undefined && rightKnee.visibility < minVisibility ||
    rightHip.visibility !== undefined && rightHip.visibility < minVisibility
  ) {
    return null;
  }

  // Calculate the hip midpoint
  const hipCenter = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
    z: (leftHip.z + rightHip.z) / 2,
  };

  // Calculate the angle from the hip midpoint to the right knee
  const hipToRightKneeAngle = calculateAngleBetweenPoints(
    hipCenter,
    { x: rightKnee.x, y: rightKnee.y, z: rightKnee.z }
  );

  return {
    leftHip: { x: leftHip.x, y: leftHip.y, z: leftHip.z },
    rightHip: { x: rightHip.x, y: rightHip.y, z: rightHip.z },
    hipCenter,
    leftKnee: { x: leftKnee.x, y: leftKnee.y, z: leftKnee.z },
    rightKnee: { x: rightKnee.x, y: rightKnee.y, z: rightKnee.z },
    rightAnkle: { x: rightAnkle.x, y: rightAnkle.y, z: rightAnkle.z },
    rightHeel: { x: rightHeel.x, y: rightHeel.y, z: rightHeel.z },
    rightFootIndex: { x: rightFootIndex.x, y: rightFootIndex.y, z: rightFootIndex.z },
    leftAnkle: { x: leftAnkle.x, y: leftAnkle.y, z: leftAnkle.z },
    leftHeel: { x: leftHeel.x, y: leftHeel.y, z: leftHeel.z },
    leftFootIndex: { x: leftFootIndex.x, y: leftFootIndex.y, z: leftFootIndex.z },
    rightFootAngle: calculateFootAngle(rightAnkle, rightFootIndex),
    leftFootAngle: calculateFootAngle(leftAnkle, leftFootIndex),
    hipToRightKneeAngle,
    accelPressPosition: null, // The accelerator press position is null at initialization
    accelPressAngle: null,
    isCalibrated: false, // false before the stability check
    stabilityCheckStartTime: null,
    stabilityCheckPosition: null,
    smoothedKneeAngle: null, // Initial value for smoothing
    smoothedFootAngle: null,
    smoothedHipCenter: null,
    smoothedRightKnee: null,
  };
}

/**
 * Check foot-position stability over 5 seconds
 * @returns { isStable: boolean, progress: number (0-1), calibration: FootCalibration }
 */
export function checkFootStability(
  landmarks: NormalizedLandmark[],
  previousCalibration: FootCalibration | null,
  currentTime: number
): { isStable: boolean; progress: number; calibration: FootCalibration | null } {
  if (landmarks.length < 33) {
    return { isStable: false, progress: 0, calibration: null };
  }

  const rightAnkle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];
  const currentPosition = { x: rightAnkle.x, y: rightAnkle.y, z: rightAnkle.z };

  const STABILITY_DURATION = STABILITY_DURATION_MS;
  const STABILITY_THRESHOLD = 0.1; // Allowed range for position deviation

  // Reset on the first pass or if the position deviated significantly
  if (!previousCalibration || !previousCalibration.stabilityCheckPosition || !previousCalibration.stabilityCheckStartTime) {
    const newCalibration = calibrateFootPosition(landmarks);
    if (newCalibration) {
      newCalibration.stabilityCheckStartTime = currentTime;
      newCalibration.stabilityCheckPosition = currentPosition;
      newCalibration.isCalibrated = false; // Not stable yet
      return { isStable: false, progress: 0, calibration: newCalibration };
    }
    return { isStable: false, progress: 0, calibration: null };
  }

  // Check whether the position is stable
  const distance = calculateDistance(previousCalibration.stabilityCheckPosition, currentPosition);

  if (distance > STABILITY_THRESHOLD) {
    // Reset if the position deviated
    const newCalibration = calibrateFootPosition(landmarks);
    if (newCalibration) {
      newCalibration.stabilityCheckStartTime = currentTime;
      newCalibration.stabilityCheckPosition = currentPosition;
      newCalibration.isCalibrated = false;
      return { isStable: false, progress: 0, calibration: newCalibration };
    }
    return { isStable: false, progress: 0, calibration: null };
  }

  // Calculate the elapsed time
  const elapsedTime = currentTime - previousCalibration.stabilityCheckStartTime;
  const progress = Math.min(elapsedTime / STABILITY_DURATION, 1.0);

  if (elapsedTime >= STABILITY_DURATION) {
    // Calibration is complete if it stayed stable for 5 seconds
    const finalCalibration = { ...previousCalibration };
    finalCalibration.isCalibrated = true;
    return { isStable: true, progress: 1.0, calibration: finalCalibration };
  }

  return { isStable: false, progress, calibration: previousCalibration };
}

/**
 * Recognize the accelerator operation (new logic)
 *
 * Logic:
 * - The accelerator turns ON when the right foot moves from the reference position (brake position) to the right (appears on the left due to camera mirroring)
 * - Record the pressed position
 * - The accelerator turns OFF when returning to the reference position (creep)
 * - The accelerator also turns OFF when it differs from the pressed position
 * - Control the accelerator strength by the change in the foot-tip angle
 */
export function recognizeAcceleration(
  landmarks: NormalizedLandmark[],
  calibration: FootCalibration,
  previousState: PedalState
): { throttle: number; isAccelPressed: boolean; updatedCalibration: FootCalibration } {
  if (!calibration.isCalibrated || landmarks.length < 33) {
    return { throttle: 0, isAccelPressed: false, updatedCalibration: calibration };
  }

  const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
  const rightKnee = landmarks[POSE_LANDMARKS.RIGHT_KNEE];
  const rightAnkle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];
  const rightFootIndex = landmarks[POSE_LANDMARKS.RIGHT_FOOT_INDEX];

  // Current ankle position
  const currentAnklePos = { x: rightAnkle.x, y: rightAnkle.y, z: rightAnkle.z };

  // Current angle of the foot tip
  const currentAngle = calculateFootAngle(rightAnkle, rightFootIndex);

  // Calculate the distance from the reference position (brake position)
  const distanceFromBrake = calculateDistance(calibration.rightAnkle, currentAnklePos);

  // Calculate the current hip midpoint
  const currentHipCenter = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
    z: (leftHip.z + rightHip.z) / 2,
  };

  // Calculate the current angle from the hip midpoint to the right knee
  const currentHipToKneeAngle = calculateAngleBetweenPoints(
    currentHipCenter,
    { x: rightKnee.x, y: rightKnee.y, z: rightKnee.z }
  );

  // Difference from the reference angle
  const kneeAngleDiff = currentHipToKneeAngle - calibration.hipToRightKneeAngle;

  // Threshold settings
  const POSITION_THRESHOLD = 0.03; // Threshold for deciding the reference position (with margin for stability)
  const ACCEL_MOVE_THRESHOLD = 0.01; // Threshold for deciding an accelerator press (from the body center to the right)
  const ACCEL_RETURN_THRESHOLD = 0.02; // Threshold for returning from the accelerator (hysteresis)
  const ANGLE_SENSITIVITY = 7.0; // Angle sensitivity
  const KNEE_ANGLE_THRESHOLD = 0.25; // Hip-knee angle threshold (radians, about 5.8 degrees)

  let isAccelPressed = false;
  let throttle = 0;
  const updatedCalibration = { ...calibration };

  // Calculate the movement in the accelerator direction (accounting for camera mirroring)
  // Actual movement to the right = movement to the left on camera = decrease in the x coordinate
  // In other words, a positive horizontalMovement means the accelerator direction
  const horizontalMovement = calibration.rightAnkle.x - currentAnklePos.x;
  const isMovingToAccel = horizontalMovement > ACCEL_MOVE_THRESHOLD; // Movement to the right (left on camera)

  // Determine whether the hip-knee angle is opening in the accelerator direction
  const isKneeAngleOpening = kneeAngleDiff > KNEE_ANGLE_THRESHOLD;



  // Determine whether the foot is at the reference position (brake position)
  // Hysteresis: use a stricter threshold when the accelerator is pressed
  const brakeThreshold = previousState.isAccelPressed ? ACCEL_RETURN_THRESHOLD : POSITION_THRESHOLD;
  const isAtBrakePosition = distanceFromBrake < brakeThreshold && !isMovingToAccel && !isKneeAngleOpening;
  if (isAtBrakePosition) {
    // At the reference position = accelerator OFF
    isAccelPressed = false;
    throttle = 0;
    // Reset the accelerator press position
    updatedCalibration.accelPressPosition = null;
    updatedCalibration.accelPressAngle = null;
  } else if (isMovingToAccel || isKneeAngleOpening) {
    // Moving in the accelerator direction, or the hip-knee angle is opening

    if (calibration.accelPressPosition === null) {
      // First time moving to the accelerator position
      // Record it as the accelerator press position
      updatedCalibration.accelPressPosition = currentAnklePos;
      updatedCalibration.accelPressAngle = currentAngle;
      isAccelPressed = true;

      // Basic throttle value (based on movement distance)
      const moveDistance = Math.abs(horizontalMovement);
      const baseThrottle = Math.min((moveDistance - ACCEL_MOVE_THRESHOLD) / 0.1, 0.8);
      throttle = Math.max(0.20, baseThrottle); // Minimum 20% to account for creep
    } else {
      // The accelerator press position is already recorded
      // Calculate the distance from the pressed position
      const distanceFromAccel = calculateDistance(calibration.accelPressPosition, currentAnklePos);

      // Determine whether the foot is at the accelerator position (with margin)
      const isAtAccelPosition = distanceFromAccel < POSITION_THRESHOLD * 2;

      if (isAtAccelPosition && isMovingToAccel) {
        // At the accelerator position and in the accelerator direction = accelerator ON
        isAccelPressed = true;

        // Basic throttle value
        const baseThrottle = 0.6;

        // Strength adjustment by the foot-tip angle
        if (calibration.accelPressAngle !== null) {
          const angleDiff = currentAngle - calibration.accelPressAngle;

          // The accelerator gets stronger as the foot tip lowers (the angle increases)
          const angleAdjustment = angleDiff * ANGLE_SENSITIVITY;
          throttle = Math.max(0.20, Math.min(1.0, baseThrottle + angleAdjustment));
        } else {
          throttle = baseThrottle;
        }
      } else {
        // Moved away from the pressed position, or not in the accelerator direction = accelerator OFF
        isAccelPressed = false;
        throttle = 0;
        updatedCalibration.accelPressPosition = null;
        updatedCalibration.accelPressAngle = null;
      }
    }
  } else {
    // Movement other than the accelerator direction = accelerator OFF
    isAccelPressed = false;
    throttle = 0;
    updatedCalibration.accelPressPosition = null;
    updatedCalibration.accelPressAngle = null;
  }

  // Creep implementation (right after releasing the accelerator)
  if (!isAccelPressed && previousState.isAccelPressed && !isAtBrakePosition) {
    // Creep if the accelerator was just released and has not yet returned to the brake position
    throttle = 0.05; // Slow forward movement
  }

  return { throttle, isAccelPressed, updatedCalibration };
}

/**
 * Recognize the brake operation (improved version)
 *
 * Logic:
 * - The brake turns ON when the foot tip tilts toward the ground (downward) relative to the reference position
 * - Control the brake strength by the degree of tilt
 * - The longer the brake is held, the stronger the deceleration gradually becomes
 * - A short brake acts as a pumping brake with weak deceleration
 */
export function recognizeBraking(
  landmarks: NormalizedLandmark[],
  calibration: FootCalibration,
  previousState: PedalState,
  deltaTime: number // Elapsed time since the previous update (ms)
): { brake: number; isBrakePressed: boolean; brakePressDuration: number; brakePressCount: number } {
  if (!calibration.isCalibrated || landmarks.length < 33) {
    return {
      brake: 0,
      isBrakePressed: false,
      brakePressDuration: 0,
      brakePressCount: 0,
    };
  }

  const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
  const rightKnee = landmarks[POSE_LANDMARKS.RIGHT_KNEE];
  const rightAnkle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];
  const rightFootIndex = landmarks[POSE_LANDMARKS.RIGHT_FOOT_INDEX];

  // Calculate the current hip midpoint
  const currentHipCenter = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
    z: (leftHip.z + rightHip.z) / 2,
  };

  // Calculate the current angle from the hip midpoint to the right knee
  const currentHipToKneeAngle = calculateAngleBetweenPoints(
    currentHipCenter,
    { x: rightKnee.x, y: rightKnee.y, z: rightKnee.z }
  );

  // Calculate the difference from the angle at calibration time
  const angleDiff = Math.abs(currentHipToKneeAngle - calibration.hipToRightKneeAngle);

  // Angle threshold for deciding a brake
  const BRAKE_ANGLE_THRESHOLD = 1.2; // A brake is decided if within the radian range (about 5.8 degrees)

  // Current foot-tip angle (for judging brake strength)
  const currentFootAngle = calculateFootAngle(rightAnkle, rightFootIndex);
  const footAngleDiff = currentFootAngle - calibration.rightFootAngle;
  const MAX_BRAKE_FOOT_ANGLE = 0.4;

  let isBrakePressed = false;
  let brake = 0;
  let brakePressDuration = previousState.brakePressDuration;
  let brakePressCount = previousState.brakePressCount;

  // Determine whether the hip-knee angle is roughly the same as at calibration time
  if (angleDiff < BRAKE_ANGLE_THRESHOLD) {
    isBrakePressed = true;

    // Calculate the base brake strength based on the angle
    const angleBasedBrake = Math.min(footAngleDiff / MAX_BRAKE_FOOT_ANGLE, 1.0);

    // Accumulate the time the brake has been held
    brakePressDuration += deltaTime;

    // Simple brake-strength calculation
    brake = Math.max(0, Math.min(angleBasedBrake, 1.0)) * 1.5; // Up to 100% braking force

  } else {
    // The brake was released
    if (previousState.isBrakePressed) {
      // The brake was pressed last time = one brake operation is complete
      brakePressCount += 1;
      brakePressDuration = 0;
    }
    isBrakePressed = false;
    brake = 0;
  }

  return { brake, isBrakePressed, brakePressDuration, brakePressCount };
}

/**
 * Comprehensively process the foot pedal operations (improved version + smoothing support)
 */
export function processPedalRecognition(
  landmarks: NormalizedLandmark[],
  calibration: FootCalibration,
  previousState: PedalState,
  deltaTime: number
): { pedalState: PedalState; updatedCalibration: FootCalibration } {
  if (!calibration.isCalibrated || landmarks.length < 33) {
    return {
      pedalState: {
        throttle: 0,
        brake: 0,
        isAccelPressed: false,
        isBrakePressed: false,
        brakePressDuration: 0,
        brakePressCount: 0,
      },
      updatedCalibration: calibration,
    };
  }

  // Smoothing parameter (exponential moving average)
  const SMOOTHING_ALPHA = 0.3; // Closer to 0 is smoother, closer to 1 reacts faster

  const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
  const rightKnee = landmarks[POSE_LANDMARKS.RIGHT_KNEE];

  // Calculate the current hip midpoint
  const rawHipCenter = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
    z: (leftHip.z + rightHip.z) / 2,
  };

  // Current right-knee coordinates
  const rawRightKnee = { x: rightKnee.x, y: rightKnee.y, z: rightKnee.z };

  // Smoothing: hip midpoint
  let smoothedHipCenter: { x: number; y: number; z: number };
  if (calibration.smoothedHipCenter === null) {
    smoothedHipCenter = rawHipCenter;
  } else {
    smoothedHipCenter = {
      x: SMOOTHING_ALPHA * rawHipCenter.x + (1 - SMOOTHING_ALPHA) * calibration.smoothedHipCenter.x,
      y: SMOOTHING_ALPHA * rawHipCenter.y + (1 - SMOOTHING_ALPHA) * calibration.smoothedHipCenter.y,
      z: SMOOTHING_ALPHA * rawHipCenter.z + (1 - SMOOTHING_ALPHA) * calibration.smoothedHipCenter.z,
    };
  }

  // Smoothing: right-knee coordinates
  let smoothedRightKnee: { x: number; y: number; z: number };
  if (calibration.smoothedRightKnee === null) {
    smoothedRightKnee = rawRightKnee;
  } else {
    smoothedRightKnee = {
      x: SMOOTHING_ALPHA * rawRightKnee.x + (1 - SMOOTHING_ALPHA) * calibration.smoothedRightKnee.x,
      y: SMOOTHING_ALPHA * rawRightKnee.y + (1 - SMOOTHING_ALPHA) * calibration.smoothedRightKnee.y,
      z: SMOOTHING_ALPHA * rawRightKnee.z + (1 - SMOOTHING_ALPHA) * calibration.smoothedRightKnee.z,
    };
  }

  // Calculate the angle using the smoothed coordinates
  const kneeOffsetX = smoothedRightKnee.x - smoothedHipCenter.x;
  const kneeOffsetY = Math.abs(smoothedRightKnee.y - smoothedHipCenter.y);
  const currentKneeAngle = Math.atan2(kneeOffsetX, kneeOffsetY);

  // Angle at calibration time
  const calibKneeOffsetX = calibration.rightKnee.x - calibration.hipCenter.x;
  const calibKneeOffsetY = Math.abs(calibration.rightKnee.y - calibration.hipCenter.y);
  const calibKneeAngle = Math.atan2(calibKneeOffsetX, calibKneeOffsetY);

  // Angle difference (raw value)
  const rawKneeAngleDiff = currentKneeAngle - calibKneeAngle;

  // Smooth the angle too
  let smoothedKneeAngleDiff: number;
  if (calibration.smoothedKneeAngle === null) {
    smoothedKneeAngleDiff = rawKneeAngleDiff;
  } else {
    smoothedKneeAngleDiff = SMOOTHING_ALPHA * rawKneeAngleDiff + (1 - SMOOTHING_ALPHA) * calibration.smoothedKneeAngle;
  }

  // Save the smoothed values into the calibration
  const smoothedCalibration = {
    ...calibration,
    smoothedHipCenter,
    smoothedRightKnee,
    smoothedKneeAngle: smoothedKneeAngleDiff,
  };

  // Accelerator recognition (using the smoothed calibration)
  const accelResult = recognizeAcceleration(landmarks, smoothedCalibration, previousState);

  // Brake recognition (using the updated calibration)
  const brakeResult = recognizeBraking(landmarks, accelResult.updatedCalibration, previousState, deltaTime);

  // Mutual exclusion of accelerator and brake (never both at once)
  const throttle = accelResult.throttle;
  let brake = brakeResult.brake;
  let isBrakePressed = brakeResult.isBrakePressed;

  if (accelResult.isAccelPressed && brakeResult.isBrakePressed) {
    // Prioritize the accelerator when both are pressed (to prevent false brake detection)
    brake = 0;
    isBrakePressed = false;
  }

  const pedalState: PedalState = {
    throttle,
    brake,
    isAccelPressed: accelResult.isAccelPressed,
    isBrakePressed: isBrakePressed,
    brakePressDuration: brakeResult.brakePressDuration,
    brakePressCount: brakeResult.brakePressCount,
  };

  return {
    pedalState,
    updatedCalibration: accelResult.updatedCalibration,
  };
}

/**
 * Helper function for resetting the brake count
 * Resets the count if the brake has not been pressed for a certain time
 */
export function shouldResetBrakeCount(
  pedalState: PedalState,
  timeSinceLastBrake: number // Elapsed time since the brake was last released (ms)
): boolean {
  const RESET_THRESHOLD = 2000; // 2 seconds
  return !pedalState.isBrakePressed && timeSinceLastBrake > RESET_THRESHOLD;
}

/**
 * Return a PedalState with the brake count reset
 */
export function resetBrakeCount(pedalState: PedalState): PedalState {
  return {
    ...pedalState,
    brakePressCount: 0,
  };
}
