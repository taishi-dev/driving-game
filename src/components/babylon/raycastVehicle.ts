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

  /** Top speed clamp (m/s) applied as a soft drag above this. */
  maxSpeed: 30,
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
  /** 0..1 throttle. */
  throttle: number;
  /** 0..1 brake. */
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

  /** Debug snapshot from the last update (headless verification aid). */
  readonly debug = { groundedWheels: 0, lastDriveF: 0, forwardVel: 0, poweredGrounded: 0 };

  // Scratch objects reused each step to avoid per-frame allocation.
  private readonly _rayDir = new Vector3(0, -1, 0);
  private readonly _ray = new Ray(Vector3.Zero(), new Vector3(0, -1, 0), 1);

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
    const chassisVel = this.body.getLinearVelocity();
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

    for (const wheel of this.wheels) {
      const cfg = wheel.config;

      // Mount point (top of the suspension) in world space.
      const mount = Vector3.TransformCoordinates(cfg.localPosition, worldMatrix);

      // Cast a ray straight down from the mount to find the ground.
      const probeLength = T.suspensionRest + cfg.radius + T.suspensionMaxTravel;
      this._ray.origin.copyFrom(mount);
      this._rayDir.copyFrom(up).scaleInPlace(-1);
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
        this.syncWheelMesh(wheel, rot);
        continue;
      }

      wheel.grounded = true;
      this.debug.groundedWheels++;
      if (cfg.isPowered) this.debug.poweredGrounded++;
      const contactPoint = hit.pickedPoint;

      // Suspension compression: rest length minus (distance from mount to wheel
      // center = hit distance - radius). Positive = compressed.
      const wheelCenterDist = hit.distance - cfg.radius;
      const compression = T.suspensionRest - wheelCenterDist;
      wheel.compression = wheelCenterDist;
      wheel.worldPosition.copyFrom(mount).addInPlace(
        up.scale(-wheelCenterDist),
      );

      // --- Suspension force (spring + damper), along chassis up. ---
      // Spring pushes up proportional to compression; damper opposes the
      // compression velocity (component of chassis velocity at this point along up).
      const pointVel = this.velocityAtPoint(contactPoint, chassisVel);
      const compressionVel = Vector3.Dot(pointVel, up); // + = extending

      const springF = compression * T.suspensionStiffness;
      const damperF = -compressionVel * T.suspensionDamping;
      let suspF = springF + damperF;
      if (suspF < 0) suspF = 0; // suspension only pushes, never pulls

      const suspForce = up.scale(suspF);
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
      if (cfg.isPowered && this.input.throttle > 0) {
        const driveMag = (T.engineForce * this.input.throttle) / poweredCount;
        const drive = wheelForward.scale(driveMag);
        this.body.applyForce(drive, contactPoint);
        this.debug.lastDriveF += driveMag;
      }

      // Rolling resistance + braking oppose the forward velocity component.
      const forwardVel = Vector3.Dot(pointVel, wheelForward);
      this.debug.forwardVel = forwardVel;
      let longForce = -Math.sign(forwardVel) * T.rollingResistance;
      if (this.input.brake > 0) {
        longForce +=
          -Math.sign(forwardVel) * T.brakeForce * this.input.brake;
      }
      this.body.applyForce(wheelForward.scale(longForce), contactPoint);

      // --- Lateral grip: cancel sideways sliding (impulse-like force). ---
      // Force = -lateralVel * grip * (mass share) so the car corners. Divided
      // among wheels; scaled by dt-normalized grip so it converges, not blows up.
      const lateralVel = Vector3.Dot(pointVel, wheelRight);
      const massShare = T.chassisMass / this.wheels.length;
      const gripF =
        -lateralVel * T.lateralGrip * massShare;
      this.body.applyForce(wheelRight.scale(gripF), contactPoint);

      this.syncWheelMesh(wheel, rot);
    }

    // Soft top-speed drag so throttle doesn't run away.
    if (speed > T.maxSpeed) {
      const excess = speed - T.maxSpeed;
      const drag = chassisVel.normalizeToNew().scale(-excess * T.chassisMass);
      this.body.applyForce(drag, chassis.getAbsolutePosition());
    }
  }

  /**
   * Linear velocity of the chassis at a world point, including the angular
   * contribution: v_point = v_cm + omega x (point - cm).
   */
  private velocityAtPoint(point: Vector3, linearVel: Vector3): Vector3 {
    const omega = this.body.getAngularVelocity();
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
