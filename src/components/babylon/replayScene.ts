import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { FollowCamera } from "@babylonjs/core/Cameras/followCamera";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Engine } from "@babylonjs/core/Engines/engine";

// Side-effects (same set the drive scene relies on): shadow component, HDR
// loader, and the physics engine component (buildDriveWorld builds STATIC road
// colliders as PhysicsBodies, so physics must be enabled even though the replay
// car itself is kinematic — driven frame-by-frame from the recording, no forces).
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Materials/Textures/Loaders/hdrTextureLoader";
import "@babylonjs/core/Physics/joinedPhysicsEngineComponent";

import { getHavokPlugin } from "./havok";
import { buildDriveWorld } from "./driveWorld";

/** Chassis half-extents (m) — must match driveScene so replay looks like the drive. */
const CHASSIS = { hw: 0.9, hh: 0.4, hl: 2.0 } as const;
const WHEEL_RADIUS = 0.4;

export type ReplayViewMode = "chase" | "driver";

/**
 * Handle for the feedback screen's replay scene. The React canvas owns the
 * render loop; each frame it samples the recording (frozen `replay.ts`) and
 * calls {@link setCarTransform}. {@link setViewMode} swaps the active camera for
 * the store's chase/driver toggle.
 */
export interface ReplaySceneHandle {
  scene: Scene;
  /** Place the kinematic car: world position + Babylon euler (radians), as recorded. */
  setCarTransform: (position: [number, number, number], rotation: [number, number, number]) => void;
  setViewMode: (mode: ReplayViewMode) => void;
  getCarPosition: () => { x: number; y: number; z: number };
  dispose: () => void;
}

/**
 * B8 — the replay-review scene for the feedback screen.
 *
 * Reuses the B5 `buildDriveWorld` (same Quaternius world + coordinate system as
 * the drive), lit by the same HDRI, but with NO raycast vehicle: a single
 * kinematic "car" (the box hero-car body + four wheels, matching the drive
 * scene's proportions) is repositioned every frame from the recorded replay
 * frames. Two cameras — a chase FollowCamera behind the car and a driver
 * UniversalCamera parented at the cabin looking forward — back the store's
 * `replayViewMode` toggle.
 *
 * Physics is enabled with a FRESH Havok plugin (per the branch's
 * plugin-per-scene rule) solely so `buildDriveWorld` can build its static road
 * colliders; nothing dynamic is simulated, so the step cost is negligible.
 */
