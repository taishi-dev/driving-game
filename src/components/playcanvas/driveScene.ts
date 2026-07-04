import {
  Application,
  Asset,
  Color,
  Entity,
  EnvLighting,
  StandardMaterial,
  Texture,
  Vec3,
  TONEMAP_ACES,
} from "playcanvas";
import { SHOWROOM_HDR_URL, type SceneHandle } from "./showroomScene";
import { RaycastVehicle, VEHICLE_TUNING } from "./raycastVehicle";
import { ensurePhysicsWorld } from "./ammoPhysics";
import { buildDriveWorld } from "./driveWorld";
import { setupRearviewMirror } from "./rearviewMirror";
import { createDriveControls, normalizeKey, signedThrottle } from "@/lib/pcDriveControls";

/**
 * P4 — vehicle-physics TEST scene on /drive.
 *
 * A deliberately minimal world (flat lit ground + a box "car") whose only job is
 * to prove the official Ammo `btRaycastVehicle` drives / turns / brakes / settles
 * and — critically — that the physics world survives React strict-mode's
 * destroy→recreate (see the lifecycle verdict in `ammoPhysics.ts`). P5 swaps the
 * flat ground for the Quaternius world (keeping the FLAT collider boxes as the
 * wheel-ray surface); P5b adds the rearview mirror.
 *
 * Controls are LOCAL to this test scene and go through the shared pure
 * `pcDriveControls` contract (P6) — the SAME module the product driving screen
 * wires the keyboard through, so the test route and the product feel identical:
 *   W / ↑ = gas, S / ↓ = brake, A/D or ←/→ = steer, 1/2/3 = gear P/D/R, R = reset.
 *
 * `window.__driveDebug.getState()` is exposed UNGATED here — fine for a test
 * route; P12 double-gates it behind NEXT_PUBLIC_E2E + `?e2e` like the product
 * store hook. The scripted straight-line probe reads it.
 */

export interface DriveDebugApi {
  getState: () => ReturnType<RaycastVehicle["getState"]> & {
    gear: string;
    offTrack: boolean;
    /** GL draw calls in the last rendered frame (instancing-benefit measurement). */
    drawCalls: number;
  };
  setInput: (steer: number, throttle: number, brake: number) => void;
  /** Clear any script-forced input and return control to the keyboard. */
  releaseInput: () => void;
  reset: () => void;
  /** Toggle the rearview mirror (P7's graded checkpoints use this hook). */
  setMirrorActive: (active: boolean) => void;
  isMirrorActive: () => boolean;
}

declare global {
  var __driveDebug: DriveDebugApi | undefined;
}

const SPAWN_POS = new Vec3(0, VEHICLE_TUNING.spawnHeight, 12);
const SPAWN_YAW = 180; // face −Z (local +Z → world −Z); see raycastVehicle coordinate note

/**
 * Build the P4 drive test scene onto the running Application. `isDisposed` is the
 * strict-mode probe (async work landing after unmount is dropped).
 */
