/**
 * Pure car-motion integration, extracted from Car.tsx's useFrame so it can be
 * unit-tested and, crucially, made frame-rate independent.
 *
 * `dtScale` is the per-frame time step normalized to a 60fps baseline:
 * `dtScale = delta * 60`, so it is exactly 1.0 at 60fps. The hand-tuned constants
 * below were chosen for per-frame stepping at ~60fps, so multiplying the rate
 * terms by dtScale keeps the feel identical at 60fps while making distance,
 * acceleration and turn rate scale with real time at any frame rate.
 */

export const CAR_PHYSICS = {
  maxSpeed: 1.8,
  acceleration: 0.012,
  friction: 0.0025,
  creepSpeed: 0.15,
  turnSpeed: 0.06,
  brakeRate: 0.05,
} as const;

/** Steering response knobs, lifted from inline literals so each variant tunes
 * them cleanly. `curveExponent` shapes input response (higher = more progressive,
 * lower = twitchier); `boost` scales overall turn authority; `rateMultiplier` is
 * the legacy *3 term. `highSpeedDamping` (0..1) reduces turn authority as speed
 * approaches maxSpeed — kept LOW-MID for NFS so the car stays lively and rotates
 * for drift. */
export const STEERING = {
  curveExponent: 1.5,
  boost: 11.0,
  rateMultiplier: 3.0,
  highSpeedDamping: 0.2,
} as const;

export interface SpeedInputs {
  /** 0..1 throttle. */
  throttle: number;
  /** 0..1 brake. */
  brake: number;
}

/** Normalize a frame delta (seconds) to the 60fps-baseline time step. */
export function dtScaleFromDelta(delta: number): number {
  return delta * 60;
}

/** Advance the (signed magnitude) speed one step given the current inputs. */
export function stepSpeed(speed: number, inputs: SpeedInputs, dtScale: number): number {
  const { maxSpeed, acceleration, friction, creepSpeed } = CAR_PHYSICS;
  if (inputs.throttle > 0) {
    return speed + (maxSpeed * inputs.throttle - speed) * acceleration * dtScale;
  }
  if (inputs.brake > 0) {
    const next = speed - inputs.brake * CAR_PHYSICS.brakeRate * dtScale;
    return next < 0 ? 0 : next;
  }
  // Coast: idle-creep up to creepSpeed, otherwise decay by friction down to creep.
  if (speed < creepSpeed) {
    return speed + 0.001 * dtScale;
  }
  const next = speed - friction * dtScale;
  return next < creepSpeed ? creepSpeed : next;
}

/**
 * Yaw change (radians) to ADD to the car's rotation.y this step. Mirrors the
 * legacy formula: rotation.y -= boosted * turnSpeed * (speed/maxSpeed) * 3 * dir.
 */
export function steeringYawDelta(
  speed: number,
  steering: number,
  direction: number,
  dtScale: number,
): number {
  if (Math.abs(speed) <= 0.001) return 0;
  const { maxSpeed, turnSpeed } = CAR_PHYSICS;
  const { curveExponent, boost, rateMultiplier, highSpeedDamping } = STEERING;
  const curved = Math.sign(steering) * Math.pow(Math.abs(steering), curveExponent);
  const boosted = curved * boost;
  // Speed-sensitive steering: reduce turn authority as speed approaches maxSpeed
  // for high-speed stability. Depends only on speed (not dtScale), so the per-frame
  // dt scaling — and frame-rate independence — is unchanged.
  const speedFrac = Math.min(Math.abs(speed) / maxSpeed, 1);
  const damp = 1 - highSpeedDamping * speedFrac;
  return -(boosted * turnSpeed * (speed / maxSpeed) * rateMultiplier * direction) * damp * dtScale;
}

/** Forward distance (world units) to move along the heading this step. */
export function forwardStep(speed: number, direction: number, dtScale: number): number {
  return speed * direction * dtScale;
}

/**
 * Frame-rate-corrected lerp factor for exponential smoothing (camera follow,
 * ghost/replay easing). `perFrameAlpha` is the legacy constant tuned for 60fps;
 * this returns the equivalent factor for the actual time step so the same
 * fraction of the gap closes per wall-clock second at any frame rate. Returns
 * `perFrameAlpha` exactly at dtScale === 1, so 60fps feel is unchanged.
 */
export function smoothingAlpha(perFrameAlpha: number, dtScale: number): number {
  return 1 - Math.pow(1 - perFrameAlpha, dtScale);
}
