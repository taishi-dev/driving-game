import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * Pure steering + gear computation, extracted from VisionController's
 * processSteeringAndGear. Takes a frame's hand landmarks, object detections,
 * and the current gear; returns the computed gear, steering, and debug string.
 *
 * No store, canvas, refs, or clock: the controller reads the current gear,
 * applies setGear (only when changed) and setSteering, and uses `info` — exactly
 * as before. Mirrors the scoring.ts precedent (pure fn, caller applies result).
 */
export interface SteeringGearInput {
  /** handResult.landmarks: one entry per detected hand (each a 21-point array). Only index 0 (wrist) and 9 (middle-finger MCP) are read. */
  landmarks: NormalizedLandmark[][];
  /** objectResult?.detections ?? null. Only detections[0].categories[0].categoryName is read. */
  detections: { categories: { categoryName?: string }[] }[] | null;
}

export interface SteeringGearResult {
  /** Freshly computed gear; only ever "D" or "R" (the original never writes "P"). */
  newGear: "D" | "R";
  /** Index into landmarks[] of the gear-zone hand, or -1. The controller does not use it; returned for testing the gear-hand exclusion. */
  gearHandIndex: number;
  /** Deadzoned (|s|<0.05 -> 0) then clamped to [-1, 1]. */
  steering: number;
  /** Raw signed angle before deadzone/clamp (the original `angle` local). */
  angle: number;
  /** Byte-identical to the original info string. */
  info: string;
}

export function computeSteeringAndGear(input: SteeringGearInput): SteeringGearResult {
  const { landmarks, detections } = input;
  const hands = landmarks.length;
  let info = `Hands: ${hands}`;

  // --- Gear Logic ---
  // Gear Zone: right side of the screen, lower half (x: 0.8~1.0, y: 0.5~1.0).
  // A hand in this zone shifts to REVERSE; otherwise DRIVE (default).
  let newGear: "D" | "R" = "D";
  let gearHandIndex = -1;

  for (let i = 0; i < hands; i++) {
    const wrist = landmarks[i][0];
    if (wrist.x > 0.8 && wrist.y > 0.5) {
      newGear = "R";
      gearHandIndex = i;
      break; // Found a gear hand
    }
  }

  info += ` | Gear: ${newGear}`;

  // --- Steering Logic ---
  // Use hands that are NOT the gear hand.
  const steeringHands = [];
  for (let i = 0; i < hands; i++) {
    if (i !== gearHandIndex) {
      steeringHands.push(landmarks[i]);
    }
  }

  let steering = 0;
  let angle = 0;

  if (steeringHands.length >= 2) {
    // Two-Hand Steering (Standard): sort by x to distinguish left/right.
    const h1 = steeringHands[0][9]; // Middle finger MCP
    const h2 = steeringHands[1][9];

    let left, right;
    if (h1.x < h2.x) { left = steeringHands[0][9]; right = steeringHands[1][9]; }
    else { left = steeringHands[1][9]; right = steeringHands[0][9]; }

    const dy = right.y - left.y;
    const dx = right.x - left.x;
    angle = Math.atan2(dy, dx);

    const sensitivity = 0.8;
    steering = -angle * sensitivity;
  } else if (steeringHands.length === 1) {
    // Single-Hand Steering: tilt of the single hand (wrist -> middle MCP).
    const wrist = steeringHands[0][0];
    const middle = steeringHands[0][9];

    const dy = middle.y - wrist.y;
    const dx = middle.x - wrist.x;

    // Upright (straight) is -90deg (-PI/2); measure deviation from that.
    const handAngle = Math.atan2(dy, dx);
    const neutralAngle = -Math.PI / 2;

    let diff = handAngle - neutralAngle;

    // Normalize to -PI..PI
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;

    const oneHandSensitivity = 1.5;
    steering = diff * oneHandSensitivity;
    angle = diff;
  } else {
    // No hands for steering
    steering = 0;
  }

  // Clamp
  const deadzone = 0.05;
  if (Math.abs(steering) < deadzone) steering = 0;
  steering = Math.max(-1, Math.min(1, steering));

  info += ` | Str: ${steering.toFixed(2)}`;

  // Object Detection Info (optional display)
  if (detections && detections.length > 0) {
    const det = detections[0];
    const cat = det.categories[0];
    if (cat) info += ` | Obj: ${cat.categoryName}`;
  }

  return { newGear, gearHandIndex, steering, angle, info };
}
