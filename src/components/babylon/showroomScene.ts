import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Engine } from "@babylonjs/core/Engines/engine";

// Side-effect registrations required for ES6 tree-shaken imports:
// shadow generation shader support, and material dirty-tracking used by PBR.
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Materials/Textures/Loaders/hdrTextureLoader";

/**
 * B2: HDRI image-based lighting + ACES tone mapping + sRGB output, a self-built
 * showroom (ground + curved backdrop) with soft shadows, and a STATIC hero
 * camera (no auto-rotation, no attached inputs).
 *
 * B3 loads the hero car; this function is the single scene builder.
 */
export async function createShowroomScene(engine: Engine): Promise<Scene> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.055, 0.06, 0.07, 1);

  // --- Tone mapping + color management ---------------------------------------
  // ACES filmic tone mapping; Babylon PBR writes sRGB to the framebuffer by
  // default (imageProcessing.applyByPostProcess handles the transfer), matching
  // the showroom technique stack (PBR + clearcoat + HDR IBL + ACES).
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 1.0;

  // --- HDRI environment (image-based lighting) -------------------------------
  // prefilterOnLoad=true builds the roughness-convolved cubemap PBR needs for
  // glossy reflections. 256 is a good showroom/perf balance on the iGPU target.
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
  // Show the sky as the backdrop and give it a subtle blur so the built
  // showroom reads as the hero surface, not the sky.
  scene.createDefaultSkybox(hdr, true, 1000, 0.35);

  // --- Key light + soft shadows ----------------------------------------------
  const keyLight = new DirectionalLight(
    "key",
    new Vector3(-0.55, -1, -0.4),
    scene,
  );
  keyLight.position = new Vector3(6, 12, 6);
  keyLight.intensity = 2.2;

  const shadow = new ShadowGenerator(2048, keyLight);
  shadow.useBlurExponentialShadowMap = true; // soft (VSM-style) shadows
  shadow.blurKernel = 32;
  shadow.darkness = 0.35;

  // --- Self-built showroom: ground + curved backdrop -------------------------
  const ground = MeshBuilder.CreateGround(
    "ground",
    { width: 60, height: 60 },
    scene,
  );
  const groundMat = new PBRMaterial("groundMat", scene);
  groundMat.albedoColor = new Color3(0.12, 0.13, 0.15);
  groundMat.metallic = 0.0;
  groundMat.roughness = 0.35; // faint studio-floor sheen
  groundMat.environmentIntensity = 0.6;
  ground.material = groundMat;
  ground.receiveShadows = true;

  // Curved backdrop cyclorama: a large half-cylinder shell behind the hero,
  // open toward the camera, so there is no visible seam between floor and wall.
  const backdrop = MeshBuilder.CreateCylinder(
    "backdrop",
    {
      height: 30,
      diameter: 70,
      tessellation: 96,
      arc: 0.5, // half cylinder
      sideOrientation: Mesh.BACKSIDE, // render the interior of the shell
    },
    scene,
  );
  backdrop.position.y = 15;
  backdrop.rotation.y = -Math.PI * 0.5; // open side faces the camera
  const backdropMat = new PBRMaterial("backdropMat", scene);
  backdropMat.albedoColor = new Color3(0.16, 0.17, 0.19);
  backdropMat.metallic = 0.0;
  backdropMat.roughness = 0.85;
  backdropMat.environmentIntensity = 0.5;
  backdropMat.backFaceCulling = false; // see the interior of the shell
  backdrop.material = backdropMat;
  backdrop.receiveShadows = true;

  // --- Static hero camera (no auto-rotation, inputs NOT attached) ------------
  const camera = new ArcRotateCamera(
    "hero",
    Math.PI * 0.62,
    Math.PI * 0.46,
    9.5,
    new Vector3(0, 0.6, 0),
    scene,
  );
  camera.fov = 0.6;
  camera.minZ = 0.1;
  camera.maxZ = 2000;
  scene.activeCamera = camera;

  return scene;
}
