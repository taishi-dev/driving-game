import {
  Application,
  Color,
  Entity,
  StandardMaterial,
  Vec3,
  TONEMAP_ACES,
} from "playcanvas";
import { type SceneHandle } from "./showroomScene";
import { VEHICLE_TUNING } from "./raycastVehicle";
import { buildDriveWorld } from "./driveWorld";
import { setupDriveSkyAndSun } from "./driveSky";
import { ensurePhysicsWorld } from "./ammoPhysics";
import { useDrivingStore } from "@/lib/store";
import { sampleReplay, replayDurationMs } from "@/lib/replay";

const RAD2DEG = 180 / Math.PI;

/**
 * P8 — the feedback screen's replay-review scene.
 *
 * Reuses the P5 {@link buildDriveWorld} (same Quaternius world + coordinate
 * contract as the drive) and the same sky/IBL as the drive base, but with NO
 * raycast vehicle: a single KINEMATIC car — a visual-only body/cab/wheels rig
 * sharing the drive car's {@link VEHICLE_TUNING} proportions (constant reuse,
 * per the E1 lesson) — is repositioned every frame from the recorded replay
 * frames. Two cameras back the store's `replayViewMode` toggle: a smoothed
 * chase camera behind the car and a driver camera parented at the cabin looking
 * forward.
 *
 * Unlike the drive scenes this builder OWNS its frame loop and reads the frozen
 * store directly (the productDriveScene pattern): each frame it advances a
 * real-time clock, samples `replayData` via the frozen `replay.ts`
 * (timestamp-interpolated), and drives the car. Playback LOOPS once it reaches
 * the end of the recording — matching the original R3F Car.tsx convention.
 *
 * Physics: `buildDriveWorld` builds its road colliders as STATIC rigidbodies, so
 * the Ammo world must exist (exactly E1's replay-scene situation, where the
 * kinematic car still needed a physics-enabled scene for the world's static
 * colliders). We therefore call {@link ensurePhysicsWorld} at the top and mount
 * this scene through the Ammo-gated `DriveCanvas`. The car itself has no
 * rigidbody — it is never simulated, only positioned — so the step cost is nil.
 *
 * `window.__replayDebug` is double-gated exactly like `__driveDebug` /
 * `__drivingStore` (build-time NEXT_PUBLIC_E2E + runtime `?e2e`), exposing
 * replay telemetry (car position, elapsed/duration, loop count, view mode, fps)
 * for headless verification — no user data.
 */
