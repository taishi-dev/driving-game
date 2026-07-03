import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import type { Scene } from "@babylonjs/core/scene";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

/**
 * B4 — Hand-built raycast vehicle on Havok.
 *
 * Babylon/Havok V2 has NO official vehicle or raycast-vehicle controller
 * (research key [B-veh]); Havok exposes rigid bodies only. So this is a
 * from-scratch raycast vehicle in the classic style (Bullet's `btRaycastVehicle`
 * / Unity WheelCollider model):
 *
 *   - The chassis is a single dynamic rigid body (a box).
 *   - Each wheel is NOT a physics body. It is a downward RAY cast from a fixed
 *     mount point on the chassis. Where the ray hits the ground we compute a
 *     spring+damper suspension force and apply it to the chassis at that point.
 *   - Drive/brake forces are applied at the contact points along the wheel's
 *     forward direction; steering rotates the front wheels' forward direction.
 *   - Lateral grip applies an impulse that cancels sideways sliding at each
 *     grounded wheel, so the car corners instead of skating forever.
 *
 * All forces are applied via `body.applyForce(force, worldPoint)` each physics
 * step. Tuning constants are grouped in VEHICLE_TUNING and were chosen for a
 * stable, controllable feel at the chassis mass/size below; final feel is a
 * later real-GPU human pass (plan decision 9.B).
 */

export interface WheelConfig {
  /** Wheel mount position in chassis-local space (x = right, y = up, z = forward). */
  readonly localPosition: Vector3;
  /** Front wheels steer; rear wheels do not. */
  readonly isSteering: boolean;
  /** Powered wheels receive drive force (rear-wheel drive by default). */
  readonly isPowered: boolean;
  readonly radius: number;
}

export const VEHICLE_TUNING = {
  /** Chassis rigid-body mass (kg). */
  chassisMass: 800,

  /** Rest length of the suspension spring (m). Ray probes this + radius below. */
  suspensionRest: 0.5,
  /** Spring stiffness (N/m of compression). Holds ~chassisMass*g at rest. */
  suspensionStiffness: 35000,
  /** Suspension damping (N per m/s of compression velocity). */
  suspensionDamping: 4000,
  /** Max additional travel below rest before the ray reports "no ground". */
  suspensionMaxTravel: 0.35,

  /** Drive force per powered wheel at full throttle (N). */
  engineForce: 4200,
  /** Brake force per wheel at full brake (N). */
  brakeForce: 6000,
  /** Passive rolling resistance opposing forward velocity (N per m/s). */
  rollingResistance: 90,

  /** Max steer angle of the front wheels (radians) at full lock. */
  maxSteerAngle: 0.55,
  /** How fast the steer angle slews toward its target (1/s). */
  steerSpeed: 6.0,
  /** Steering authority falls off with speed so it isn't twitchy at speed. */
  steerSpeedFalloff: 0.02,

  /** Sideways grip: fraction of lateral velocity cancelled per second per wheel. */
  lateralGrip: 12.0,

  /**
   * Top speed clamp (m/s) applied as a soft drag above this. B7c: 15.5 m/s
   * (~56 km/h, settling ≈60 km/h with the drag equilibrium) so the car tops out
   * at the straight lesson's 60 km/h limit instead of ~113 km/h — matching the
   * original app's controllable-lesson feel and keeping the speeding-penalty
   * scoring band (limit + 5 km/h tolerance) reachable but not automatic.
   */
  maxSpeed: 15.5,
  /** Over-cap drag stiffness (N per kg per m/s of excess). */
  overSpeedDrag: 4,

  /**
   * B7c straight-line stabilizer (active ONLY at neutral steering, |steer|<0.01):
   * yaw-rate damping (1/s) + lateral CM velocity damping (1/s). The explicit
   * per-frame force model sustains a small roll/yaw limit cycle (~0.02 rad/s
   * measured; see the grip-force note below) that walks the car off a 160 m
   * straight with no steering input. Human drivers correct this unconsciously;
   * the graded lessons must also be drivable by exact/scripted input, and a
   * driving-school car should track straight. A solver-level fix (substepped
   * physics / impulse-based tyres) is deferred to the feel pass (plan 9.B).
   */
  yawStabilize: 3.0,
  lateralStabilize: 2.0,
} as const;

