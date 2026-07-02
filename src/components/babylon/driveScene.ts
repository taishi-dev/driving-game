import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { FollowCamera } from "@babylonjs/core/Cameras/followCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShapeBox } from "@babylonjs/core/Physics/v2/physicsShape";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Engine } from "@babylonjs/core/Engines/engine";

// Side-effect: shadow generator scene component (tree-shaken ES6 build).
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
// Side-effect: HDR (.hdr) texture loader for the image-based lighting below.
import "@babylonjs/core/Materials/Textures/Loaders/hdrTextureLoader";
// Side-effect: patches `Scene.prototype.enablePhysics` and registers the
// physics scene component. Without this, `scene.enablePhysics` is undefined and
// PhysicsBody construction throws "No Physics Engine available".
import "@babylonjs/core/Physics/joinedPhysicsEngineComponent";

import { getHavokPlugin } from "./havok";
import {
  RaycastVehicle,
  defaultWheelConfigs,
  VEHICLE_TUNING,
  type VehicleInput,
} from "./raycastVehicle";
import { buildDriveWorld } from "./driveWorld";

/** Chassis half-extents (m): a compact test box car. */
const CHASSIS = { hw: 0.9, hh: 0.4, hl: 2.0 } as const;
const WHEEL_RADIUS = 0.4;

/**
 * B5: off-track detection — car is considered "off track" when more than
 * OFF_TRACK_DIST metres away from the nearest road centreline in the XZ plane.
 * This is a simple radial check; B12 will use the proper course path.
 */
const OFF_TRACK_DIST = 8; // metres from X=0 on the straight

/**
 * Handle returned to the canvas: lets the input layer push controls each frame,
 * and exposes the vehicle for the debug hook / camera.
 */
export interface DriveSceneHandle {
  scene: Scene;
  vehicle: RaycastVehicle;
  setInput: (input: VehicleInput) => void;
  /** Reset the chassis to spawn (used if it ever tips over in testing). */
  reset: () => void;
  /** True when the car is not on any road surface (off-track). */
  isOffTrack: () => boolean;
}

/**
 * B5: Quaternius driveable world on Havok.
 *
 *  - Road tiles loaded from public/models3d/world/quaternius/ via B5 driveWorld.
 *  - Wheel rays hit road tile meshes + a low-Y safety net plane.
 *  - Off-track detection exposed for the UI and test hook.
 *  - Follow camera behind the car.
 *
 * Physics stepped by Havok; vehicle forces applied in beforePhysics observer.
 */
