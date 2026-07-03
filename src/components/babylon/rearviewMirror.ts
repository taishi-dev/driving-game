/**
 * B5b — screen-space rearview mirror.
 *
 * A rear-facing camera parented to the car's chassis renders into a small
 * RenderTargetTexture; that RTT is displayed at the top-center of the canvas
 * via Babylon's multi-camera viewport compositing (`scene.activeCameras` with
 * per-camera `viewport` + `layerMask`) — a lone orthographic "UI" camera
 * looks at a single unlit plane textured with the RTT. This needs nothing
 * beyond @babylonjs/core (no @babylonjs/gui dependency, no CPU pixel
 * readback): the plane is excluded from the main follow camera and from the
 * rear camera's own render (no feedback loop) purely via layerMask, so it
 * never appears "in the world".
 *
 * The two pieces of non-trivial math (the on-screen viewport rectangle, and
 * the rear camera's mount point relative to the chassis) live in the
 * Babylon-free, unit-tested `src/lib/mirrorLayout.ts`.
 */

import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Engine } from "@babylonjs/core/Engines/engine";

import { computeMirrorViewport, mirrorCameraLocalOffset } from "../../lib/mirrorLayout";

/** RTT resolution: modest, per B12's per-frame cost budget. 2:1, like a real mirror. */
const MIRROR_RTT_WIDTH = 512;
const MIRROR_RTT_HEIGHT = 256;
const MIRROR_ASPECT = MIRROR_RTT_WIDTH / MIRROR_RTT_HEIGHT;

/** On-screen size/placement: top-center, ~a quarter of the canvas wide. */
const MIRROR_WIDTH_FRAC = 0.26;
const MIRROR_TOP_MARGIN_FRAC = 0.02;

/**
 * Layer bit reserved for the mirror's overlay plane. Every other camera in
 * the scene (main follow camera, the mirror's own rear camera) keeps
 * Babylon's default layerMask (0x0FFFFFFF, bits 0-27) and so never renders
 * it — it only exists for the dedicated ui camera below, which uses this bit
 * exclusively. This is what keeps the mirror plane out of its own reflection.
 */
const MIRROR_UI_LAYER = 0x10000000;

export interface RearviewMirrorHandle {
  /** Toggle whether the mirror renders — hook for B7's graded checkpoints. */
  setActive: (active: boolean) => void;
  isActive: () => boolean;
  dispose: () => void;
}

/**
 * Build the rearview mirror and wire it into `scene.activeCameras` alongside
 * the existing main camera. Safe to call once per scene, after the main
 * camera and chassis mesh both exist.
 */
