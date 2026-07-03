/**
 * B5b — pure layout math for the rearview-mirror screen-space overlay.
 *
 * The mirror is composited via Babylon's multi-camera viewport feature (see
 * `src/components/babylon/rearviewMirror.ts`): a small orthographic "UI"
 * camera renders a single plane (textured with the mirror's RenderTargetTexture)
 * into a sub-rectangle of the canvas. This module holds the two bits of math
 * that are easy to get subtly wrong — the on-screen rectangle, and the rear
 * camera's mount point — free of any @babylonjs / browser imports so they can
 * be exercised by `node --test` without the 3D engine.
 */

/**
 * On-screen placement of the mirror overlay, as fractions of the canvas.
 * SINGLE SOURCE OF TRUTH: consumed both by the Babylon compositor
 * (`rearviewMirror.ts`, which frames the RTT into this rectangle) AND by the
 * DrivingScreen DOM bezel that overlays it — kept here (Babylon-free) so the two
 * can never silently drift. `MIRROR_ASPECT` must equal the RTT's width/height
 * (512/256) in `rearviewMirror.ts`.
 */
export const MIRROR_WIDTH_FRAC = 0.26;
export const MIRROR_TOP_MARGIN_FRAC = 0.02;
export const MIRROR_ASPECT = 2;

export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MirrorViewportOptions {
  /** Width of the mirror overlay as a fraction of the canvas width (0, 1]. */
  widthFrac: number;
  /** Gap between the top of the canvas and the mirror, as a fraction of canvas height. */
  topMarginFrac: number;
  /** canvasWidth / canvasHeight in pixels — the render target's current aspect. */
  canvasAspect: number;
  /** The mirror render target's own width / height (e.g. 512 / 256 = 2). */
  mirrorAspect: number;
}

/**
 * Compute the mirror's on-screen rectangle as fractions of the canvas, in the
 * form Babylon's `Viewport` expects (x, y, width, height, all 0..1, with y
 * measured from the BOTTOM of the canvas).
 *
 * Babylon's orthographic-camera projection does NOT auto-correct for the
 * viewport's pixel aspect ratio the way a perspective camera's fov+aspect
 * combo does — whatever rectangle the ortho camera frames gets stretched to
 * fill the viewport exactly. So `heightFrac` cannot be chosen independently
 * of `widthFrac`: it is derived from canvasAspect and mirrorAspect so the
 * mirror's on-screen PIXEL aspect always equals the render target's aspect,
 * which is what keeps the mirror image undistorted at any window size.
 */
export function computeMirrorViewport(opts: MirrorViewportOptions): ViewportRect {
  const { widthFrac, topMarginFrac, canvasAspect, mirrorAspect } = opts;
  if (!(widthFrac > 0) || widthFrac > 1) {
    throw new Error(`widthFrac must be in (0, 1], got ${widthFrac}`);
  }
  if (!(canvasAspect > 0)) {
    throw new Error(`canvasAspect must be > 0, got ${canvasAspect}`);
  }
  if (!(mirrorAspect > 0)) {
    throw new Error(`mirrorAspect must be > 0, got ${mirrorAspect}`);
  }
  const height = (widthFrac * canvasAspect) / mirrorAspect;
  const x = (1 - widthFrac) / 2; // horizontally centred
  const y = 1 - topMarginFrac - height; // Viewport y is bottom-origin
  return { x, y, width: widthFrac, height };
}

export interface MirrorCameraOffset {
  x: number;
  y: number;
  z: number;
}

/**
 * Local-space position (relative to the chassis origin) for the rear-facing
 * mirror camera: centred left/right, raised above the chassis roof by
 * `roofClearance`, and pushed out past the chassis's rear edge (+ `rearMargin`)
 * along Z. Chassis local +Z is the car's FRONT (this matches
 * `raycastVehicle.ts`, which derives the drive direction from
 * `Vector3.TransformNormal(Vector3.Forward(), rotMatrix)` i.e. local +Z), so
 * the rear mount point is at NEGATIVE Z.
 *
 * Both offsets matter for the same reason: the camera must not have any of
 * the car's own roof left in front of it along its (backward) look
 * direction. A camera hovering over the middle of the roof grazes over the
 * remaining half of the roof at a shallow angle — which, by simple
 * perspective (the near roof edge is at a steep down-angle, the far edge is
 * only `atan(roofClearance / remainingRoofLength)` below the horizon) fills
 * most of the visible frame with the car's own roof instead of the world
 * behind it. Mounting at/beyond the rear edge leaves no roof ahead of the
 * camera at all, independent of clearance or field of view.
 */
export function mirrorCameraLocalOffset(
  chassisHalfHeight: number,
  chassisHalfLength: number,
  roofClearance = 0.15,
  rearMargin = 0.1,
): MirrorCameraOffset {
  if (!(chassisHalfHeight > 0)) {
    throw new Error(`chassisHalfHeight must be > 0, got ${chassisHalfHeight}`);
  }
  if (!(chassisHalfLength > 0)) {
    throw new Error(`chassisHalfLength must be > 0, got ${chassisHalfLength}`);
  }
  if (roofClearance < 0) {
    throw new Error(`roofClearance must be >= 0, got ${roofClearance}`);
  }
  if (rearMargin < 0) {
    throw new Error(`rearMargin must be >= 0, got ${rearMargin}`);
  }
  return {
    x: 0,
    y: chassisHalfHeight + roofClearance,
    z: -(chassisHalfLength + rearMargin),
  };
}
