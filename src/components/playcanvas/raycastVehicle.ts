import { Application, Entity, Quat, Vec3 } from "playcanvas";
import { getAmmo } from "./ammoPhysics";
import {
  kmhToMs,
  msToKmh,
  overSpeedDragMagnitude,
  speedSensitiveSteer,
} from "@/lib/pcVehicleKernel";

/**
 * P4 — OFFICIAL raycast vehicle on Ammo/Bullet, wrapped for PlayCanvas [C-veh].
 *
 * This is the whole point of the E2 trial's vehicle task: where E1 (Babylon)
 * had to HAND-BUILD a raycast vehicle from rigid bodies + manual suspension/
 * grip/steer forces (~400 lines fighting a neutral-steer yaw drift), PlayCanvas
 * runs on Ammo and Ammo ships Bullet's production `btRaycastVehicle`. So this
 * module is a thin adapter: build the Bullet vehicle from the chassis rigid
 * body, add four wheels, and each frame push it steering / engine force / brake
 * and read back its transform. Suspension springs, wheel raycasts, longitudinal
 * + lateral tyre friction, and the anti-roll behaviour are all Bullet-internal
 * and battle-tested — the drift class that plagued E1 does not arise here.
 *
 * Coordinate contract (X=right, −Z=forward, Y=up): Bullet's `btRaycastVehicle`
 * with `setCoordinateSystem(0,1,2)` treats LOCAL +Z as the vehicle's forward.
 * We therefore spawn the chassis entity YAW-rotated 180° so its local +Z points
 * to WORLD −Z — then a POSITIVE engine force drives the car the way it faces,
 * down the course toward −Z, and `getCurrentSpeedKmHour()` reads positive going
 * forward. All steering / wheel math stays in the natural sign convention.
 * (When the hero-car GLB replaces the box later, it mounts as a child of this
 * chassis with its own +180° baked orientation cancelled — a P6/P7 concern.)
 */

/** Tuning for a controllable driving-school feel. Grouped for one-place edits. */
export const VEHICLE_TUNING = {
  /** Chassis rigid-body mass (kg). */
  chassisMass: 1200,

  /** Half-extents of the chassis collision box (m): [x=half-width, y, z=half-length]. */
  chassisHalfExtents: { x: 0.9, y: 0.5, z: 2.0 },
  /** Height of the chassis box centre above the ground at spawn (m). */
  spawnHeight: 1.0,

  /** Wheel radius (m). */
  wheelRadius: 0.4,
  /** Wheel half-track from centreline (m) — how far out the wheels sit in X. */
  wheelHalfTrack: 0.85,
  /** Wheel half-base from centre (m) — front/rear wheel offset in Z. */
  wheelHalfBase: 1.5,
  /** Local Y of the wheel connection point (top of suspension), relative to chassis centre. */
  wheelConnectionY: 0.1,

  /** Suspension rest length (m). */
  suspensionRest: 0.6,
  /** Suspension spring stiffness (Bullet units). */
  suspensionStiffness: 25,
  /** Suspension damping while extending (relaxation). */
  dampingRelaxation: 3.5,
  /** Suspension damping while compressing. */
  dampingCompression: 4.4,
  /** Max suspension travel (cm). */
  maxSuspensionTravelCm: 30,
  /** Max suspension force (N) — cap so a hard landing can't launch the car. */
  maxSuspensionForce: 60000,
  /** Tyre longitudinal+lateral friction (higher = more grip). */
  frictionSlip: 2.2,
  /** Roll influence (0 = no body roll transfer, 1 = full) — low keeps it planted. */
  rollInfluence: 0.1,

  /** Engine force at full throttle per powered wheel pair (N-ish, Bullet units). */
  engineForce: 2200,
  /** Brake force at full brake, per wheel. */
  brakeForce: 45,
  /** Idle brake applied when there is no throttle, so the car creeps to a stop. */
  idleBrake: 8,

  /** Max steer angle at full lock, at rest (radians). */
  maxSteerAngle: 0.55,
  /** Steering authority falloff (per m/s) — less twitchy at speed. */
  steerFalloff: 0.06,
  /** How fast the steer angle slews toward its target (1/s). */
  steerSpeed: 8.0,

  /**
   * Soft top-speed cap (m/s). ~16.4 m/s ≈ 59 km/h — the trial's feel target
   * ("top speed ~59-60 km/h, via drag not velocity clamping"). Above this, an
   * over-speed drag central force (see pcVehicleKernel) ramps up so throttle
   * settles the car at ~60 km/h instead of accelerating without bound.
   */
  maxSpeed: 16.0,
  /** Over-cap drag stiffness (N per kg per m/s of excess). */
  overSpeedDrag: 6,

  /**
   * Sign applied to the steering value fed to Bullet. Bullet's positive steer
   * turns the wheels one way; our steer input is +1 = RIGHT. Verified by the
   * headed drive + the D→−Z / turn probes; flip here if a right input yaws left.
   */
  steerSign: -1,
} as const;

