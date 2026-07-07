/**
 * Pure chase-camera pose math for the drive scenes.
 *
 * ## Why this exists (the bug it fixes)
 *
 * The original `updateCamera` positioned the chase camera by transforming a
 * fixed local offset through the chassis' FULL world transform
 * (`chassis.getWorldTransform().transformPoint(...)`). That couples the camera
 * to the chassis' ROLL and PITCH: when the car bumps a curb / prop collider or
 * drives off-track at speed, the chassis rocks, and the camera orbits with every
 * rock — the whole world appears to rotate vertically and horizontally around a
 * seemingly-centred car (nausea-inducing; reported from a real drive recording).
 *
 * The fix: derive the camera pose from the car's WORLD POSITION and HEADING
 * (yaw) ONLY. Roll and pitch are discarded, so the horizon stays level no matter
 * what the chassis does. The heading is taken from the chassis' forward axis
 * flattened onto the ground (XZ) plane; a world-up `lookAt` at the returned
 * target then keeps the camera un-rolled.
 *
 * Kept engine-free (plain number vectors, no PlayCanvas import) so it unit-tests
 * without a running Application — the scene adapts its `Vec3`s to/from these.
 */

export interface Vec3Lite {
  x: number;
  y: number;
  z: number;
}

export interface ChaseCameraConfig {
  /** How far behind the car (along −heading) the camera sits (m). */
  distance: number;
  /** How far above the car the camera sits (m). */
  height: number;
  /** How far ahead of the car the look target sits (m). */
  lookAhead: number;
  /** How far above the car the look target sits (m). */
  lookHeight: number;
}

export interface ChaseCameraPose {
  /** Desired camera world position (pre-smoothing). */
  position: Vec3Lite;
  /** World point the camera should look at. */
  target: Vec3Lite;
}

/**
 * Flatten a world-space forward vector onto the XZ plane and normalize it.
 * Returns the car's ground heading. Falls back to `(0,0,1)` when the input is
 * (near-)vertical — e.g. the car flipped nose-up — so a tumbling car can never
 * produce a NaN heading and spin the camera; it just keeps the last sane axis.
 */
export function flattenHeading(forward: Vec3Lite): Vec3Lite {
  const len = Math.hypot(forward.x, forward.z);
  if (len < 1e-6) return { x: 0, y: 0, z: 1 };
  return { x: forward.x / len, y: 0, z: forward.z / len };
}

/**
 * Compute the desired chase-camera position + look target from the car's world
 * position and a ground heading (already flattened; use {@link flattenHeading}).
 * Yaw-only: no roll/pitch of the chassis reaches the camera.
 */
export function chaseCameraPose(
  carPos: Vec3Lite,
  heading: Vec3Lite,
  cfg: ChaseCameraConfig,
): ChaseCameraPose {
  return {
    position: {
      x: carPos.x - heading.x * cfg.distance,
      y: carPos.y + cfg.height,
      z: carPos.z - heading.z * cfg.distance,
    },
    target: {
      x: carPos.x + heading.x * cfg.lookAhead,
      y: carPos.y + cfg.lookHeight,
      z: carPos.z + heading.z * cfg.lookAhead,
    },
  };
}