export function createReplayScene(
  app: Application,
  isDisposed: () => boolean,
): SceneHandle {
  // Road colliders are static rigidbodies → the physics world must exist before
  // buildDriveWorld adds them (see ensurePhysicsWorld). DriveCanvas has already
  // awaited loadAmmo(), so the global Ammo is present.
  ensurePhysicsWorld(app);

  // --- Sky/IBL + key light (shared with the drive base, see driveSky.ts) ----
  // Same runtime HDRI prefilter as the drive scene: StandardMaterial diffuse
  // needs an IBL source, so the world materials would go unlit without it.
  const sky = setupDriveSkyAndSun(app, isDisposed, "replay-hdr");

  // --- Terrain: flat visual surround (no collider needed — car is kinematic) --
  const terrain = new Entity("replay-terrain");
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

  // --- The world (same builder + coordinate contract as the drive) ---------
  const world = buildDriveWorld(app, isDisposed);

  // --- Kinematic car: a visual-only rig sharing the drive car's proportions.
  //     No rigidbody — its transform is set from the recording each frame. -----
  const T = VEHICLE_TUNING;
  const carRoot = new Entity("replay-car");
  app.root.addChild(carRoot);

  const body = new Entity("replay-car-body");
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
  carRoot.addChild(body);

  const cab = new Entity("replay-car-cab");
  cab.addComponent("render", { type: "box" });
  const cabMat = new StandardMaterial();
  cabMat.diffuse = new Color(0.12, 0.14, 0.2);
  cabMat.update();
  cab.render!.material = cabMat;
  cab.setLocalScale(
    T.chassisHalfExtents.x * 1.6,
    T.chassisHalfExtents.y * 1.2,
    T.chassisHalfExtents.z * 1.1,
  );
  cab.setLocalPosition(0, T.chassisHalfExtents.y * 1.0, 0.4); // toward +Z (front)
  carRoot.addChild(cab);

  const wheelMat = new StandardMaterial();
  wheelMat.useMetalness = true;
  wheelMat.diffuse = new Color(0.05, 0.05, 0.06);
  wheelMat.metalness = 0.0;
  wheelMat.gloss = 0.4;
  wheelMat.update();
  const wheelEntities: Entity[] = [];
  const wx = T.wheelHalfTrack;
  const wz = T.wheelHalfBase;
  const wy = -T.chassisHalfExtents.y;
  const wheelOffsets: Array<[number, number, number]> = [
    [-wx, wy, wz],
    [wx, wy, wz],
    [-wx, wy, -wz],
    [wx, wy, -wz],
  ];
  for (let i = 0; i < 4; i++) {
    const w = new Entity(`replay-wheel-${i}`);
    w.addComponent("render", { type: "cylinder" });
    w.render!.material = wheelMat;
    // Cylinder axis is local Y; a disc scaled flat in Y + rotated so it lies as
    // a wheel (spins about X). Purely cosmetic on the kinematic rig.
    w.setLocalScale(T.wheelRadius * 2, 0.25, T.wheelRadius * 2);
    w.setLocalEulerAngles(0, 0, 90);
    w.setLocalPosition(wheelOffsets[i][0], wheelOffsets[i][1], wheelOffsets[i][2]);
    carRoot.addChild(w);
    wheelEntities.push(w);
  }

  // --- Chase camera (top-level, smoothed each frame) -----------------------
  // Same offsets as the drive base's chase (local −Z = behind, +Z = forward).
  const chaseCam = new Entity("replay-chase-camera");
  chaseCam.addComponent("camera", {
    clearColor: new Color(0.5, 0.62, 0.78),
    fov: 55,
    nearClip: 0.1,
    farClip: 1000,
    toneMapping: TONEMAP_ACES,
  });
  chaseCam.setPosition(0, 6, 24);
  app.root.addChild(chaseCam);

  // --- Driver camera (parented to the car, at the cabin, looking forward) --
  // A camera looks down its local −Z; the car's forward is local +Z, so the
  // driver cam is yawed 180° relative to the car so its view faces forward.
  // Placed at the windshield: FORWARD of the cab front face (cab spans
  // z∈[−0.7,1.5] local — setLocalScale is the box's FULL size) and above the
  // body top (y=0.5), so the cab is behind the camera and only a sliver of
  // hood shows at the bottom (the E1 driver-cam convention).
  const driverCam = new Entity("replay-driver-camera");
  driverCam.addComponent("camera", {
    clearColor: new Color(0.5, 0.62, 0.78),
    fov: 62,
    nearClip: 0.1,
    farClip: 1000,
    toneMapping: TONEMAP_ACES,
  });
  driverCam.setLocalPosition(0, 0.9, 1.6);
  driverCam.setLocalEulerAngles(0, 180, 0);
  driverCam.enabled = false;
  carRoot.addChild(driverCam);

  const camOffsetLocal = new Vec3(0, 3.2, -8.5); // above + behind
  const camTargetLocal = new Vec3(0, 1.0, 4); // look ahead of the car
  const desiredPos = new Vec3();
  const targetPos = new Vec3();
  const smoothedPos = new Vec3(0, 6, 24);
  let chaseInitialized = false;
  function updateChaseCamera(dt: number) {
    const m = carRoot.getWorldTransform();
    m.transformPoint(camOffsetLocal, desiredPos);
    m.transformPoint(camTargetLocal, targetPos);
    if (!chaseInitialized) {
      // Snap on the first frame so the chase doesn't sweep in from the origin.
      smoothedPos.copy(desiredPos);
      chaseInitialized = true;
    } else {
      const a = Math.min(1, dt * 6);
      smoothedPos.lerp(smoothedPos, desiredPos, a);
    }
    chaseCam.setPosition(smoothedPos);
    chaseCam.lookAt(targetPos);
  }

  let lastViewMode = useDrivingStore.getState().replayViewMode;
  function applyViewMode(mode: "chase" | "driver") {
    chaseCam.enabled = mode === "chase";
    driverCam.enabled = mode === "driver";
  }
  applyViewMode(lastViewMode);

  // --- Playback frame loop -------------------------------------------------
  let elapsedMs = 0;
  let loops = 0;
  const onUpdate = (dt: number) => {
    if (isDisposed()) return;
    const st = useDrivingStore.getState();

    // Live chase/driver toggle.
    if (st.replayViewMode !== lastViewMode) {
      lastViewMode = st.replayViewMode;
      applyViewMode(lastViewMode);
    }

    // Advance by REAL elapsed time (raw dt, not a fixed step) so the recording
    // plays in the wall-clock duration it was recorded in.
    elapsedMs += dt * 1000;
    const frames = st.replayData;
    if (frames.length > 0) {
      const sample = sampleReplay(frames, elapsedMs);
      if (sample) {
        carRoot.setPosition(sample.position[0], sample.position[1], sample.position[2]);
        // Recorded rotation is the chassis euler in RADIANS; PlayCanvas eulers
        // are DEGREES — convert back (exact round-trip of productDriveScene).
        carRoot.setEulerAngles(
          sample.rotation[0] * RAD2DEG,
          sample.rotation[1] * RAD2DEG,
          sample.rotation[2] * RAD2DEG,
        );
        if (sample.done) {
          // Loop from the top (original Car.tsx convention).
          elapsedMs = 0;
          loops += 1;
          chaseInitialized = false;
        }
      }
    }

    if (chaseCam.enabled) updateChaseCamera(dt);
  };
  app.on("update", onUpdate);

  // --- Debug hook, double-gated like __driveDebug (store.ts) ---------------
  let exposed = false;
  if (process.env.NEXT_PUBLIC_E2E === "1" && typeof window !== "undefined") {
    try {
      if (new URLSearchParams(window.location.search).has("e2e")) {
        (globalThis as unknown as { __replayDebug?: unknown }).__replayDebug = {
          getState: () => {
            const p = carRoot.getPosition();
            const s = useDrivingStore.getState();
            return {
              x: p.x,
              y: p.y,
              z: p.z,
              elapsedMs: Math.round(elapsedMs),
              durationMs: Math.round(replayDurationMs(s.replayData)),
              loops,
              viewMode: s.replayViewMode,
              frameCount: s.replayData.length,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              fps: Math.round((app.stats as any)?.frame?.fps ?? 0),
            };
          },
        };
        exposed = true;
      }
    } catch {
      // location may be unavailable in some environments; ignore.
    }
  }

  return {
    dispose() {
      app.off("update", onUpdate);
      if (exposed && typeof window !== "undefined") {
        delete (globalThis as unknown as { __replayDebug?: unknown }).__replayDebug;
      }
      sky.dispose();
      world.dispose();
      for (const w of wheelEntities) w.destroy();
      cab.destroy();
      body.destroy();
      driverCam.destroy();
      carRoot.destroy();
      chaseCam.destroy();
      terrain.destroy();
      groundMat.destroy();
      bodyMat.destroy();
      cabMat.destroy();
      wheelMat.destroy();
    },
  };
}