export interface VehicleInput {
  /** Signed drive throttle: + forward, − reverse, 0 = none. Magnitude 0..1. */
  throttle: number;
  /** 0..1 brake, gear-independent (always opposes motion). */
  brake: number;
  /** −1 (left) .. +1 (right) steering target. */
  steer: number;
}

export interface VehicleState {
  /** World position of the chassis centre. */
  x: number;
  y: number;
  z: number;
  /** Signed forward speed (km/h) — positive driving forward, negative reversing. */
  speedKmh: number;
  /** Chassis yaw rate (rad/s, world Y angular velocity) — sign flips in reverse. */
  yawRate: number;
  /** Current smoothed front-wheel steer angle (radians). */
  steerAngle: number;
  /** How many wheels currently have ground contact (0..4). */
  wheelsOnGround: number;
}

/** Bullet activation state that disables sleeping (so a stopped car stays live). */
const DISABLE_DEACTIVATION = 4;

/**
 * Wraps a Bullet `btRaycastVehicle` around an existing chassis rigid body.
 * The chassis entity MUST already carry a dynamic `rigidbody` + box `collision`
 * component and be parented into the scene (so `entity.rigidbody.body` exists).
 */
export class RaycastVehicle {
  private readonly app: Application;
  readonly chassis: Entity;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly ammo: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private vehicle: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private raycaster: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tuning: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dragForce: any = null; // reusable btVector3 scratch

  private input: VehicleInput = { throttle: 0, brake: 0, steer: 0 };
  private steerAngle = 0;
  private wheelEntities: (Entity | null)[] = [];
  private disposed = false;

  /** Wheel index roles: 0=FL, 1=FR (steer), 2=RL, 3=RR (powered). */
  private static readonly STEER_WHEELS = [0, 1];
  private static readonly POWER_WHEELS = [2, 3];

  constructor(app: Application, chassis: Entity) {
    this.app = app;
    this.chassis = chassis;
    this.ammo = getAmmo();
    this.build();
  }

