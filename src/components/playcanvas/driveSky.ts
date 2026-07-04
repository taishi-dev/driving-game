import { Application, Asset, Color, Entity, EnvLighting, Texture } from "playcanvas";
import { SHOWROOM_HDR_URL } from "./showroomScene";

/**
 * Shared outdoor sky/IBL + key light for the drive and replay scenes.
 *
 * P12 dedup: the drive base ({@link buildDriveSceneBase}) and the replay scene
 * ({@link createReplayScene}) previously each carried a byte-identical copy of
 * this block (the P8 review flagged the ~duplication). PlayCanvas'
 * `StandardMaterial` diffuse needs an ambient/IBL source — a flat
 * `scene.ambientLight` alone does not light it — so both scenes prefilter the
 * shipped Poly Haven sky HDR into an environment atlas at RUNTIME (the approach
 * proven in showroomScene.ts) to drive ambient + glossy reflections, plus one
 * directional key light.
 *
 * Strict-mode safe (the hard-won lesson of this branch): the async atlas build
 * is dropped when `isDisposed()`; the `requestAnimationFrame` that kicks off the
 * asset load is cancellable; and {@link DriveSkyHandle.dispose} cancels the
 * pending load, detaches + frees the atlas, unloads/removes the asset, and
 * destroys the sun. Kept in its own module (not exported from driveScene) so the
 * replay chunk does not pull in the vehicle/mirror/controls code.
 */
export interface DriveSkyHandle {
  dispose(): void;
}

export function setupDriveSkyAndSun(
  app: Application,
  isDisposed: () => boolean,
  assetName = "drive-hdr",
): DriveSkyHandle {
  const scene = app.scene;
  scene.exposure = 1.1;
  scene.ambientLight = new Color(0.1, 0.11, 0.13);

  const generated: Texture[] = [];
  const envAsset = new Asset(assetName, "texture", { url: SHOWROOM_HDR_URL });
  envAsset.on("load", () => {
    if (isDisposed()) return;
    const source = envAsset.resource as Texture;
    const lightingSource = EnvLighting.generateLightingSource(source);
    const envAtlas = EnvLighting.generateAtlas(lightingSource);
    lightingSource.destroy();
    generated.push(envAtlas);
    // envAtlas drives ambient + glossy reflections. The visible background stays
    // the camera clear-colour sky (not scene.skybox, which needs a cubemap).
    scene.envAtlas = envAtlas;
    scene.skyboxIntensity = 1.0;
  });
  let envRafId = requestAnimationFrame(() => {
    envRafId = 0;
    if (isDisposed()) return;
    app.assets.add(envAsset);
    app.assets.load(envAsset);
  });

  const sun = new Entity("drive-sun");
  sun.addComponent("light", {
    type: "directional",
    color: new Color(1.0, 0.97, 0.9),
    intensity: 3.5,
    castShadows: false,
  });
  sun.setEulerAngles(60, 20, 0);
  app.root.addChild(sun);

  return {
    dispose() {
      if (envRafId) cancelAnimationFrame(envRafId);
      scene.envAtlas = null;
      for (const tex of generated) tex.destroy();
      envAsset.unload();
      app.assets.remove(envAsset);
      sun.destroy();
    },
  };
}
