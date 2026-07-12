import {
  Application,
  Color,
  Entity,
  StandardMaterial,
  Vec3,
  TONEMAP_ACES,
} from "playcanvas";
import { type SceneHandle } from "./showroomScene";
import { RaycastVehicle, VEHICLE_TUNING, type VehicleInput } from "./raycastVehicle";
import { ensurePhysicsWorld } from "./ammoPhysics";
import { loadHeroCar } from "./heroCar";
import { chassisGroundLocalY } from "@/lib/pcHeroCarFit";
import { buildDriveWorld, type DriveWorldHandle } from "./driveWorld";
import { setupRearviewMirror, type RearviewMirrorHandle } from "./rearviewMirror";
import { setupDriveSkyAndSun } from "./driveSky";
import { createDriveControls, normalizeKey, signedThrottle } from "@/lib/pcDriveControls";
import { chaseCameraPose, flattenHeading, type ChaseCameraConfig } from "@/lib/pcChaseCamera";

/**
 * P4/P5 — the drivable world scene, split (P7a) into a reusable BASE builder and
 * the /drive TEST wrapper.
 *
 * {@link buildDriveSceneBase} assembles everything both consumers share: physics
 * world, sky/IBL, sun, terrain, the Quaternius world, the chassis + wheels +
 * official Ammo `btRaycastVehicle`, the rearview mirror, and the chase camera.
 * It deliberately owns NO input policy and NO frame loop — that's what
 * distinguishes the two consumers:
 *
 *  • {@link createDriveScene} (this file): the /drive TEST scene. Local keyboard
 *    via the pure `pcDriveControls` contract (P6), a script-forceable input, and
 *    a `window.__driveDebug` double-gated (NEXT_PUBLIC_E2E + `?e2e`) since P12.
 *  • `createProductDriveScene` (productDriveScene.ts): the product driving
 *    screen. No listeners of its own — it consumes the STORE's
 *    steering/throttle/brake/gear each frame (the React shell writes them) and
 *    writes back telemetry; its `__driveDebug` is double-gated like
 *    `__drivingStore` (NEXT_PUBLIC_E2E + `?e2e`).
 *
 * Controls on /drive (same keys the product wires through the same module):
 *   W / ↑ = gas, S / ↓ = brake, A/D or ←/→ = steer, 1/2/3 = gear P/D/R, R = reset.
 */

export interface DriveDebugApi {
  getState: () => ReturnType<RaycastVehicle["getState"]> & {
    gear: string;
    offTrack: boolean;
    /** GL draw calls in the last rendered frame (instancing-benefit measurement). */
    drawCalls: number;
  };
  setInput: (steer: number, throttle: number, brake: number) => void;
  /** Clear any script-forced input and return control to the keyboard/store. */
  releaseInput: () => void;
  reset: () => void;
  /** Toggle the rearview mirror (P7's graded checkpoints use this hook). */
  setMirrorActive: (active: boolean) => void;
  isMirrorActive: () => boolean;
  /**
   * P7b goal-sweep aid: zero-velocity chassis placement for programmatic
   * grading checks (e.g. teleport into a stop zone, then to the goal). Only the
   * product scene provides it (double-gated like the rest of the hook).
   */
  teleport?: (x: number, z: number, yawDegrees?: number) => void;
}

declare global {
  var __driveDebug: DriveDebugApi | undefined;
}

const SPAWN_POS = new Vec3(0, VEHICLE_TUNING.spawnHeight, 12);
const SPAWN_YAW = 180; // face −Z (local +Z → world −Z); see raycastVehicle coordinate note

/** Everything the shared world/vehicle base hands its consumer. */
export interface DriveSceneBase {
  vehicle: RaycastVehicle;
  world: DriveWorldHandle;
  mirror: RearviewMirrorHandle;
  /** Advance the smoothed chase camera one frame. */
  updateCamera: (dt: number) => void;
  /** GL draw calls in the last rendered frame. */
  drawCalls: () => number;
  /** Teleport the car back to the spawn pose, at rest. */
  resetToSpawn: () => void;
  /** Dispose everything the base created (consumer removes its own listeners first). */
  dispose: () => void;
}

/**
 * Build the shared drive world + vehicle onto the running Application.
 * `isDisposed` is the strict-mode probe (async work landing after unmount is
 * dropped). The caller owns the frame loop and input policy.
 */