/** Per-wheel runtime state (visual sync + debugging). */
interface WheelState {
  readonly config: WheelConfig;
  /** Current world contact point (for force application); null when airborne. */
  grounded: boolean;
  /** Distance from mount to contact (for visual suspension compression). */
  compression: number;
  /** Last computed world position of the wheel center (visual). */
  worldPosition: Vector3;
  /** Optional visual mesh synced each frame. */
  mesh: TransformNode | null;
}

export interface VehicleInput {
  /**
   * Signed drive throttle: positive = forward drive request, negative =
   * reverse drive request (B6 gear "R"), 0 = no drive force (gear "P" or no
   * gas). Magnitude is 0..1. The sign flips which way the drive force points
   * along the wheel's forward axis; it does NOT touch steering. The steer input
   * magnitude is gear-invariant, but yaw direction flips in reverse because
   * velocity sign flips (see `src/lib/driveControls.ts`).
   */
  throttle: number;
  /** 0..1 brake. Independent of gear — always opposes current motion. */
  brake: number;
  /** -1 (left) .. 1 (right) steering target. */
  steer: number;
}

/**
 * The raycast vehicle. Owns the chassis body and drives it from `update(dt)`.
 * Call `attachWheelMeshes` to sync visual wheels, and `setInput` each frame.
 */
export class RaycastVehicle {
  private readonly scene: Scene;
  private readonly body: PhysicsBody;
  private readonly wheels: WheelState[];
  private readonly groundPredicate: (mesh: AbstractMesh) => boolean;

  private input: VehicleInput = { throttle: 0, brake: 0, steer: 0 };
  /** Smoothed steer angle (radians), slewed toward input.steer * maxSteerAngle. */
  private steerAngle = 0;

  /**
   * Debug snapshot from the last update (headless verification aid).
   * `angularVelY` is the chassis's world-Y (yaw) angular velocity (rad/s):
   * B6 verification uses its SIGN to confirm the yaw direction flips in reverse
   * (steering input is gear-invariant, but yaw ∝ velocity × steer, so reverse
   * reverses yaw direction — see `src/lib/driveControls.ts`).
   */
  readonly debug = {
    groundedWheels: 0,
    lastDriveF: 0,
    forwardVel: 0,
    poweredGrounded: 0,
    angularVelY: 0,
    /** Lateral (chassis-right) velocity component (m/s) — drift instrumentation. */
    lateralVel: 0,
    /** Current smoothed steer angle (radians). */
    steerAngle: 0,
    /** Per-wheel: suspension length (m; rest=0.5), NaN when airborne. */
    wheelCompression: [0, 0, 0, 0] as number[],
    /** Per-wheel: name of the mesh the suspension ray hit ("" when airborne). */
    wheelHit: ["", "", "", ""] as string[],
  };

  // Scratch objects reused each step to avoid per-frame allocation.
  private readonly _rayDir = new Vector3(0, -1, 0);
  private readonly _ray = new Ray(Vector3.Zero(), new Vector3(0, -1, 0), 1);
  private readonly _gripPoint = new Vector3();

  constructor(
    scene: Scene,
    body: PhysicsBody,
    wheelConfigs: readonly WheelConfig[],
    groundPredicate: (mesh: AbstractMesh) => boolean,
  ) {
    this.scene = scene;
    this.body = body;
    this.groundPredicate = groundPredicate;
    this.wheels = wheelConfigs.map((config) => ({
      config,
      grounded: false,
      compression: VEHICLE_TUNING.suspensionRest,
      worldPosition: Vector3.Zero(),
      mesh: null,
    }));
  }

  setInput(input: VehicleInput): void {
    this.input = input;
  }

  /** Attach a visual wheel node per wheel index (must match wheelConfigs order). */
  attachWheelMeshes(meshes: (TransformNode | null)[]): void {
    for (let i = 0; i < this.wheels.length && i < meshes.length; i++) {
      this.wheels[i].mesh = meshes[i];
    }
  }

  /** Whether at least one wheel is on the ground (chassis is supported). */
  isGrounded(): boolean {
    return this.wheels.some((w) => w.grounded);
  }

  /** World-space chassis position (for camera / debug). */
  getChassisPosition(): Vector3 {
    return this.body.transformNode.getAbsolutePosition();
  }