export function setupRearviewMirror(
  scene: Scene,
  engine: Engine,
  chassis: TransformNode,
  chassisHalfHeight: number,
  chassisHalfLength: number,
  mainCamera: Camera,
): RearviewMirrorHandle {
  // --- Rear-facing camera, parented to the chassis so it turns with the car. ---
  const rearCam = new UniversalCamera("mirrorRearCam", Vector3.Zero(), scene);
  rearCam.parent = chassis;
  const mount = mirrorCameraLocalOffset(chassisHalfHeight, chassisHalfLength);
  rearCam.position.set(mount.x, mount.y, mount.z);
  // Chassis local forward is Vector3.Forward() == (0,0,1) (see raycastVehicle.ts,
  // which computes the drive direction the same way). A camera with identity
  // local rotation would therefore look the same way the car is driving; a
  // 180 degree turn about local Y makes it look backward instead.
  rearCam.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI);
  rearCam.fov = 0.7;
  rearCam.minZ = 0.2;
  rearCam.maxZ = 500;

  // --- Render target the rear camera draws the world (+ car) into. ---
  const mirrorRTT = new RenderTargetTexture(
    "mirrorRTT",
    { width: MIRROR_RTT_WIDTH, height: MIRROR_RTT_HEIGHT },
    scene,
    { generateMipMaps: false },
  );
  mirrorRTT.activeCamera = rearCam;
  // `scene.meshes` (NOT null/omitted): a RenderTargetTexture with no explicit
  // renderList falls back to `scene.getActiveMeshes()`, which is the frustum
  // culling result for the MAIN camera's view this frame, not rearCam's — the
  // world behind the car (which rearCam looks at but the forward-facing main
  // camera does not) would be silently missing from the mirror. Passing the
  // live `scene.meshes` array renders the whole scene (world + car) — "not
  // UI" — and stays current as meshes are added/removed since it's the same
  // array reference, not a snapshot.
  mirrorRTT.renderList = scene.meshes;
  // A custom renderList skips per-mesh layerMask filtering unless forced —
  // force it so the UI-only mirror plane (see MIRROR_UI_LAYER below) stays
  // excluded from its own reflection.
  mirrorRTT.forceLayerMaskCheck = true;

  // --- Unlit material showing the RTT, horizontally flipped: a real mirror
  //     shows a left-right-flipped view of what is behind. ---
  mirrorRTT.uScale = -1;
  mirrorRTT.uOffset = 1; // keep the flipped UV range inside [0,1]
  const mirrorMat = new StandardMaterial("mirrorMat", scene);
  mirrorMat.emissiveTexture = mirrorRTT;
  mirrorMat.diffuseColor.set(0, 0, 0);
  mirrorMat.specularColor.set(0, 0, 0);
  mirrorMat.disableLighting = true;
  mirrorMat.backFaceCulling = false;

  // --- Screen-space plane, visible only to the ui camera below. ---
  const plane = MeshBuilder.CreatePlane(
    "mirrorPlane",
    { width: MIRROR_ASPECT, height: 1 },
    scene,
  );
  plane.material = mirrorMat;
  plane.layerMask = MIRROR_UI_LAYER;
  plane.isPickable = false;
  plane.position.set(0, 0, 0);

  // --- Static orthographic camera framing the plane exactly (no letterboxing). ---
  const uiCam = new UniversalCamera("mirrorUiCam", new Vector3(0, 0, -2), scene);
  uiCam.setTarget(Vector3.Zero());
  uiCam.mode = Camera.ORTHOGRAPHIC_CAMERA;
  uiCam.orthoLeft = -MIRROR_ASPECT / 2;
  uiCam.orthoRight = MIRROR_ASPECT / 2;
  uiCam.orthoBottom = -0.5;
  uiCam.orthoTop = 0.5;
  uiCam.layerMask = MIRROR_UI_LAYER;
  uiCam.minZ = 0.1;
  uiCam.maxZ = 10;

  // --- Composite both cameras: main view full-screen, mirror in a small viewport. ---
  scene.activeCameras = [mainCamera, uiCam];
  scene.activeCamera = mainCamera;

  const applyViewport = () => {
    const canvasAspect = engine.getRenderWidth() / engine.getRenderHeight();
    const rect = computeMirrorViewport({
      widthFrac: MIRROR_WIDTH_FRAC,
      topMarginFrac: MIRROR_TOP_MARGIN_FRAC,
      canvasAspect,
      mirrorAspect: MIRROR_ASPECT,
    });
    uiCam.viewport = new Viewport(rect.x, rect.y, rect.width, rect.height);
  };
  applyViewport();
  const resizeObserver = engine.onResizeObservable.add(applyViewport);

  let active = true;
  const setActive = (value: boolean) => {
    active = value;
    plane.setEnabled(value);
    const idx = scene.customRenderTargets.indexOf(mirrorRTT);
    if (value && idx === -1) {
      scene.customRenderTargets.push(mirrorRTT);
    } else if (!value && idx !== -1) {
      scene.customRenderTargets.splice(idx, 1);
    }
  };
  setActive(true); // registers mirrorRTT in scene.customRenderTargets

  const dispose = () => {
    engine.onResizeObservable.remove(resizeObserver);
    setActive(false);
    plane.dispose();
    mirrorMat.dispose();
    mirrorRTT.dispose();
    rearCam.dispose();
    uiCam.dispose();
  };

  return { setActive, isActive: () => active, dispose };
}