export async function createReplayScene(engine: Engine): Promise<ReplaySceneHandle> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.5, 0.62, 0.78, 1); // daylight sky (matches drive)

  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 1.0;

  // --- HDRI environment (same asset as the drive scene). ---
  const hdr = await new Promise<HDRCubeTexture>((resolve, reject) => {
    const tex = new HDRCubeTexture(
      "/env/kloofendal_48d_partly_cloudy_puresky_2k.hdr",
      scene,
      256,
      false,
      true,
      false,
      true,
      () => resolve(tex),
      (msg) => reject(new Error(`HDRI load failed: ${msg ?? "unknown"}`)),
    );
    scene.environmentTexture = tex;
  });
  scene.createDefaultSkybox(hdr, true, 2000, 0.2);

  // --- Physics: fresh Havok plugin, needed only for buildDriveWorld's static
  //     road colliders (the replay car is kinematic — never simulated). ---
  const havok = await getHavokPlugin();
  scene.enablePhysics(new Vector3(0, -9.81, 0), havok);

  // --- Lights + shadows (parity with the drive scene). ---
  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.25;
  const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, -0.3), scene);
  sun.position = new Vector3(30, 60, 30);
  sun.intensity = 2.0;
  const shadow = new ShadowGenerator(1024, sun);
  shadow.useBlurExponentialShadowMap = true;
  shadow.blurKernel = 16;

  // --- The world (same builder as the drive; loads Quaternius tiles). ---
  const world = await buildDriveWorld(scene);

  // --- Kinematic car: a parent node repositioned each frame; a red PBR box body
  //     + four cylinder wheels parented to it (matching driveScene proportions). ---
  const carRoot = new TransformNode("replayCar", scene);
  carRoot.rotationQuaternion = Quaternion.Identity();

  const body = MeshBuilder.CreateBox(
    "replayChassis",
    { width: CHASSIS.hw * 2, height: CHASSIS.hh * 2, depth: CHASSIS.hl * 2 },
    scene,
  );
  body.parent = carRoot;
  const bodyMat = new PBRMaterial("replayChassisMat", scene);
  bodyMat.albedoColor = new Color3(0.75, 0.1, 0.12);
  bodyMat.metallic = 0.3;
  bodyMat.roughness = 0.35;
  body.material = bodyMat;
  shadow.addShadowCaster(body);

  // Wheel local placements: front/rear × left/right, at the chassis corners,
  // sitting at the chassis bottom (y = -halfHeight).
  const wx = CHASSIS.hw + 0.15;
  const wz = CHASSIS.hl - 0.5;
  const wy = -CHASSIS.hh;
  const wheelOffsets: Array<[number, number, number]> = [
    [-wx, wy, wz],
    [wx, wy, wz],
    [-wx, wy, -wz],
    [wx, wy, -wz],
  ];
  const wheelMat = new StandardMaterial("replayWheelMat", scene);
  wheelMat.diffuseColor = new Color3(0.08, 0.08, 0.09);
  wheelMat.specularColor = new Color3(0.1, 0.1, 0.1);
  wheelOffsets.forEach((off, i) => {
    const w = MeshBuilder.CreateCylinder(
      `replayWheel_${i}`,
      { diameter: WHEEL_RADIUS * 2, height: 0.3, tessellation: 18 },
      scene,
    );
    w.rotation.z = Math.PI / 2;
    w.bakeCurrentTransformIntoVertices();
    w.material = wheelMat;
    w.parent = carRoot;
    w.position.set(off[0], off[1], off[2]);
    shadow.addShadowCaster(w);
  });

  // --- Cameras. Start behind the car (car's local +Z is its FRONT — same as the
  //     drive scene — so "behind" is the -Z-front / +world-Z side at spawn). ---
  const chaseCam = new FollowCamera("replayChase", new Vector3(0, 5, 22), scene);
  chaseCam.lockedTarget = body;
  chaseCam.radius = 12;
  chaseCam.heightOffset = 4;
  chaseCam.rotationOffset = 180;
  chaseCam.cameraAcceleration = 0.08;
  chaseCam.maxCameraSpeed = 40;
  chaseCam.minZ = 0.1;
  chaseCam.maxZ = 2000;

  // Driver camera: parented to the car near the windshield (raised to cabin
  // height, pushed toward the front so only a sliver of hood shows), looking
  // along local +Z (the car's front), so it turns and moves with the transform.
  const driverCam = new UniversalCamera("replayDriver", new Vector3(0, 1.1, 1.7), scene);
  driverCam.parent = carRoot;
  driverCam.rotationQuaternion = Quaternion.Identity();
  driverCam.fov = 0.9;
  driverCam.minZ = 0.1;
  driverCam.maxZ = 2000;

  scene.activeCamera = chaseCam;

  const setViewMode = (mode: ReplayViewMode) => {
    scene.activeCamera = mode === "driver" ? driverCam : chaseCam;
  };

  const setCarTransform = (
    position: [number, number, number],
    rotation: [number, number, number],
  ) => {
    carRoot.position.set(position[0], position[1], position[2]);
    if (!carRoot.rotationQuaternion) carRoot.rotationQuaternion = Quaternion.Identity();
    // Round-trip of the recorded Babylon euler (Quaternion.toEulerAngles order).
    Quaternion.FromEulerAnglesToRef(rotation[0], rotation[1], rotation[2], carRoot.rotationQuaternion);
  };

  const getCarPosition = () => ({
    x: carRoot.position.x,
    y: carRoot.position.y,
    z: carRoot.position.z,
  });

  const dispose = () => {
    world.dispose();
    scene.dispose();
  };

  return { scene, setCarTransform, setViewMode, getCarPosition, dispose };
}