export function buildDriveSceneBase(
  app: Application,
  isDisposed: () => boolean,
  /** Current lesson — drives the world's per-lesson build-out (see driveWorld). */
  lesson?: string,
  /** Called once the hero-car GLB has streamed in and replaced the box
   *  placeholder — the product scene uses it to lift its loading overlay so the
   *  placeholder box is never shown to the learner (bug fix). */
  onCarReady?: () => void,
): DriveSceneBase {
  // Create the physics world BEFORE any rigidbody entity is added (the builder
  // runs before app.start(), so we must init it here — see ensurePhysicsWorld).
  ensurePhysicsWorld(app);

  // --- Sky/IBL + key light (shared with the replay scene, see driveSky.ts) --
  const sky = setupDriveSkyAndSun(app, isDisposed, "drive-hdr");

  // --- Camera (chase) ------------------------------------------------------
  const camera = new Entity("drive-camera");
  camera.addComponent("camera", {
    clearColor: new Color(0.5, 0.62, 0.78), // daytime sky-ish
    fov: 55,
    nearClip: 0.1,
    farClip: 1000,
    toneMapping: TONEMAP_ACES,
  });
  camera.setPosition(0, 6, 24);
  app.root.addChild(camera);
  // Scene-colour grab pass: the hero car's glass (KHR_materials_transmission →
  // useDynamicRefraction) needs it; without it the glass renders as an opaque
  // fallback (observed as a solid pink roof) and errors per frame.
  camera.camera!.requestSceneColorMap(true);

  // --- Terrain: flat surround (visual + flat safety collider) --------------
  // A large flat ground around the road so off-road isn't empty void, and a
  // matching FLAT collider whose top sits 2 cm BELOW the road (Y=−0.02) so the
  // car never falls into the void if it leaves the road strip. The road's own
  // flat colliders (built by buildDriveWorld at Y=0) sit slightly higher, so on
  // the road the wheels ray those; both are FLAT boxes — never the crowned
  // visual tiles (the E1 camber-drift lesson). Off-track is reported separately
  // by the pure layout math, independent of which flat collider the wheels hit.
  // NB: `render.material` on a primitive returns the ENGINE-WIDE shared default
  // material. Mutating that getter would bleed onto every other primitive
  // (terrain/body/cab/wheels), so each gets its OWN `new StandardMaterial()`.
  const terrain = new Entity("terrain");
  terrain.addComponent("render", { type: "plane" });
  const groundMat = new StandardMaterial();
  groundMat.useMetalness = true;
  groundMat.diffuse = new Color(0.3, 0.32, 0.32);
  groundMat.metalness = 0.0;
  groundMat.gloss = 0.25;
  groundMat.update();
  terrain.render!.material = groundMat;
  terrain.setLocalScale(600, 1, 600);
  terrain.setPosition(0, -0.02, -90);
  app.root.addChild(terrain);

  const terrainCollider = new Entity("terrain-collider");
  terrainCollider.addComponent("collision", {
    type: "box",
    halfExtents: new Vec3(300, 0.5, 300),
  });
  terrainCollider.addComponent("rigidbody", {
    type: "static",
    friction: 1.0,
    restitution: 0.0,
  });
  terrainCollider.setPosition(0, -0.52, -90); // top face at Y=−0.02
  app.root.addChild(terrainCollider);

  // --- Quaternius drivable world (road tiles + flat road colliders + props) --
  const world = buildDriveWorld(app, isDisposed, lesson);

  // --- Chassis: box render (child, scaled) + box collision + dynamic body --
  const T = VEHICLE_TUNING;
  const chassis = new Entity("chassis");
  chassis.addComponent("collision", {
    type: "box",
    halfExtents: new Vec3(T.chassisHalfExtents.x, T.chassisHalfExtents.y, T.chassisHalfExtents.z),
  });
  chassis.addComponent("rigidbody", {
    type: "dynamic",
    mass: T.chassisMass,
    friction: 0.6,
    restitution: 0.0,
    // Modest linear/angular damping keeps it composed without masking the drag cap.
    linearDamping: 0.05,
    angularDamping: 0.3,
  });
  chassis.setPosition(SPAWN_POS);
  chassis.setEulerAngles(0, SPAWN_YAW, 0);
  app.root.addChild(chassis);

  // Visual body: the PBR hero car (GLB), mounted as a scale-fitted child (the
  // chassis entity itself stays at scale 1 so the collision halfExtents stay
  // correct). While the GLB streams in, a simple box body+cab placeholder keeps
  // the car visible from frame one; `onMounted` swaps it out.
  const body = new Entity("chassis-body");
  body.addComponent("render", { type: "box" });
  const bodyMat = new StandardMaterial();
  bodyMat.useMetalness = true;
  bodyMat.diffuse = new Color(0.72, 0.08, 0.09);
  bodyMat.metalness = 0.1;
  bodyMat.gloss = 0.6;
  bodyMat.update();
  body.render!.material = bodyMat;
  body.setLocalScale(
    T.chassisHalfExtents.x * 2,
    T.chassisHalfExtents.y * 2,
    T.chassisHalfExtents.z * 2,
  );
  chassis.addChild(body);
  // A small cab so the placeholder's facing is visible.
  const cab = new Entity("chassis-cab");
  cab.addComponent("render", { type: "box" });
  const cabMat = new StandardMaterial();
  cabMat.diffuse = new Color(0.12, 0.14, 0.2);
  cabMat.update();
  cab.render!.material = cabMat;
  cab.setLocalScale(T.chassisHalfExtents.x * 1.6, T.chassisHalfExtents.y * 1.2, T.chassisHalfExtents.z * 1.1);
  cab.setLocalPosition(0, T.chassisHalfExtents.y * 1.0, 0.4); // toward +Z (front)
  chassis.addChild(cab);

  // --- Visual wheels (synced from the Bullet vehicle each frame) -----------
  // One shared tyre material for all four wheels (intentional reuse via an
  // explicit instance — NOT the shared primitive default the other meshes hit).
  const wheelMat = new StandardMaterial();
  wheelMat.useMetalness = true;
  wheelMat.diffuse = new Color(0.05, 0.05, 0.06);
  wheelMat.metalness = 0.0;
  wheelMat.gloss = 0.4;
  wheelMat.update();
  const wheelEntities: Entity[] = [];
  for (let i = 0; i < 4; i++) {
    const w = new Entity(`wheel-${i}`);
    w.addComponent("render", { type: "cylinder" });
    w.render!.material = wheelMat;
    // Cylinder axis is local Y; wheels spin about X → rotate the mesh 90° about Z.
    // We sync world transform from Bullet each frame, so bake the axis fix into
    // a child mesh instead: simplest is to scale to a disc and orient at sync.
    w.setLocalScale(T.wheelRadius * 2, 0.25, T.wheelRadius * 2);
    app.root.addChild(w);
    wheelEntities.push(w);
  }

  // --- The vehicle ---------------------------------------------------------
  const vehicle = new RaycastVehicle(app, chassis);
  vehicle.attachWheelEntities(wheelEntities);

  const heroCar = loadHeroCar(app, isDisposed, undefined, {
    parent: chassis,
    chassisWidth: T.chassisHalfExtents.x * 2,
    chassisLength: T.chassisHalfExtents.z * 2,
    groundLocalY: chassisGroundLocalY(T.wheelConnectionY, T.suspensionRest, T.wheelRadius),
    onMounted: () => {
      body.enabled = false;
      cab.enabled = false;
      // The GLB's own (static) wheels replace the synced cylinders visually —
      // see the mount note in heroCar.ts.
      for (const w of wheelEntities) w.enabled = false;
      // Real car is in — let the consumer drop its loading overlay.
      onCarReady?.();
    },
    onError: () => {
      // GLB failed / never mounted: keep the placeholder box+cab+wheels visible
      // (do NOT disable them) and still drop the loading overlay, so the drive is
      // playable with the placeholder instead of hanging on a permanent spinner.
      onCarReady?.();
    },
  });

  // --- Rearview mirror (P5b) -----------------------------------------------
  const mirror = setupRearviewMirror(
    app,
    chassis,
    T.chassisHalfExtents.y,
    T.chassisHalfExtents.z,
  );

  // --- Chase camera --------------------------------------------------------
  // YAW-ONLY chase (see pcChaseCamera.ts): the camera pose is derived from the
  // chassis' WORLD POSITION + ground HEADING only, never its roll/pitch. The old
  // build transformed a local offset through the chassis' full world transform,
  // so a bump or off-track tumble rocked the camera and rolled the whole horizon
  // (the nausea bug from the real-drive recording). Now the horizon stays level
  // no matter what the chassis does: `flattenHeading` projects the car's forward
  // axis onto the ground, and the world-up `lookAt` keeps the camera un-rolled.
  const CHASE_CFG: ChaseCameraConfig = {
    distance: 8.5, // behind (was local −Z offset)
    height: 3.2, // above
    lookAhead: 4, // look ahead of the car
    lookHeight: 1.0,
  };
  const fwd = new Vec3(); // scratch: chassis local +Z axis in world (car forward)
  const desiredPos = new Vec3();
  const targetPos = new Vec3();
  const smoothedPos = new Vec3(0, 6, 24);
  const smoothedTarget = new Vec3(0, 1, 0);
  let chaseInitialized = false;
  function updateCamera(dt: number) {
    const pos = chassis.getPosition();
    // getZ = the chassis' local +Z axis expressed in world space = car forward
    // (raycastVehicle coordinate contract: local +Z is forward).
    chassis.getWorldTransform().getZ(fwd);
    const heading = flattenHeading({ x: fwd.x, y: fwd.y, z: fwd.z });
    const pose = chaseCameraPose({ x: pos.x, y: pos.y, z: pos.z }, heading, CHASE_CFG);
    desiredPos.set(pose.position.x, pose.position.y, pose.position.z);
    targetPos.set(pose.target.x, pose.target.y, pose.target.z);
    if (!chaseInitialized) {
      // Snap on the first frame so the camera doesn't sweep in from the origin.
      smoothedPos.copy(desiredPos);
      smoothedTarget.copy(targetPos);
      chaseInitialized = true;
    } else {
      // Critically-damped-ish smoothing of BOTH the eye and the look target so a
      // fast yaw (sharp turn) eases in instead of snapping.
      const a = Math.min(1, dt * 6);
      smoothedPos.lerp(smoothedPos, desiredPos, a);
      smoothedTarget.lerp(smoothedTarget, targetPos, a);
    }
    camera.setPosition(smoothedPos);
    camera.lookAt(smoothedTarget); // default up = world +Y → never rolls
  }

  return {
    vehicle,
    world,
    mirror,
    updateCamera,
    drawCalls: () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((app.stats as any)?.drawCalls?.total ?? 0) as number,
    resetToSpawn: () => vehicle.resetTo(SPAWN_POS, SPAWN_YAW),
    dispose() {
      sky.dispose();
      mirror.dispose();
      world.dispose();
      vehicle.dispose();
      for (const w of wheelEntities) w.destroy();
      heroCar.dispose();
      cab.destroy();
      body.destroy();
      chassis.destroy();
      terrainCollider.destroy();
      terrain.destroy();
      groundMat.destroy();
      bodyMat.destroy();
      cabMat.destroy();
      wheelMat.destroy();
      camera.destroy();
    },
  };
}

