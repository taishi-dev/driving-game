import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { FollowCamera } from "@babylonjs/core/Cameras/followCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
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

/** Chassis half-extents (m): a compact test box car. */
const CHASSIS = { hw: 0.9, hh: 0.4, hl: 2.0 } as const;
const WHEEL_RADIUS = 0.4;
const GROUND_SIZE = 400;

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
}

/**
 * B4: a temporary drivable test scene.
 *
 *  - A large flat ground plane with a STATIC box physics collider (the real
 *    Quaternius world is B5; this is only a surface to drive on).
 *  - A dynamic box chassis (proxy for the hero car) as a Havok rigid body.
 *  - A hand-built raycast vehicle (see raycastVehicle.ts) driving that chassis.
 *  - A follow camera behind the car.
 *
 * Physics is stepped by Havok on the scene's own loop; the vehicle applies its
 * per-wheel forces in a `beforePhysics` observer so they land in the same step.
 */
export async function createDriveScene(engine: Engine): Promise<DriveSceneHandle> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.5, 0.62, 0.78, 1); // daylight sky

  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_ACES;

  // --- Enable Havok physics (async WASM must be ready first). ---
  const havok = await getHavokPlugin();
  scene.enablePhysics(new Vector3(0, -9.81, 0), havok);

  // --- Lights + shadows ---
  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.6;
  const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, -0.3), scene);
  sun.position = new Vector3(30, 60, 30);
  sun.intensity = 2.0;
  const shadow = new ShadowGenerator(1024, sun);
  shadow.useBlurExponentialShadowMap = true;
  shadow.blurKernel = 16;

  // --- Ground plane + static collider ---
  const ground = MeshBuilder.CreateGround(
    "ground",
    { width: GROUND_SIZE, height: GROUND_SIZE, subdivisions: 2 },
    scene,
  );
  const groundMat = new StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new Color3(0.28, 0.32, 0.28);
  groundMat.specularColor = new Color3(0.05, 0.05, 0.05);
  ground.material = groundMat;
  ground.receiveShadows = true;

  // A thin static box collider under the ground surface. We use a box (not a
  // mesh shape) because the vehicle probes the ground with visual-mesh raycasts;
  // the physics collider only needs to stop the chassis if it ever bottoms out.
  const groundBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
  groundBody.shape = new PhysicsShapeBox(
    new Vector3(0, -0.5, 0),
    Quaternion.Identity(),
    new Vector3(GROUND_SIZE, 1, GROUND_SIZE),
    scene,
  );

  // Grid markers so motion is visible (headless + human): stripes every 20 m.
  for (let i = -GROUND_SIZE / 2 + 20; i < GROUND_SIZE / 2; i += 20) {
    const line = MeshBuilder.CreateBox(
      `mark_${i}`,
      { width: GROUND_SIZE, height: 0.02, depth: 0.3 },
      scene,
    );
    line.position = new Vector3(0, 0.02, i);
    const m = new StandardMaterial(`markMat_${i}`, scene);
    m.diffuseColor = new Color3(0.9, 0.9, 0.85);
    m.specularColor = Color3.Black();
    line.material = m;
    line.receiveShadows = true;
  }

  // --- Chassis (dynamic box rigid body). ---
  const chassisMesh = MeshBuilder.CreateBox(
    "chassis",
    { width: CHASSIS.hw * 2, height: CHASSIS.hh * 2, depth: CHASSIS.hl * 2 },
    scene,
  );
  chassisMesh.position = new Vector3(0, 1.2, 0);
  chassisMesh.rotationQuaternion = Quaternion.Identity();
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
  // Light damping so residual jitter dies down; the vehicle model supplies the
  // real forces. Angular damping keeps the box from spinning up freely.
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
    // Cylinder axis is Y; rotate so it lies along X (the axle) — parent handles world.
    w.rotation.z = Math.PI / 2;
    w.bakeCurrentTransformIntoVertices();
    const wm = new StandardMaterial(`wheelMat_${i}`, scene);
    wm.diffuseColor = new Color3(0.08, 0.08, 0.09);
    wm.specularColor = new Color3(0.1, 0.1, 0.1);
    w.material = wm;
    shadow.addShadowCaster(w);
    return w;
  });

  // Ground predicate: the wheel rays should only hit the ground surface + marks,
  // never the chassis or wheels themselves.
  const groundNames = new Set<string>(["ground"]);
  const isGround = (mesh: AbstractMesh) =>
    groundNames.has(mesh.name) || mesh.name.startsWith("mark_");

  const vehicle = new RaycastVehicle(scene, chassisBody, wheelConfigs, isGround);
  vehicle.attachWheelMeshes(wheelMeshes);

  // Drive the vehicle forces one step BEFORE Havok integrates.
  scene.onBeforePhysicsObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000; // ms -> s
    vehicle.update(Math.min(dt, 1 / 30)); // clamp huge frames (tab refocus)
  });

  // --- Follow camera behind the car. ---
  const camera = new FollowCamera("follow", new Vector3(0, 5, -12), scene);
  camera.lockedTarget = chassisMesh;
  camera.radius = 12;
  camera.heightOffset = 4;
  camera.rotationOffset = 180; // behind the car (car faces +Z, cam looks +Z)
  camera.cameraAcceleration = 0.05;
  camera.maxCameraSpeed = 20;
  camera.minZ = 0.1;
  camera.maxZ = 2000;
  scene.activeCamera = camera;

  const spawn = new Vector3(0, 1.2, 0);
  const reset = () => {
    chassisBody.setLinearVelocity(Vector3.Zero());
    chassisBody.setAngularVelocity(Vector3.Zero());
    chassisMesh.position.copyFrom(spawn);
    if (chassisMesh.rotationQuaternion) {
      chassisMesh.rotationQuaternion.copyFrom(Quaternion.Identity());
    }
    chassisBody.disablePreStep = false;
  };

  return {
    scene,
    vehicle,
    setInput: (input) => vehicle.setInput(input),
    reset,
  };
}