  /**
   * Advance the vehicle one physics step. Called from a beforePhysics observer
   * so forces land in the same step Havok integrates. `dt` is seconds.
   */
  update(dt: number): void {
    if (dt <= 0) return;
    const T = VEHICLE_TUNING;
    const chassis = this.body.transformNode;

    // Slew the steering toward the target angle (speed-sensitive falloff).
    //
    // B7c drift ROOT-CAUSE fix: snapshot (clone) the body's linear AND angular
    // velocity ONCE here, and compute every wheel from this same pre-step state.
    // Havok applies impulses/forces to the body's velocities IMMEDIATELY, so
    // re-reading velocity per wheel (the old velocityAtPoint re-fetched
    // getAngularVelocity mid-loop) made each wheel see the state already
    // perturbed by the previous wheels' forces — in fixed processing order.
    // That order dependence produced a deterministic left/right-antisymmetric
    // slip pattern (measured wheelLatVel ±0.1 m/s, kinematically impossible
    // from one rigid state) whose grip forces yielded a constant ~85 N·m yaw
    // torque: the car veered off a straight road at neutral steering.
    const chassisVel = this.body.getLinearVelocity().clone();
    const omega = this.body.getAngularVelocity().clone();
    const speed = chassisVel.length();
    const falloff = 1 / (1 + speed * T.steerSpeedFalloff);
    const targetSteer = this.input.steer * T.maxSteerAngle * falloff;
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, T.steerSpeed * dt);

    // Chassis world rotation as a matrix for transforming local axes/points.
    const worldMatrix = chassis.getWorldMatrix();
    const rot = chassis.rotationQuaternion ?? Quaternion.Identity();
    const rotMatrix = Matrix.Identity();
    Matrix.FromQuaternionToRef(rot, rotMatrix);

    // Chassis basis vectors in world space.
    const up = Vector3.TransformNormal(Vector3.Up(), rotMatrix);
    const forwardBase = Vector3.TransformNormal(Vector3.Forward(), rotMatrix);
    const rightBase = Vector3.TransformNormal(Vector3.Right(), rotMatrix);

    const poweredCount = this.wheels.filter((w) => w.config.isPowered).length || 1;
    this.debug.groundedWheels = 0;
    this.debug.poweredGrounded = 0;
    this.debug.lastDriveF = 0;
    this.debug.angularVelY = omega.y;
    this.debug.steerAngle = this.steerAngle;
    this.debug.lateralVel = Vector3.Dot(chassisVel, rightBase);
    const cmPos = chassis.getAbsolutePosition();

