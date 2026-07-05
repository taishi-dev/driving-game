/**
 * Pure fit math for mounting the hero-car GLB on the drive/replay chassis.
 *
 * The physics chassis is a fixed collision box (VEHICLE_TUNING.chassisHalfExtents)
 * and the GLB ships at its authored real-world size, so the visual is fitted by a
 * single UNIFORM scale factor (no per-axis distortion). Length is the primary
 * fit; width only caps it when the model would overhang the chassis box by more
 * than the tolerance (the collision box is conservative, so a slight visual
 * overhang is fine — a big one clips the synced wheel cylinders).
 */

/** How far past the chassis width the visual body may overhang (factor). */
export const HERO_CAR_WIDTH_TOLERANCE = 1.1;

/**
 * Uniform scale that fits a model of footprint `sizeX` x `sizeZ` (metres, world
 * units at scale 1) onto a chassis footprint `chassisWidth` x `chassisLength`.
 */
export function heroCarUniformScale(
  sizeX: number,
  sizeZ: number,
  chassisWidth: number,
  chassisLength: number,
): number {
  if (sizeX <= 0 || sizeZ <= 0) {
    throw new Error(`model footprint must be positive (got ${sizeX} x ${sizeZ})`);
  }
  const lengthFit = chassisLength / sizeZ;
  const widthFit = (chassisWidth * HERO_CAR_WIDTH_TOLERANCE) / sizeX;
  return Math.min(lengthFit, widthFit);
}

/**
 * Chassis-local Y of the ground plane at suspension rest: the wheel hangs from
 * its connection point by the rest length, and the contact patch is one wheel
 * radius below the wheel centre. The seated GLB (min.y = 0) mounts at this Y so
 * its underbody line sits on the ground exactly like in the showroom.
 */
export function chassisGroundLocalY(
  wheelConnectionY: number,
  suspensionRest: number,
  wheelRadius: number,
): number {
  return wheelConnectionY - suspensionRest - wheelRadius;
}
