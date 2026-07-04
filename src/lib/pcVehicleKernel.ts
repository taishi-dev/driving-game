/**
 * P4 — engine-free numeric kernel for the PlayCanvas raycast vehicle.
 *
 * The vehicle itself (`src/components/playcanvas/raycastVehicle.ts`) is welded
 * to Ammo's `btRaycastVehicle` and the PlayCanvas rigidbody world, so it has no
 * unit suite of its own — it is verified by the scripted straight-line probe +
 * headed driving. These are the pure numeric bits pulled out of it so the
 * load-bearing arithmetic can be exercised by `node --test` without a browser or
 * WASM: unit conversion, the soft top-speed drag (the feel-target speed cap —
 * "drag, not velocity clamping"), and the speed-sensitive steering falloff.
 *
 * `raycastVehicle.ts` calls these exact functions each physics step, so the
 * tests exercise the REAL math, not a copy (same extraction discipline as E1's
 * vehicleKernel / driveLayout / mirrorLayout). No playcanvas / browser imports.
 */

/** Metres-per-second → kilometres-per-hour. */
export const MS_TO_KMH = 3.6;

/** Convert a speed in m/s to km/h. */
export function msToKmh(ms: number): number {
  return ms * MS_TO_KMH;
}

/** Convert a speed in km/h to m/s. */
export function kmhToMs(kmh: number): number {
  return kmh / MS_TO_KMH;
}

/**
 * Soft top-speed drag force MAGNITUDE (N), applied opposite the velocity
 * direction, to hold the car at a feel-target top speed WITHOUT clamping the
 * velocity vector (the trial contract requires "drag or engine map, not
 * velocity clamping"). Returns 0 at or below the cap; above it, ramps linearly
 * with the excess speed × mass × the drag coefficient, so full throttle settles
 * at an equilibrium just above `maxSpeed` instead of accelerating without bound.
 *
 * @param speed         current speed (m/s), always ≥ 0
 * @param maxSpeed      soft cap (m/s)
 * @param mass          chassis mass (kg)
 * @param overSpeedDrag drag stiffness (N per kg per m/s of excess)
 */
export function overSpeedDragMagnitude(
  speed: number,
  maxSpeed: number,
  mass: number,
  overSpeedDrag: number,
): number {
  if (speed <= maxSpeed) return 0;
  return (speed - maxSpeed) * mass * overSpeedDrag;
}

/**
 * Speed-sensitive steering angle (radians) for a steer input in [-1, 1].
 * Steering authority falls off with speed so the car isn't twitchy at speed:
 * the effective max angle is `maxSteerAngle / (1 + speed * falloff)`. At rest
 * this is exactly `input * maxSteerAngle`; it shrinks smoothly as speed rises.
 *
 * @param steerInput   normalised steer request, -1 (full left) .. 1 (full right)
 * @param maxSteerAngle full-lock angle at rest (radians)
 * @param speed        current speed (m/s), ≥ 0
 * @param falloff      authority falloff (per m/s)
 */
export function speedSensitiveSteer(
  steerInput: number,
  maxSteerAngle: number,
  speed: number,
  falloff: number,
): number {
  const clamped = steerInput < -1 ? -1 : steerInput > 1 ? 1 : steerInput;
  return (clamped * maxSteerAngle) / (1 + Math.abs(speed) * falloff);
}
