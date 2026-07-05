import {
  ADDRESS_CLAMP_TO_EDGE,
  Application,
  ASPECT_AUTO,
  Color,
  CULLFACE_NONE,
  Entity,
  FILTER_LINEAR,
  Layer,
  PIXELFORMAT_RGBA8,
  PROJECTION_ORTHOGRAPHIC,
  RenderTarget,
  StandardMaterial,
  Texture,
  Vec2,
  Vec4,
  LAYERID_SKYBOX,
  LAYERID_WORLD,
} from "playcanvas";
import {
  computeMirrorViewport,
  mirrorCameraLocalOffset,
  MIRROR_ASPECT,
  MIRROR_TOP_MARGIN_FRAC,
  MIRROR_WIDTH_FRAC,
} from "@/lib/pcMirrorLayout";

/**
 * P5b — screen-space rearview mirror.
 *
 * A rear-facing camera parented to the chassis renders the world into a modest
 * 512×256 render target; a dedicated orthographic UI camera then draws a single
 * quad textured with that target into a small framed rectangle at the top-centre
 * of the canvas, HORIZONTALLY FLIPPED (real-mirror semantics). Layer isolation
 * keeps the mirror quad out of the main view AND out of its own reflection: the
 * quad lives on a private `MirrorOverlay` layer that only the UI camera renders,
 * and the rear camera renders only the World + Skybox layers.
 *
 * Because the chassis's local +Z is the car's FRONT and a PlayCanvas camera
 * looks down its own local −Z, the rear camera needs NO extra rotation — parented
 * with identity rotation it already looks out the back (see pcMirrorLayout.ts).
 *
 * The two easy-to-get-wrong numbers (on-screen rect, camera mount) live in the
 * Babylon/PlayCanvas-free, unit-tested `pcMirrorLayout.ts`.
 *
 * `setActive(false)` disables the rear + UI cameras and the quad, so an inactive
 * mirror costs ZERO render (no RT pass, no overlay) — the hook P7's graded
 * checkpoints toggle.
 */

const RTT_WIDTH = 512;
const RTT_HEIGHT = 256;

export interface RearviewMirrorHandle {
  setActive: (active: boolean) => void;
  isActive: () => boolean;
  dispose: () => void;
}

