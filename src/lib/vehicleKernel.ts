/**
 * Final-review — Babylon-free force kernel for the raycast vehicle.
 *
 * The shipped Babylon vehicle (`src/components/babylon/raycastVehicle.ts`) has
 * no unit suite of its own — it is verified by headed driving + e2e — because
 * it is welded to Havok bodies and scene raycasts. These are the pure NUMERIC
 * force computations pulled out of it so the load-bearing arithmetic (suspension
 * spring/damper, over-speed drag, signed drive force) can be exercised by
 * `node --test` without the 3D engine.
 *
 * `RaycastVehicle.update` calls these exact functions each physics step, so the
 * tests exercise the REAL force math, not a copy. Follows the
 * driveLayout/mirrorLayout extraction pattern: numbers in, numbers out, no
 * @babylonjs / browser imports.
 */

/**
 * Suspension spring+damper force along the contact normal (N). Positive pushes
 * the chassis up. The suspension only ever PUSHES: a net-negative result (a
 * strong extending-damper term overcoming a small spring term) clamps to 0 so
 * it never pulls the chassis down toward the ground.
 *
 * @param compression      rest length minus wheel-centre distance (m); + = compressed
 * @param compressionVel   contact velocity along the normal (m/s); + = extending
 * @param stiffness        spring stiffness (N per m of compression)
 * @param damping          damping (N per m/s of compression velocity)
 */
export function suspensionForce(
  compression: number,
  compressionVel: number,
  stiffness: number,
  damping: number,
): number {
  const springF = compression * stiffness;
  const damperF = -compressionVel * damping;
  const suspF = springF + damperF;
  return suspF < 0 ? 0 : suspF;
}

/**
 * Signed drive force per powered wheel (N) for a SIGNED throttle. Positive
 * throttle drives forward, negative drives in reverse (gear "R"), 0 = no drive
 * force (gear "P" / no gas). The sign is preserved and the caller applies the
 * result along the wheel-forward axis, so steering stays gear-invariant while
 * the drive direction flips with the throttle sign.
 */
export function driveForceMagnitude(
  engineForce: number,
  signedThrottle: number,
  poweredCount: number,
): number {
  return (engineForce * signedThrottle) / poweredCount;
}

/**
 * Soft top-speed drag force MAGNITUDE (N), to be applied opposite the velocity
 * direction. 0 at or below the cap; above it, ramps linearly with the excess
 * speed so throttle can't run the car past `maxSpeed`.
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