export async function createDriveScene(engine: Engine): Promise<DriveSceneHandle> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.5, 0.62, 0.78, 1); // daylight sky

  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 1.0;

  // --- HDRI environment (image-based lighting), matching the showroom scene. ---
  // Provides the diffuse + specular IBL the Quaternius PBR materials expect, plus
  // a real sky backdrop. prefilterOnLoad builds the roughness-convolved cubemap.
  const hdr = await new Promise<HDRCubeTexture>((resolve, reject) => {
    const tex = new HDRCubeTexture(
      "/env/kloofendal_48d_partly_cloudy_puresky_2k.hdr",
      scene,
      256,
      false, // noMipmap
      true, // generateHarmonics (diffuse IBL)
      false, // gammaSpace — HDR is linear
      true, // prefilterOnLoad — specular IBL
      () => resolve(tex),
      (msg) => reject(new Error(`HDRI load failed: ${msg ?? "unknown"}`)),
    );
    scene.environmentTexture = tex;
  });
  scene.createDefaultSkybox(hdr, true, 2000, 0.2);

  // --- Enable Havok physics (async WASM must be ready first). ---
  const havok = await getHavokPlugin();
  scene.enablePhysics(new Vector3(0, -9.81, 0), havok);

  // --- Lights + shadows ---
  // The HDRI supplies most ambient light now, so the hemispheric fill is gentle;
  // the directional sun stays strong to cast the car's shadow on the road.
  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.25;
  const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, -0.3), scene);
  sun.position = new Vector3(30, 60, 30);
  sun.intensity = 2.0;
  const shadow = new ShadowGenerator(1024, sun);
  shadow.useBlurExponentialShadowMap = true;
  shadow.blurKernel = 16;

  // --- Safety-net ground plane (low Y so it only catches the car if it
  //     completely misses the road surface — e.g. driving off the edge).
  //     Rendered invisible; the Quaternius road tiles provide the visible surface.
  const SAFETY_Y = -0.5; // 0.5 m below road surface
  const SAFETY_SIZE = 500;
  const safetyGround = MeshBuilder.CreateGround(
    "safetyGround",
    { width: SAFETY_SIZE, height: SAFETY_SIZE, subdivisions: 1 },
    scene,
  );
  safetyGround.position.y = SAFETY_Y;
  safetyGround.isVisible = false;
  safetyGround.isPickable = true;

  // Physics collider for safety net.
  const safetyBody = new PhysicsBody(safetyGround, PhysicsMotionType.STATIC, false, scene);
  safetyBody.shape = new PhysicsShapeBox(
    new Vector3(0, -0.25, 0),
    Quaternion.Identity(),
    new Vector3(SAFETY_SIZE, 0.5, SAFETY_SIZE),
    scene,
  );

  // --- Load the Quaternius world ---
  const world = await buildDriveWorld(scene);

  // Ground predicate: wheel rays hit road tiles OR the safety net.
  const isGround = (mesh: AbstractMesh) =>
    mesh.name === "safetyGround" || world.isRoadMesh(mesh);

  // --- Chassis (dynamic box rigid body). ---
  const chassisMesh = MeshBuilder.CreateBox(
    "chassis",
    { width: CHASSIS.hw * 2, height: CHASSIS.hh * 2, depth: CHASSIS.hl * 2 },
    scene,
  );
  // Spawn on the straight at Z=+10 (well within the first straight tile),
  // facing -Z so the car drives DOWN the course (course.ts straight runs
  // +20 → -200) and the follow camera looks along the long road ahead.
  const SPAWN_ROT = Quaternion.RotationAxis(Vector3.Up(), Math.PI);
  chassisMesh.position = new Vector3(0, 1.2, 10);
  chassisMesh.rotationQuaternion = SPAWN_ROT.clone();
  const chassisMat = new PBRMaterial("chassisMat", scene);
  chassisMat.albedoColor = new Color3(0.75, 0.1, 0.12);
  chassisMat.metallic = 0.3;
  chassisMat.roughness = 0.35;
  chassisMesh.material = chassisMat;
  shadow.addShadowCaster(chassisMesh);

  const chassisBody = new PhysicsBody(
    chassisMesh,
    PhysicsMotionType.DYNAMIC,
    false,
    scene,
  );
  chassisBody.shape = new PhysicsShapeBox(
    Vector3.Zero(),
    Quaternion.Identity(),
    new Vector3(CHASSIS.hw * 2, CHASSIS.hh * 2, CHASSIS.hl * 2),
    scene,
  );
  chassisBody.setMassProperties({ mass: VEHICLE_TUNING.chassisMass });
  chassisBody.setLinearDamping(0.1);
  chassisBody.setAngularDamping(0.6);

  // --- Visual wheels (kinematic, positioned by the vehicle each frame). ---
  const wheelConfigs = defaultWheelConfigs(CHASSIS.hw + 0.15, CHASSIS.hl - 0.5, WHEEL_RADIUS);
  const wheelMeshes: TransformNode[] = wheelConfigs.map((_, i) => {
    const w = MeshBuilder.CreateCylinder(
      `wheel_${i}`,
      { diameter: WHEEL_RADIUS * 2, height: 0.3, tessellation: 18 },
      scene,
    );
    w.rotation.z = Math.PI / 2;
    w.bakeCurrentTransformIntoVertices();
    const wm = new StandardMaterial(`wheelMat_${i}`, scene);
    wm.diffuseColor = new Color3(0.08, 0.08, 0.09);
    wm.specularColor = new Color3(0.1, 0.1, 0.1);
    w.material = wm;
    shadow.addShadowCaster(w);
    return w;
  });

  const vehicle = new RaycastVehicle(scene, chassisBody, wheelConfigs, isGround);
  vehicle.attachWheelMeshes(wheelMeshes);

  // Drive the vehicle forces one step BEFORE Havok integrates.
  scene.onBeforePhysicsObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000; // ms -> s
    vehicle.update(Math.min(dt, 1 / 30)); // clamp huge frames (tab refocus)
  });

  // --- Follow camera behind the car. ---
  // Car faces -Z, so "behind" is the +Z side; start the camera there so it does
  // not swing around on the first frames.
  const camera = new FollowCamera("follow", new Vector3(0, 5, 22), scene);
  camera.lockedTarget = chassisMesh;
  camera.radius = 12;
  camera.heightOffset = 4;
  camera.rotationOffset = 180; // behind the car (car faces -Z ⇒ camera on +Z, looks -Z)
  camera.cameraAcceleration = 0.05;
  camera.maxCameraSpeed = 20;
  camera.minZ = 0.1;
  camera.maxZ = 2000;
  scene.activeCamera = camera;

  const spawn = new Vector3(0, 1.2, 10);
  const reset = () => {
    chassisBody.setLinearVelocity(Vector3.Zero());
    chassisBody.setAngularVelocity(Vector3.Zero());
    chassisMesh.position.copyFrom(spawn);
    if (chassisMesh.rotationQuaternion) {
      chassisMesh.rotationQuaternion.copyFrom(SPAWN_ROT);
    }
    chassisBody.disablePreStep = false;
  };

  /**
   * Off-track detection: the car is off the road when its position is
   * more than OFF_TRACK_DIST metres from X=0 in the straight zone,
   * or more than OFF_TRACK_DIST from Z=-38 in the turn zone.
   */
  const isOffTrack = (): boolean => {
    const pos = vehicle.getChassisPosition();
    // In the straight zone (Z > -30) check X distance from road centreline.
    if (pos.z > -30) {
      return Math.abs(pos.x) > OFF_TRACK_DIST;
    }
    // In the turn zone check combined XZ distance from nearest road axis.
    const distFromStraight = Math.abs(pos.x);
    const distFromLeftTurn = Math.sqrt((pos.x + 34) ** 2 + (pos.z + 38) ** 2);
    const distFromRightTurn = Math.sqrt((pos.x - 34) ** 2 + (pos.z + 38) ** 2);
    return Math.min(distFromStraight, distFromLeftTurn, distFromRightTurn) > OFF_TRACK_DIST;
  };

  return {
    scene,
    vehicle,
    setInput: (input) => vehicle.setInput(input),
    reset,
    isOffTrack,
  };
}