/**
 * Build the P4 drive TEST scene (/drive route) onto the running Application:
 * the shared base + local keyboard controls + an UNGATED `__driveDebug`.
 */
export function createDriveScene(
  app: Application,
  isDisposed: () => boolean,
): SceneHandle {
  const base = buildDriveSceneBase(app, isDisposed);

  // --- Keyboard state (via the shared pure pcDriveControls contract) -------
  const controls = createDriveControls();
  // Script-forced input (probe). null = keyboard drives.
  let forced: VehicleInput | null = null;

  const onKeyDown = (e: KeyboardEvent) => {
    controls.keyDown(e.key);
    // Reset is a test-scene-only convenience, not part of the drive contract.
    if (normalizeKey(e.key) === "r") base.resetToSpawn();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    controls.keyUp(e.key);
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  function computeKeyboardInput(): VehicleInput {
    const { gas, brake, steer } = controls.getInput();
    // signedThrottle applies the gear sign (P → 0, D → +, R → −).
    return { steer, throttle: signedThrottle(controls.getGear(), gas), brake };
  }

  // --- Frame loop ----------------------------------------------------------
  const onUpdate = (dt: number) => {
    if (isDisposed()) return;
    // PlayCanvas fires 'update' with dt already in SECONDS.
    const input = forced ?? computeKeyboardInput();
    base.vehicle.setInput(input);
    base.vehicle.update(dt);
    base.updateCamera(dt);
  };
  app.on("update", onUpdate);

  // --- Debug hook, double-gated like __drivingStore / the product scene -----
  // P12 decision: the /drive TEST route's hook is now gated EXACTLY like the
  // product scene (build-time NEXT_PUBLIC_E2E === "1" so prod bundles drop the
  // block, plus runtime `?e2e`) — it exposes behaviour injection (setInput /
  // reset), so keeping it out of the real deploy is a small hardening win. The
  // on-screen `drive-fps` badge is unaffected (rendered by PlayCanvasCanvas), so
  // the fps-measurement path still works, and the e2e specs load with `?e2e`.
  let debugApi: DriveDebugApi | undefined;
  if (process.env.NEXT_PUBLIC_E2E === "1" && typeof window !== "undefined") {
    try {
      if (new URLSearchParams(window.location.search).has("e2e")) {
        debugApi = {
          getState: () => {
            const s = base.vehicle.getState();
            return {
              ...s,
              gear: controls.getGear(),
              offTrack: base.world.isOffTrack(s.x, s.z),
              drawCalls: base.drawCalls(),
            };
          },
          setInput: (steer, throttle, brake) => {
            forced = { steer, throttle, brake };
          },
          releaseInput: () => {
            forced = null;
          },
          reset: () => base.resetToSpawn(),
          setMirrorActive: (a) => base.mirror.setActive(a),
          isMirrorActive: () => base.mirror.isActive(),
        };
        globalThis.__driveDebug = debugApi;
      }
    } catch {
      // location may be unavailable in some environments; ignore.
    }
  }

  return {
    dispose() {
      app.off("update", onUpdate);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (debugApi && globalThis.__driveDebug === debugApi) {
        globalThis.__driveDebug = undefined;
      }
      base.dispose();
    },
  };
}
