import {
  ADDRESS_CLAMP_TO_EDGE,
  Application,
  Asset,
  Color,
  Entity,
  EnvLighting,
  PIXELFORMAT_RGBA8,
  StandardMaterial,
  Texture,
  BLEND_MULTIPLICATIVE,
  BLEND_NONE,
  CULLFACE_FRONT,
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
 * a baked contact-shadow decal grounding the car (see the key-light comment
 * below for why it's a decal and not a live shadow map), and a STATIC
 * front-3/4 hero camera (no auto-rotation).
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
  // skyboxIntensity also scales the envAtlas contribution the car's clearcoat
  // paint reflects (see processEnvironment() in the lit shader chunk) -- it's
  // not only the (unused, dome-covered) visible sky mesh -- so bumping it is
  // what makes the paint's specular highlights pop instead of reading flat.
  scene.exposure = 1.15;
  scene.skyboxIntensity = 0.55;
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
  // Front-3/4 view (user request 2026-07-05: Select Course must show the car's
  // FRONT): car faces -Z (forward, per the coordinate contract), so the camera
  // sits in front (-Z) and to the +X side, elevated and looking DOWN at the
  // car. Distance + fov are tuned so the car fills the mid-frame at a
  // moderate size; the lookAt target is aimed low (near the wheel/rocker
  // line, well below the car's visual centre) so the car's body renders
  // above screen-centre with a modest floor strip below it and the backdrop
  // filling the rest of the frame above the roofline, instead of the floor
  // dominating. Tuned empirically against a same-viewport headed screenshot;
  // re-check with a screenshot if any of these change.
  camera.setPosition(4.59, 2.24, -6.22);
  app.root.addChild(camera);
  camera.lookAt(0, 0.35, 0);
  // Enable the scene-colour grab pass so the car's glass (KHR_materials_
  // transmission -> useDynamicRefraction) can refract what's behind it.
  camera.camera!.requestSceneColorMap(true);

  // --- Lighting rig --------------------------------------------------------
  // Key light: warm, from front-upper-left.
  //
  // Grounding shadow [round-2 fix]: a real-time directional shadow
  // (castShadows/shadowType/shadowResolution/shadowBias/etc., PCF5, 2048)
  // was fully wired up here and on the car's render components -- and
  // verified via `dracoInitialize`-style debug instrumentation that every
  // piece of state PlayCanvas exposes was correct (light.castShadows=true,
  // shadowType=SHADOW_PCF5, the light's internal shadow map allocated,
  // shadowUpdateMode=REALTIME, visibleThisFrame=true, the ground and car
  // render components both castShadows/receiveShadows=true, ~24 mesh
  // instances registered in the World layer's shadowCasters list). Despite
  // all of that being correct, NOTHING ever appeared in the render: not just
  // "too subtle against the IBL floor" -- a plain white unlit test box with
  // an all-matte, unreflective ground (diffuse 0.5, gloss/reflectivity 0)
  // still showed zero darkening directly under it. That isolates it to a
  // playcanvas@2.20.5 engine-level shadow-rendering bug (or a WebGL2/driver
  // interaction on this box's GPU) unrelated to our scene tuning, IBL, or
  // the glTF-imported car mesh. Rather than ship dead shadow-casting state
  // that costs a 2048x2048 shadow-map render pass every frame for zero
  // visual effect, shadow casting is left OFF here and a soft baked contact-
  // shadow decal (see `contactShadow` below) stands in for it -- the
  // fallback the task explicitly sanctions after an honest attempt.
  const key = new Entity("key-light");
  key.addComponent("light", {
    type: "directional",
    color: new Color(1.0, 0.88, 0.72),
    intensity: 3.2,
    castShadows: false,
  });
  key.setEulerAngles(52, 36, 0);
  app.root.addChild(key);

  // Fill light: cool, opposite side, no shadow — lifts the shadow side.
  const fill = new Entity("fill-light");
  fill.addComponent("light", {
    type: "directional",
    color: new Color(0.8, 0.86, 1.0),
    intensity: 0.35,
    castShadows: false,
  });
  fill.setEulerAngles(34, -140, 0);
  app.root.addChild(fill);

  // --- Studio geometry -----------------------------------------------------
  // Ground: large matte-glossy dark disc that picks up a faint IBL sheen.
  const groundMat = new StandardMaterial();
  groundMat.useMetalness = true;
  groundMat.diffuse = new Color(0.075, 0.077, 0.086);
  groundMat.metalness = 0.0;
  groundMat.gloss = 0.55;
  groundMat.reflectivity = 0.5;
  groundMat.blendType = BLEND_NONE;
  groundMat.update();

  const ground = new Entity("ground");
  ground.addComponent("render", { type: "plane" });
  ground.render!.material = groundMat;
  ground.render!.castShadows = false;
  ground.render!.receiveShadows = true;
  ground.setLocalScale(200, 1, 200);
  app.root.addChild(ground);

  // Contact-shadow decal: a soft radial-gradient quad laid flat just above
  // the floor under the car (see the key-light comment above for why this
  // stands in for a real-time shadow). Baked at runtime via Canvas2D --
  // cheap, resolution-independent, and needs no shipped asset.
  //
  // [round-2 fix] this was built as a black/transparent texture sampled via
  // `material.opacityMap` with `BLEND_NORMAL`. The canvas itself was verified
  // pixel-correct (read back with `getImageData` and separately displayed in
  // the DOM), but PlayCanvas 2.20.5 rendered the resulting mesh as *fully
  // invisible* the instant the map had any spatial variation -- a perfectly
  // uniform opacityMap (any constant alpha, incl. partial) rendered fine, but
  // the moment the same texture varied per-pixel (this radial gradient, on
  // ANY channel, even fully-opaque RGB read via a non-alpha channel) it
  // vanished completely, even at scales many times the car's footprint where
  // occlusion couldn't explain it. That isolates it to another
  // playcanvas@2.20.5 opacityMap-specific bug, independent from the
  // real-time shadow-casting bug documented on the key light below.
  // Swapping the SAME texture onto `emissiveMap` displayed it correctly, so
  // the decal now goes through `emissiveMap` + `BLEND_MULTIPLICATIVE`
  // instead: white texels leave the floor untouched (multiply by 1) and dark
  // texels darken it, which is exactly a soft contact shadow without ever
  // touching the broken opacityMap path.
  const shadowTexSize = 256;
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowTexSize;
  shadowCanvas.height = shadowTexSize;
  const shadowCtx = shadowCanvas.getContext("2d")!;
  const c = shadowTexSize / 2;
  const gradient = shadowCtx.createRadialGradient(c, c, 0, c, c, c);
  gradient.addColorStop(0, "rgb(60,60,60)");
  gradient.addColorStop(0.55, "rgb(150,150,150)");
  gradient.addColorStop(1, "rgb(255,255,255)");
  shadowCtx.fillStyle = gradient;
  shadowCtx.fillRect(0, 0, shadowTexSize, shadowTexSize);

  const contactShadowTex = new Texture(app.graphicsDevice, {
    width: shadowTexSize,
    height: shadowTexSize,
    format: PIXELFORMAT_RGBA8,
    addressU: ADDRESS_CLAMP_TO_EDGE,
    addressV: ADDRESS_CLAMP_TO_EDGE,
    mipmaps: true,
  });
  contactShadowTex.setSource(shadowCanvas);

  const contactShadowMat = new StandardMaterial();
  contactShadowMat.useLighting = false; // flat decal, not re-lit by the rig
  contactShadowMat.diffuse = new Color(0, 0, 0);
  contactShadowMat.emissive = new Color(1, 1, 1);
  contactShadowMat.emissiveMap = contactShadowTex;
  contactShadowMat.opacity = 1;
  contactShadowMat.blendType = BLEND_MULTIPLICATIVE;
  contactShadowMat.depthWrite = false;
  contactShadowMat.update();

  const contactShadow = new Entity("contact-shadow");
  contactShadow.addComponent("render", { type: "plane" });
  contactShadow.render!.material = contactShadowMat;
  contactShadow.render!.castShadows = false;
  contactShadow.render!.receiveShadows = false;
  // Elongated along Z (the car's length, per the -Z forward contract) and
  // narrower along X (the car's width); the car is seated centred at the
  // origin (see heroCar.ts), so no need to wait for it to load.
  //
  // [round-2 fix] TWO bugs compounded to make this decal invisible:
  //  1. `setPosition(0, 0.5, 0)` -- half a metre ABOVE the floor, i.e.
  //     floating up inside the car's cabin/greenhouse rather than lying on
  //     the ground plane (y=0).
  //  2. `setLocalScale(1.35, 1, 2.3)` -- the body's own world-space AABB
  //     (logged via a debug probe) is ~2.34m wide x ~4.36m long, so a
  //     1.35 x 2.3 quad is SMALLER than the car's footprint on both axes.
  //     Even fixing bug 1, a shadow strictly smaller than the silhouette
  //     that casts it is entirely hidden behind the opaque body from any
  //     3/4-elevated angle -- it never has anywhere to "peek out". A contact
  //     shadow needs to be a little BIGGER than the footprint so the soft
  //     radial falloff is visible pooling past the car's edges (as in the
  //     E1 reference). Sized here at a comfortable margin over the measured
  //     footprint, with the gradient (above) already fully transparent at
  //     the rim so the extra size reads as a soft fade, not a hard edge.
  // The floor offset is a hair above y=0 (not exactly 0) purely to avoid
  // z-fighting with the ground plane.
  contactShadow.setLocalScale(3.0, 1, 5.0);
  contactShadow.setPosition(0, 0.015, 0);
  app.root.addChild(contactShadow);

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
  // [hardening] loadHeroCar's `paint` param is left undefined here, so it
  // falls back to the metalness/gloss/clearCoat values baked into
  // heroCar.ts's defaults. Those defaults were tuned by eye specifically
  // against THIS scene's lighting rig (skyboxIntensity=0.55 and
  // exposure=1.15 above, plus the key/fill balance below) — this loader is
  // also reused by the P4+ drive scenes, which run under different lighting,
  // so re-validate (and pass an explicit `paint` override if needed) before
  // assuming these same defaults look right there. [P4+ note]
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
      contactShadow.destroy();
      dome.destroy();
      groundMat.destroy();
      contactShadowMat.destroy();
      contactShadowTex.destroy();
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