  private build(): void {
    const Ammo = this.ammo;
    const T = VEHICLE_TUNING;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dynamicsWorld = (this.app.systems as any).rigidbody.dynamicsWorld;
    const rb = this.chassis.rigidbody;
    if (!rb || !rb.body) {
      throw new Error(
        "[raycastVehicle] chassis has no rigidbody.body — add a dynamic " +
          "rigidbody + collision component and parent the entity before " +
          "constructing the vehicle (Ammo must be loaded first).",
      );
    }
    const chassisBody = rb.body;
    // Keep the chassis awake even when stopped so it always responds to input.
    chassisBody.setActivationState(DISABLE_DEACTIVATION);

    this.tuning = new Ammo.btVehicleTuning();
    this.raycaster = new Ammo.btDefaultVehicleRaycaster(dynamicsWorld);
    this.vehicle = new Ammo.btRaycastVehicle(this.tuning, chassisBody, this.raycaster);
    // X=right(0), Y=up(1), Z=forward(2): Bullet's default; local +Z is forward.
    this.vehicle.setCoordinateSystem(0, 1, 2);
    dynamicsWorld.addAction(this.vehicle);

    const wheelDir = new Ammo.btVector3(0, -1, 0); // suspension points down
    const wheelAxle = new Ammo.btVector3(-1, 0, 0); // spin axis = local X

    const hx = T.wheelHalfTrack;
    const hz = T.wheelHalfBase;
    const cy = T.wheelConnectionY;
    // Connection points (local): +Z is FRONT (see coordinate note at top).
    const wheels: Array<[number, number, number, boolean]> = [
      [-hx, cy, hz, true], // 0 FL (front, steer)
      [hx, cy, hz, true], // 1 FR (front, steer)
      [-hx, cy, -hz, false], // 2 RL (rear, powered)
      [hx, cy, -hz, false], // 3 RR (rear, powered)
    ];

    for (const [x, y, z, isFront] of wheels) {
      const cp = new Ammo.btVector3(x, y, z);
      const wheelInfo = this.vehicle.addWheel(
        cp,
        wheelDir,
        wheelAxle,
        T.suspensionRest,
        T.wheelRadius,
        this.tuning,
        isFront,
      );
      wheelInfo.set_m_suspensionStiffness(T.suspensionStiffness);
      wheelInfo.set_m_wheelsDampingRelaxation(T.dampingRelaxation);
      wheelInfo.set_m_wheelsDampingCompression(T.dampingCompression);
      wheelInfo.set_m_frictionSlip(T.frictionSlip);
      wheelInfo.set_m_rollInfluence(T.rollInfluence);
      wheelInfo.set_m_maxSuspensionTravelCm(T.maxSuspensionTravelCm);
      wheelInfo.set_m_maxSuspensionForce(T.maxSuspensionForce);
      Ammo.destroy(cp);
    }

    Ammo.destroy(wheelDir);
    Ammo.destroy(wheelAxle);

    this.dragForce = new Ammo.btVector3(0, 0, 0);
  }

  setInput(input: VehicleInput): void {
    this.input = input;
  }

  /** Attach visual wheel entities (index order FL, FR, RL, RR) to be synced each frame. */
  attachWheelEntities(entities: (Entity | null)[]): void {
    this.wheelEntities = entities;
  }

  /**
   * Advance vehicle control one frame. `dt` seconds. Call from an `app.on('update')`
   * handler; inputs are consumed by Bullet at the next `stepSimulation`.
   */
  update(dt: number): void {
    if (this.disposed || !this.vehicle || dt <= 0) return;
    const T = VEHICLE_TUNING;

    const speedKmh = this.vehicle.getCurrentSpeedKmHour();
    const speedMs = kmhToMs(speedKmh);
    const absSpeed = Math.abs(speedMs);

    // Slew the steer angle toward the (speed-sensitive) target.
    const target = speedSensitiveSteer(this.input.steer, T.maxSteerAngle, absSpeed, T.steerFalloff);
    this.steerAngle += (target - this.steerAngle) * Math.min(1, T.steerSpeed * dt);
    const steerValue = this.steerAngle * T.steerSign;
    for (const i of RaycastVehicle.STEER_WHEELS) {
      this.vehicle.setSteeringValue(steerValue, i);
    }

    // Engine force (signed throttle) on the powered wheels.
    const engineForce = this.input.throttle * T.engineForce;
    for (const i of RaycastVehicle.POWER_WHEELS) {
      this.vehicle.applyEngineForce(engineForce, i);
    }

    // Brake: explicit brake input, OR a light idle brake when coasting with no
    // throttle so the car settles to a stop instead of rolling forever.
    const braking = this.input.brake > 0;
    const brakeForce = braking
      ? this.input.brake * T.brakeForce
      : this.input.throttle === 0
        ? T.idleBrake
        : 0;
    for (let i = 0; i < 4; i++) {
      this.vehicle.setBrake(brakeForce, i);
    }

    // Soft top-speed cap via drag (NOT velocity clamping — feel-target contract).
    const dragMag = overSpeedDragMagnitude(absSpeed, T.maxSpeed, T.chassisMass, T.overSpeedDrag);
    if (dragMag > 0) {
      const rb = this.chassis.rigidbody!;
      const body = rb.body;
      const v = body.getLinearVelocity(); // body-owned btVector3, do not destroy
      const vx = v.x();
      const vy = v.y();
      const vz = v.z();
      const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      this.dragForce.setValue(
        (-vx / len) * dragMag,
        (-vy / len) * dragMag,
        (-vz / len) * dragMag,
      );
      body.applyCentralForce(this.dragForce);
      body.activate();
    }

    this.syncWheels();
  }

