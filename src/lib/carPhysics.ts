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
  maxSpeed: 1.5,
  acceleration: 0.01,
  friction: 0.005,
  creepSpeed: 0.15,
  turnSpeed: 0.05,
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
    const next = speed - inputs.brake * 0.05 * dtScale;
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
  const curved = Math.sign(steering) * Math.pow(Math.abs(steering), 1.8);
  const boosted = curved * 8.0;
  return -(boosted * turnSpeed * (speed / maxSpeed) * 3.0 * direction) * dtScale;
}

/** Forward distance (world units) to move along the heading this step. */
export function forwardStep(speed: number, direction: number, dtScale: number): number {
  return speed * direction * dtScale;
}