export function createDriveScene(
  app: Application,
  isDisposed: () => boolean,
): SceneHandle {
  // Create the physics world BEFORE any rigidbody entity is added (the builder
  // runs before app.start(), so we must init it here — see ensurePhysicsWorld).
  ensurePhysicsWorld(app);

  const scene = app.scene;
  scene.exposure = 1.1;
  scene.ambientLight = new Color(0.1, 0.11, 0.13);

  // --- Outdoor sky + image-based lighting (runtime HDRI prefilter) ---------
  // PlayCanvas' StandardMaterial diffuse needs an ambient/IBL source; a flat
  // scene.ambientLight alone does not light it. So the drive world loads the
  // shipped Poly Haven sky HDR, prefilters it into an environment atlas (the
  // exact approach proven in showroomScene.ts) to drive both the visible
  // skybox and surface lighting. P5 keeps this and lays the Quaternius world
  // under it.
  const generated: Texture[] = [];
  const envAsset = new Asset("drive-hdr", "texture", { url: SHOWROOM_HDR_URL });
  envAsset.on("load", () => {
    if (isDisposed()) return;
    const source = envAsset.resource as Texture;
    const lightingSource = EnvLighting.generateLightingSource(source);
    const envAtlas = EnvLighting.generateAtlas(lightingSource);
    lightingSource.destroy();
    generated.push(envAtlas);
    // envAtlas drives ambient + glossy reflections. We keep the camera's
    // clear-colour sky as the visible background (not scene.skybox, which needs
    // a cubemap) — the atlas is what actually lights the diffuse surfaces.
    scene.envAtlas = envAtlas;
    scene.skyboxIntensity = 1.0;
  });
  let envRafId = requestAnimationFrame(() => {
    envRafId = 0;
    if (isDisposed()) return;
    app.assets.add(envAsset);
    app.assets.load(envAsset);
  });

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

  // --- Lighting ------------------------------------------------------------
  const sun = new Entity("sun");
  sun.addComponent("light", {
    type: "directional",
    color: new Color(1.0, 0.97, 0.9),
    intensity: 3.5,
    castShadows: false,
  });
  sun.setEulerAngles(60, 20, 0);
  app.root.addChild(sun);

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
  const world = buildDriveWorld(app, isDisposed);

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

  // Visual body as a scaled child (keeps the chassis entity at scale 1 so the
  // collision halfExtents stay correct).
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
  // A small cab so the car's facing is visible in screenshots.
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

  // --- Rearview mirror (P5b) -----------------------------------------------
  const mirror = setupRearviewMirror(
    app,
    chassis,
    T.chassisHalfExtents.y,
    T.chassisHalfExtents.z,
  );

  // --- Keyboard state (via the shared pure pcDriveControls contract) -------
  const controls = createDriveControls();
  // Script-forced input (probe). null = keyboard drives.
  let forced: { steer: number; throttle: number; brake: number } | null = null;

  const onKeyDown = (e: KeyboardEvent) => {
    controls.keyDown(e.key);
    // Reset is a test-scene-only convenience, not part of the drive contract.
    if (normalizeKey(e.key) === "r") vehicle.resetTo(SPAWN_POS, SPAWN_YAW);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    controls.keyUp(e.key);
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  function computeKeyboardInput() {
    const { gas, brake, steer } = controls.getInput();
    // signedThrottle applies the gear sign (P → 0, D → +, R → −).
    return { steer, throttle: signedThrottle(controls.getGear(), gas), brake };
  }

  // --- Chase camera --------------------------------------------------------
  const camOffsetLocal = new Vec3(0, 3.2, -8.5); // above + behind (local −Z = behind)
  const camTargetLocal = new Vec3(0, 1.0, 4); // look ahead of the car
  const desiredPos = new Vec3();
  const targetPos = new Vec3();
  const smoothedPos = new Vec3(0, 6, 24);
  function updateCamera(dt: number) {
    const m = chassis.getWorldTransform();
    m.transformPoint(camOffsetLocal, desiredPos);
    m.transformPoint(camTargetLocal, targetPos);
    // Critically-damped-ish smoothing.
    const a = Math.min(1, dt * 6);
    smoothedPos.lerp(smoothedPos, desiredPos, a);
    camera.setPosition(smoothedPos);
    camera.lookAt(targetPos);
  }

  // --- Frame loop ----------------------------------------------------------
  const onUpdate = (dt: number) => {
    if (isDisposed()) return;
    // PlayCanvas fires 'update' with dt already in SECONDS.
    const input = forced ?? computeKeyboardInput();
    vehicle.setInput(input);
    vehicle.update(dt);
    updateCamera(dt);
  };
  app.on("update", onUpdate);

  // --- Debug hook (ungated test route; P12 double-gates) -------------------
  const debugApi: DriveDebugApi = {
    getState: () => {
      const s = vehicle.getState();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const drawCalls = ((app.stats as any)?.drawCalls?.total ?? 0) as number;
      return { ...s, gear: controls.getGear(), offTrack: world.isOffTrack(s.x, s.z), drawCalls };
    },
    setInput: (steer, throttle, brake) => {
      forced = { steer, throttle, brake };
    },
    releaseInput: () => {
      forced = null;
    },
    reset: () => vehicle.resetTo(SPAWN_POS, SPAWN_YAW),
    setMirrorActive: (a) => mirror.setActive(a),
    isMirrorActive: () => mirror.isActive(),
  };
  globalThis.__driveDebug = debugApi;

  return {
    dispose() {
      app.off("update", onUpdate);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (globalThis.__driveDebug === debugApi) globalThis.__driveDebug = undefined;
      if (envRafId) cancelAnimationFrame(envRafId);
      scene.envAtlas = null;
      for (const tex of generated) tex.destroy();
      envAsset.unload();
      app.assets.remove(envAsset);
      mirror.dispose();
      world.dispose();
      vehicle.dispose();
      for (const w of wheelEntities) w.destroy();
      cab.destroy();
      body.destroy();
      chassis.destroy();
      terrainCollider.destroy();
      terrain.destroy();
      groundMat.destroy();
      bodyMat.destroy();
      cabMat.destroy();
      wheelMat.destroy();
      sun.destroy();
      camera.destroy();
    },
  };
}
