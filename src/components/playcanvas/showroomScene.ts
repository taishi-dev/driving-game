import {
  Application,
  Asset,
  Color,
  Entity,
  EnvLighting,
  StandardMaterial,
  Texture,
  BLEND_NONE,
  CULLFACE_FRONT,
  SHADOW_PCF5,
  TONEMAP_ACES,
} from "playcanvas";
import { loadHeroCar, type HeroCarHandle } from "./heroCar";

/**
 * A scene built onto an existing {@link Application}. The canvas component owns
 * the Application lifecycle (device, resize, render loop, destroy); a scene
 * builder owns only the entities/materials/textures IT creates and releases
 * them in {@link dispose}. Keeping this split honours the P1 review note ("don't
 * grow the canvas component") and keeps strict-mode double-mount safe: the
 * builder is handed an `isDisposed()` probe so async asset callbacks that land
 * after an unmount become no-ops.
 */
export interface SceneHandle {
  dispose(): void;
}

/** Path to the shipped Poly Haven CC0 2k equirect HDR (see assets/CREDITS.md). */
export const SHOWROOM_HDR_URL =
  "/env/kloofendal_48d_partly_cloudy_puresky_2k.hdr";

/**
 * P2 showroom environment: HDRI image-based lighting + tone mapping, a
 * self-built studio (ground + curved backdrop dome), a key/fill light rig with
 * a soft shadow, and a STATIC rear-3/4 hero camera (no auto-rotation).
 *
 * IBL approach (research FLAG [C-ibl] resolution): the 2026-06-30 research
 * concluded PlayCanvas has "no runtime prefilter API found" and prefiltering
 * must be done offline. That FLAG is OUTDATED for playcanvas@2.20.5: the engine
 * ships the {@link EnvLighting} helpers (`generateLightingSource` +
 * `generateAtlas`) which prefilter an equirect HDR into an environment atlas at
 * runtime, and an `HdrParser` that decodes Radiance `.hdr` natively. So we ship
 * the plain 2k `.hdr` (no offline cubemap artifact) and prefilter on load.
 *
 * P3 layers the hero car on top of this same scene.
 */