    for (let wi = 0; wi < this.wheels.length; wi++) {
      const wheel = this.wheels[wi];
      const cfg = wheel.config;

      // Mount point (top of the suspension) in world space.
      const mount = Vector3.TransformCoordinates(cfg.localPosition, worldMatrix);

      // Cast a ray straight down from the mount to find the ground.
      // B7c drift fix: the ray goes down in WORLD space, not chassis space.
      // Chassis-space rays tilt sideways with any roll, laterally shifting BOTH
      // contact points the same way; drive/resistance forces applied at those
      // shifted points then produce a net yaw torque (≈ F·2δ) that sustains the
      // roll via the grip forces — a self-reinforcing constant-rate veer
      // (measured ~0.022 rad/s at neutral steering). World-down rays keep the
      // contacts under the mounts so the wheel-force yaw torques cancel exactly.
      const probeLength = T.suspensionRest + cfg.radius + T.suspensionMaxTravel;
      this._ray.origin.copyFrom(mount);
      this._rayDir.set(0, -1, 0);
      this._ray.direction.copyFrom(this._rayDir);
      this._ray.length = probeLength;

      const hit = this.scene.pickWithRay(this._ray, this.groundPredicate);

      if (!hit || !hit.hit || hit.distance == null || hit.pickedPoint == null) {
        // Airborne: extend suspension fully, no force.
        wheel.grounded = false;
        wheel.compression = T.suspensionRest;
        wheel.worldPosition.copyFrom(mount).addInPlace(
          this._rayDir.scale(T.suspensionRest),
        );
        this.debug.wheelCompression[wi] = NaN;
        this.debug.wheelHit[wi] = "";
        this.syncWheelMesh(wheel, rot);
        continue;
      }

      wheel.grounded = true;
      this.debug.wheelHit[wi] = hit.pickedMesh?.name ?? "?";
      this.debug.groundedWheels++;
      if (cfg.isPowered) this.debug.poweredGrounded++;
      const contactPoint = hit.pickedPoint;

      // Suspension compression: rest length minus (distance from mount to wheel
      // center = hit distance - radius). Positive = compressed.
      const wheelCenterDist = hit.distance - cfg.radius;
      const compression = T.suspensionRest - wheelCenterDist;
      wheel.compression = wheelCenterDist;
      this.debug.wheelCompression[wi] = wheelCenterDist;
      wheel.worldPosition.copyFrom(mount).addInPlace(
        up.scale(-wheelCenterDist),
      );

      // --- Suspension force (spring + damper), along the CONTACT NORMAL. ---
      // B7c drift fix: this force used to point along chassis-up. Any transient
      // roll/pitch (e.g. drive squat) then tilted the ~8 kN of suspension force,
      // and its horizontal components — unequal front/rear under squat — formed a
      // net yaw torque that the ground-level grip forces turned into a sustained
      // roll: a self-reinforcing ~0.02 rad/s veer at neutral steering. Applying
      // suspension along the surface normal (classic btRaycastVehicle behavior;
      // world-up on this flat world) keeps it torque-free in yaw.
      const normal = hit.getNormal(true) ?? Vector3.Up();
      if (normal.y < 0) normal.scaleInPlace(-1); // never push downward
      const pointVel = this.velocityAtPoint(contactPoint, chassisVel, omega);
      const compressionVel = Vector3.Dot(pointVel, normal); // + = extending

      const springF = compression * T.suspensionStiffness;
      const damperF = -compressionVel * T.suspensionDamping;
      let suspF = springF + damperF;
      if (suspF < 0) suspF = 0; // suspension only pushes, never pulls

      const suspForce = normal.scale(suspF);
      this.body.applyForce(suspForce, contactPoint);

      // --- Wheel forward/right directions (front wheels steer). ---
      let wheelForward = forwardBase;
      let wheelRight = rightBase;
      if (cfg.isSteering && this.steerAngle !== 0) {
        const steerQ = Quaternion.RotationAxis(up, this.steerAngle);
        const sm = Matrix.Identity();
        Matrix.FromQuaternionToRef(steerQ, sm);
        wheelForward = Vector3.TransformNormal(forwardBase, sm);
        wheelRight = Vector3.TransformNormal(rightBase, sm);
      }

      // --- Drive + brake (along wheel forward). ---
      // `throttle` is signed (B6): positive drives forward, negative drives
      // in reverse (gear "R"), 0 applies no drive force (gear "P" or no gas).
      // The force is still applied along `wheelForward` — only its magnitude's
      // sign flips — so steer input is gear-invariant, but yaw direction flips
      // in reverse (yaw ∝ velocity × steer angle).
      if (cfg.isPowered && this.input.throttle !== 0) {
        const driveMag = (T.engineForce * this.input.throttle) / poweredCount;
        const drive = wheelForward.scale(driveMag);
        this.body.applyForce(drive, contactPoint);
        this.debug.lastDriveF += driveMag;
      }

      // Rolling resistance + braking oppose the forward velocity component.
      // B7c drift fix: below 0.5 m/s the resistance ramps linearly instead of
      // using sign() — the hard ±90 N flip on solver jitter (±1 mm/s) rectified
      // into a slow parked-car creep (~0.06 m/s with no input). Brakes get the
      // same ramp so a stopped car isn't pushed around by its own brake force.
      const forwardVel = Vector3.Dot(pointVel, wheelForward);
      this.debug.forwardVel = forwardVel;
      const oppose =
        Math.abs(forwardVel) < 0.5 ? forwardVel / 0.5 : Math.sign(forwardVel);
      let longForce = -oppose * T.rollingResistance;
      if (this.input.brake > 0) {
        longForce += -oppose * T.brakeForce * this.input.brake;
      }
      this.body.applyForce(wheelForward.scale(longForce), contactPoint);

      // --- Lateral grip: cancel sideways sliding (impulse-like force). ---
      // Force = -lateralVel * grip * (mass share) so the car corners. Divided
      // among wheels; scaled by dt-normalized grip so it converges, not blows up.
      //
      // B7c drift fix (final piece): the grip force is applied at CM HEIGHT, not
      // at the ground contact. Ground-level grip torques pumped the roll mode,
      // and the roll rate fed back into the per-wheel slip readings (ω×r) with a
      // phase lag — a self-sustained roll/yaw limit cycle that rectified into a
      // constant ~0.02 rad/s veer at neutral steering (measured: left/right
      // antisymmetric wheelLatVel ±0.11 m/s, impossible from yaw alone). Raising
      // the application point to CM height removes the roll coupling — the
      // standard arcade raycast-vehicle stabilization (plan 9.B feel pass owns
      // any future body-roll re-tuning).
      const lateralVel = Vector3.Dot(pointVel, wheelRight);
      const massShare = T.chassisMass / this.wheels.length;
      const gripF =
        -lateralVel * T.lateralGrip * massShare;
      this._gripPoint.copyFrom(contactPoint);
      this._gripPoint.y = cmPos.y;
      this.body.applyForce(wheelRight.scale(gripF), this._gripPoint);

      this.syncWheelMesh(wheel, rot);
    }