  private syncWheels(): void {
    if (this.wheelEntities.length === 0) return;
    const n = this.vehicle.getNumWheels();
    for (let i = 0; i < n; i++) {
      const ent = this.wheelEntities[i];
      if (!ent) continue;
      this.vehicle.updateWheelTransform(i, true);
      const tr = this.vehicle.getWheelTransformWS(i);
      const o = tr.getOrigin();
      const q = tr.getRotation();
      ent.setPosition(o.x(), o.y(), o.z());
      ent.setRotation(new Quat(q.x(), q.y(), q.z(), q.w()));
    }
  }

  /** Snapshot for camera / debug / the straight-line probe. */
  getState(): VehicleState {
    const pos = this.chassis.getPosition();
    let yawRate = 0;
    let wheelsOnGround = 0;
    const rb = this.chassis.rigidbody;
    if (rb && rb.body) {
      const w = rb.body.getAngularVelocity();
      yawRate = w.y();
    }
    if (this.vehicle) {
      const n = this.vehicle.getNumWheels();
      for (let i = 0; i < n; i++) {
        const wi = this.vehicle.getWheelInfo(i);
        // btWheelInfo.get_m_raycastInfo().get_m_isInContact() is the contact flag.
        try {
          if (wi.get_m_raycastInfo().get_m_isInContact()) wheelsOnGround++;
        } catch {
          /* older ammo builds may not expose the accessor; ignore */
        }
      }
    }
    return {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      speedKmh: this.vehicle ? this.vehicle.getCurrentSpeedKmHour() : 0,
      yawRate,
      steerAngle: this.steerAngle,
      wheelsOnGround,
    };
  }

  /** Reset the chassis to a pose (used by the test-scene "reset" key + probes). */
  resetTo(position: Vec3, yawDegrees: number): void {
    const rb = this.chassis.rigidbody;
    if (!rb || !rb.body) return;
    // teleport() moves BOTH the entity and the Ammo body (public API; the
    // private syncEntityToBody is what it calls internally).
    rb.teleport(position, new Vec3(0, yawDegrees, 0));
    // Zero out momentum so the reset car starts at rest.
    const Ammo = this.ammo;
    const zero = new Ammo.btVector3(0, 0, 0);
    rb.body.setLinearVelocity(zero);
    rb.body.setAngularVelocity(zero);
    Ammo.destroy(zero);
    this.vehicle.resetSuspension();
    this.steerAngle = 0;
    rb.body.activate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const Ammo = this.ammo;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dynamicsWorld = (this.app.systems as any).rigidbody?.dynamicsWorld;
      if (dynamicsWorld && this.vehicle) dynamicsWorld.removeAction(this.vehicle);
    } catch {
      /* world may already be torn down during app.destroy — safe to ignore */
    }
    const sd = (obj: unknown) => {
      if (obj) Ammo.destroy(obj);
    };
    sd(this.vehicle);
    sd(this.raycaster);
    // NOTE: do NOT Ammo.destroy(this.tuning). In this ammo.js build a
    // `btVehicleTuning` created with `new Ammo.btVehicleTuning()` is not tracked
    // in emscripten's destroy cache (the vehicle + each wheel copy its values by
    // reference at addWheel time), so destroying it throws "Cannot destroy
    // object. (Did you create it yourself?)". It is a tiny POD struct and there
    // is exactly one per vehicle, so leaving it is a negligible, bounded leak.
    sd(this.dragForce);
    this.vehicle = null;
    this.raycaster = null;
    this.tuning = null;
    this.dragForce = null;
    this.wheelEntities = [];
  }
}

/** Convenience: km/h helper re-export so scenes don't import the kernel twice. */
export { msToKmh };