export function setupRearviewMirror(
  app: Application,
  chassis: Entity,
  chassisHalfHeight: number,
  chassisHalfLength: number,
): RearviewMirrorHandle {
  const device = app.graphicsDevice;

  // --- Render target the rear camera draws into ---------------------------
  const colorBuffer = new Texture(device, {
    name: "mirrorRTT",
    width: RTT_WIDTH,
    height: RTT_HEIGHT,
    format: PIXELFORMAT_RGBA8,
    mipmaps: false,
    minFilter: FILTER_LINEAR,
    magFilter: FILTER_LINEAR,
    addressU: ADDRESS_CLAMP_TO_EDGE,
    addressV: ADDRESS_CLAMP_TO_EDGE,
  });
  const renderTarget = new RenderTarget({
    name: "mirrorRT",
    colorBuffer,
    depth: true,
  });

  // --- Private overlay layer (only the UI camera renders it) --------------
  const mirrorLayer = new Layer({ name: "MirrorOverlay" });
  app.scene.layers.push(mirrorLayer);

  // --- Rear-facing camera, parented to the chassis ------------------------
  const rearCam = new Entity("mirror-rear-cam");
  rearCam.addComponent("camera", {
    clearColor: new Color(0.5, 0.62, 0.78),
    fov: 60,
    nearClip: 0.15,
    farClip: 600,
    priority: -1, // render to the RT BEFORE the main camera draws the frame
    // Only the world + sky (NOT the overlay layer, so no self-reflection).
    layers: [LAYERID_WORLD, LAYERID_SKYBOX],
    aspectRatioMode: ASPECT_AUTO, // RT is 512×256 → aspect 2, matches the quad
  });
  rearCam.camera!.renderTarget = renderTarget;
  const mount = mirrorCameraLocalOffset(chassisHalfHeight, chassisHalfLength);
  rearCam.setLocalPosition(mount.x, mount.y, mount.z);
  // identity local rotation: a PlayCanvas camera looks down local −Z, and the
  // chassis's local −Z is the BACK of the car — so this already looks rearward.
  chassis.addChild(rearCam);

  // --- Screen-space quad textured with the RT, horizontally flipped -------
  const mirrorMat = new StandardMaterial();
  mirrorMat.useLighting = false;
  mirrorMat.diffuse = new Color(0, 0, 0);
  mirrorMat.emissive = new Color(1, 1, 1);
  mirrorMat.emissiveMap = colorBuffer;
  // Horizontal flip: mirror an image left↔right (a real mirror). Negative U
  // tiling + a +1 U offset keeps the sampled range inside [0,1].
  mirrorMat.emissiveMapTiling = new Vec2(-1, 1);
  mirrorMat.emissiveMapOffset = new Vec2(1, 0);
  mirrorMat.cull = CULLFACE_NONE; // visible regardless of winding
  mirrorMat.update();

  const quad = new Entity("mirror-quad");
  quad.addComponent("render", { type: "plane" });
  quad.render!.material = mirrorMat;
  quad.render!.layers = [mirrorLayer.id];
  quad.render!.castShadows = false;
  quad.render!.receiveShadows = false;
  // The plane primitive lies in XZ (normal +Y); stand it up in XY (normal +Z,
  // toward the UI camera) via a −90° X rotation. Scaled to MIRROR_ASPECT×1.
  quad.setLocalScale(MIRROR_ASPECT, 1, 1);
  quad.setLocalEulerAngles(-90, 0, 0);
  // Park it far from the world; layer isolation means position is cosmetic, but
  // keeping it clear of the driving area avoids any accidental interaction.
  quad.setLocalPosition(0, 1000, 0);
  app.root.addChild(quad);

  // --- Orthographic UI camera that frames the quad ------------------------
  const uiCam = new Entity("mirror-ui-cam");
  uiCam.addComponent("camera", {
    projection: PROJECTION_ORTHOGRAPHIC,
    orthoHeight: 0.5, // half of the 1-unit-tall quad
    clearColorBuffer: false, // overlay: keep the main frame underneath
    clearDepthBuffer: true,
    nearClip: 0.1,
    farClip: 10,
    priority: 1, // draw last, on top of the main frame
    layers: [mirrorLayer.id],
    aspectRatioMode: ASPECT_AUTO, // aspect from the rect's pixel size == MIRROR_ASPECT
  });
  uiCam.setLocalPosition(0, 1000, 2); // in front of the quad, looking −Z at it
  app.root.addChild(uiCam);

  const applyViewport = () => {
    const canvasAspect = device.width / device.height;
    const r = computeMirrorViewport({
      widthFrac: MIRROR_WIDTH_FRAC,
      topMarginFrac: MIRROR_TOP_MARGIN_FRAC,
      canvasAspect,
      mirrorAspect: MIRROR_ASPECT,
    });
    uiCam.camera!.rect = new Vec4(r.x, r.y, r.width, r.height);
  };
  applyViewport();
  device.on("resizecanvas", applyViewport);

  let active = true;
  const setActive = (value: boolean) => {
    active = value;
    // Disabling the camera entities stops their render passes entirely (RT pass
    // + overlay pass), and hiding the quad is belt-and-braces — zero cost off.
    rearCam.enabled = value;
    uiCam.enabled = value;
    quad.enabled = value;
  };

  return {
    setActive,
    isActive: () => active,
    dispose() {
      device.off("resizecanvas", applyViewport);
      rearCam.destroy();
      uiCam.destroy();
      quad.destroy();
      mirrorMat.destroy();
      const idx = app.scene.layers.layerList.indexOf(mirrorLayer);
      if (idx !== -1) app.scene.layers.remove(mirrorLayer);
      renderTarget.destroy();
      colorBuffer.destroy();
    },
  };
}