    // --- B7c straight-line stabilizer (see VEHICLE_TUNING.yawStabilize). ---
    // Neutral steering + any wheel grounded: damp residual yaw rate and lateral
    // CM velocity so the limit-cycle wobble of the explicit force model cannot
    // rectify into a steady veer. Forces only — never writes velocities.
    if (Math.abs(this.input.steer) < 0.01 && this.debug.groundedWheels > 0) {
      if (omega.y !== 0) {
        // Yaw moment of inertia of the chassis box (m/12 * (w^2 + l^2)).
        const iy = (T.chassisMass / 12) * (1.8 * 1.8 + 4 * 4);
        this.body.applyAngularImpulse(
          new Vector3(0, -omega.y * T.yawStabilize * iy * dt, 0),
        );
      }
      const latV = this.debug.lateralVel;
      if (latV !== 0) {
        const latForce = rightBase.scale(-latV * T.lateralStabilize * T.chassisMass);
        this.body.applyForce(latForce, cmPos);
      }
    }

    // Soft top-speed drag so throttle doesn't run away (stiffened in B7c so the
    // equilibrium overshoot stays within ~4 km/h of the cap).
    if (speed > T.maxSpeed) {
      const excess = speed - T.maxSpeed;
      const drag = chassisVel
        .normalizeToNew()
        .scale(-excess * T.chassisMass * T.overSpeedDrag);
      this.body.applyForce(drag, chassis.getAbsolutePosition());
    }
  }

  /**
   * Linear velocity of the chassis at a world point, including the angular
   * contribution: v_point = v_cm + omega x (point - cm).
   *
   * `linearVel`/`omega` MUST be the pre-step snapshots taken at the top of
   * `update` — never re-fetched from the body mid-loop, because Havok applies
   * the already-issued wheel forces to the body's velocities immediately (see
   * the root-cause note in `update`).
   */
  private velocityAtPoint(point: Vector3, linearVel: Vector3, omega: Vector3): Vector3 {
    const cm = this.body.transformNode.getAbsolutePosition();
    const r = point.subtract(cm);
    const rot = Vector3.Cross(omega, r);
    return linearVel.add(rot);
  }

  private syncWheelMesh(wheel: WheelState, chassisRot: Quaternion): void {
    if (!wheel.mesh) return;
    wheel.mesh.setAbsolutePosition(wheel.worldPosition);
    if (!wheel.mesh.rotationQuaternion) {
      wheel.mesh.rotationQuaternion = Quaternion.Identity();
    }
    // Wheel visual inherits chassis orientation; steer applied to fronts.
    if (wheel.config.isSteering && this.steerAngle !== 0) {
      const up = Vector3.Up();
      const steerQ = Quaternion.RotationAxis(up, this.steerAngle);
      chassisRot.multiplyToRef(steerQ, wheel.mesh.rotationQuaternion);
    } else {
      wheel.mesh.rotationQuaternion.copyFrom(chassisRot);
    }
  }
}

/** Default 4-wheel layout for the test chassis (rear-wheel drive). */
export function defaultWheelConfigs(
  halfWidth: number,
  halfLength: number,
  radius: number,
): WheelConfig[] {
  // Wheels mount slightly inboard of the chassis corners, at the chassis
  // mid-height so the suspension ray has room to probe down.
  const y = -0.1;
  return [
    { localPosition: new Vector3(-halfWidth, y, halfLength), isSteering: true, isPowered: false, radius },
    { localPosition: new Vector3(halfWidth, y, halfLength), isSteering: true, isPowered: false, radius },
    { localPosition: new Vector3(-halfWidth, y, -halfLength), isSteering: false, isPowered: true, radius },
    { localPosition: new Vector3(halfWidth, y, -halfLength), isSteering: false, isPowered: true, radius },
  ];
}