export function createShowroomScene(
  app: Application,
  isDisposed: () => boolean,
): SceneHandle {
  const scene = app.scene;

  // --- Global scene tuning -------------------------------------------------
  // Exposure/ambient tuned to E1's dark-showroom look: a mostly dark studio
  // where the HDRI reads through reflections rather than as a bright sky.
  scene.exposure = 0.9;
  scene.skyboxIntensity = 1.0;
  // Small ambient fallback so nothing is pure black before the atlas resolves.
  scene.ambientLight = new Color(0.02, 0.022, 0.026);

  // --- Camera (static hero shot) ------------------------------------------
  const camera = new Entity("hero-camera");
  camera.addComponent("camera", {
    // Dark studio clear colour (matches the P1 scaffold / E1 studio dark). The
    // enclosing dome covers the frame, so this only shows through any gap.
    clearColor: new Color(0.02, 0.023, 0.028),
    fov: 28, // mild telephoto -> hero-shot compression, low perspective distortion
    nearClip: 0.1,
    farClip: 500,
    // ACES tone mapping (checklist 1.2). gammaCorrection defaults to GAMMA_SRGB
    // on the camera in 2.x (checklist 1.3 sRGB output) so we leave it.
    toneMapping: TONEMAP_ACES,
  });
  // Rear-3/4 view: car faces -Z (forward, per the coordinate contract), so the
  // camera sits behind (+Z) and to the +X side, elevated and looking DOWN at
  // the car (mirrors the E1 reference hero shot: rear-3/4, seen from slightly
  // above). Distance + fov are tuned so the car fills the mid-frame at a
  // moderate size; the lookAt target is aimed low (near the wheel/rocker
  // line, well below the car's visual centre) so the car's body renders
  // above screen-centre with a modest floor strip below it and the backdrop
  // filling the rest of the frame above the roofline, instead of the floor
  // dominating. Tuned empirically against a same-viewport headed screenshot;
  // re-check with a screenshot if any of these change.
  camera.setPosition(8.9, 4.0, 12.07);
  app.root.addChild(camera);
  camera.lookAt(0, 0.35, 0);
  // Enable the scene-colour grab pass so the car's glass (KHR_materials_
  // transmission -> useDynamicRefraction) can refract what's behind it.
  camera.camera!.requestSceneColorMap(true);

  // --- Lighting rig --------------------------------------------------------
  // Key light: warm, from front-upper-left, casting the soft grounding shadow.
  const key = new Entity("key-light");
  key.addComponent("light", {
    type: "directional",
    color: new Color(1.0, 0.96, 0.9),
    intensity: 2.4,
    castShadows: true,
    shadowType: SHADOW_PCF5, // 5-tap PCF -> visibly soft edges (checklist 1.4)
    shadowResolution: 2048,
    shadowDistance: 40,
    shadowBias: 0.04,
    normalOffsetBias: 0.05,
    shadowIntensity: 0.75,
  });
  key.setEulerAngles(52, 36, 0);
  app.root.addChild(key);

  // Fill light: cool, opposite side, no shadow — lifts the shadow side.
  const fill = new Entity("fill-light");
  fill.addComponent("light", {
    type: "directional",
    color: new Color(0.8, 0.86, 1.0),
    intensity: 0.7,
    castShadows: false,
  });
  fill.setEulerAngles(34, -140, 0);
  app.root.addChild(fill);

  // --- Studio geometry -----------------------------------------------------
  // Ground: large matte-glossy dark disc that receives the shadow and picks up
  // a faint IBL sheen.
  const groundMat = new StandardMaterial();
  groundMat.useMetalness = true;
  // Near-black, low gloss: dark enough to merge with the backdrop dome (no hard
  // horizon band) yet with just enough sheen to read as a polished studio floor
  // and catch the key light's soft grounding shadow.
  groundMat.diffuse = new Color(0.015, 0.015, 0.018);
  groundMat.metalness = 0.0;
  groundMat.gloss = 0.5;
  groundMat.blendType = BLEND_NONE;
  groundMat.update();

  const ground = new Entity("ground");
  ground.addComponent("render", { type: "plane" });
  ground.render!.material = groundMat;
  ground.render!.castShadows = false;
  ground.render!.receiveShadows = true;
  ground.setLocalScale(200, 1, 200);
  app.root.addChild(ground);

  // Curved backdrop: a large sphere rendered from the inside (front-face
  // culled) gives a seamless "infinity cove" curve behind the car. Emissive-
  // driven dark grey so it stays a controlled studio tone regardless of the
  // HDRI ambient (a plain lit surface would tint blue from the sky atlas).
  const domeMat = new StandardMaterial();
  domeMat.diffuse = new Color(0, 0, 0);
  domeMat.emissive = new Color(0.03, 0.032, 0.038);
  domeMat.useLighting = false; // flat backdrop tone, not lit by the rig
  domeMat.cull = CULLFACE_FRONT; // view from inside the sphere
  domeMat.update();

  const dome = new Entity("backdrop-dome");
  dome.addComponent("render", { type: "sphere" });
  dome.render!.material = domeMat;
  dome.render!.castShadows = false;
  dome.render!.receiveShadows = false;
  dome.setLocalScale(140, 140, 140);
  dome.setPosition(0, 0, 0);
  app.root.addChild(dome);

  // --- HDRI image-based lighting (runtime prefilter) -----------------------
  const generated: Texture[] = [];
  const envAsset = new Asset("showroom-hdr", "texture", {
    url: SHOWROOM_HDR_URL,
  });
  envAsset.on("load", () => {
    if (isDisposed()) return;
    const source = envAsset.resource as Texture;
    // Prefilter: equirect -> lighting-source cubemap -> prefiltered atlas.
    const lightingSource = EnvLighting.generateLightingSource(source);
    const envAtlas = EnvLighting.generateAtlas(lightingSource);
    lightingSource.destroy(); // intermediate; the atlas is what the scene uses
    generated.push(envAtlas);
    // envAtlas drives BOTH ambient and glossy reflections. We intentionally do
    // NOT set scene.skybox: the visible background stays the dark studio dome,
    // while the car body still reflects the HDRI (checklist 1.1).
    scene.envAtlas = envAtlas;
  });
  // Defer one frame for the same reason heroCar.ts defers its container load:
  // under React strict-mode's dev double-mount, the throwaway first
  // Application is created and destroyed synchronously before any rAF fires,
  // so deferring means that dead app never starts parsing the HDR (the
  // texture parser touches the graphics device regardless of our own "load"
  // handler, so a mid-parse destroy would hit a torn-down device). The live
  // mount's rAF runs normally.
  let envRafId = requestAnimationFrame(() => {
    envRafId = 0;
    if (isDisposed()) return;
    app.assets.add(envAsset);
    app.assets.load(envAsset);
  });

  // --- Hero car (P3) -------------------------------------------------------
  const heroCar: HeroCarHandle = loadHeroCar(app, isDisposed);

  return {
    dispose() {
      if (envRafId) cancelAnimationFrame(envRafId);
      heroCar.dispose();
      scene.envAtlas = null;
      camera.destroy();
      key.destroy();
      fill.destroy();
      ground.destroy();
      dome.destroy();
      groundMat.destroy();
      domeMat.destroy();
      for (const tex of generated) tex.destroy();
      // asset.unload() releases the source HDR texture; remove it from the
      // registry too. (Don't also destroy the resource manually — that would
      // double-free.)
      envAsset.unload();
      app.assets.remove(envAsset);
    },
  };
}
