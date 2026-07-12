import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * Pure head-pose (yaw) + gaze estimate from ONE face's MediaPipe landmarks.
 *
 * Extracted verbatim from VisionController's per-frame loop so it matches the
 * `steeringGear.ts` / `pedalDecision.ts` precedent (pure fn, caller applies the
 * result to the store). The controller previously computed this inline — it was
 * the last landmark math not covered by a `node --test` suite.
 *
 * Indices are MediaPipe FaceLandmarker points: nose tip (1), ear tragions
 * (234/454), and the eye inner/outer corners + iris centers (33/133/468 left,
 * 362/263/473 right).
 */
const IDX = {
  nose: 1,
  leftEar: 234,
  rightEar: 454,
  leftInner: 33,
  leftOuter: 133,
  leftIris: 468,
  rightInner: 362,
  rightOuter: 263,
  rightIris: 473,
} as const;

export interface HeadPose {
  /** Yaw in the store's setHeadRotation units (feeds mirror/safety checkpoints). */
  yaw: number;
  /** Iris-offset gaze estimate. `y` is always 0 (pitch is not estimated). */
  gaze: { x: number; y: number };
}

/**
 * Returns the head pose, or `null` when landmarks are absent or any required
 * index is missing — in which case the caller leaves the previous store values
 * in place (the original inline code was guarded by the same presence checks).
 */
export function computeHeadPose(
  landmarks: NormalizedLandmark[] | null | undefined,
): HeadPose | null {
  if (!landmarks) return null;
  const nose = landmarks[IDX.nose];
  const leftEar = landmarks[IDX.leftEar];
  const rightEar = landmarks[IDX.rightEar];
  const leftInner = landmarks[IDX.leftInner];
  const leftOuter = landmarks[IDX.leftOuter];
  const leftIris = landmarks[IDX.leftIris];
  const rightInner = landmarks[IDX.rightInner];
  const rightOuter = landmarks[IDX.rightOuter];
  const rightIris = landmarks[IDX.rightIris];
  if (
    !nose || !leftEar || !rightEar ||
    !leftInner || !leftOuter || !leftIris ||
    !rightInner || !rightOuter || !rightIris
  ) {
    return null;
  }

  // Yaw: nose horizontal offset from the ear midpoint, scaled and negated
  // (verbatim from the original: setHeadRotation.yaw = -(nose.x - midEarX) * 20).
  const midEarX = (leftEar.x + rightEar.x) / 2;
  const yaw = -(nose.x - midEarX) * 20;

  // Gaze x: average normalized iris position within each eye, recentred on 0.
  const leftRatio = (leftIris.x - leftInner.x) / (leftOuter.x - leftInner.x);
  const rightRatio = (rightIris.x - rightInner.x) / (rightOuter.x - rightInner.x);
  const avgRatio = (leftRatio + rightRatio) / 2;

  return { yaw, gaze: { x: (avgRatio - 0.5) * 5, y: 0 } };
}
