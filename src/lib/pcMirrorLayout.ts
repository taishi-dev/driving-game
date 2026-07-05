/**
 * P5b — pure layout math for the rearview-mirror screen-space overlay.
 *
 * The mirror is composited by a dedicated orthographic UI camera that renders a
 * single flipped quad (textured with the rear camera's render target) into a
 * sub-rectangle of the canvas (see `rearviewMirror.ts`). This module holds the
 * two easy-to-get-wrong bits — the on-screen rectangle and the rear camera's
 * mount point — free of any `playcanvas` / browser imports so `node --test` can
 * exercise them without the 3D engine (rewritten per D1.a; same contract as E1's
 * `mirrorLayout.ts`).
 */

/**
 * On-screen placement of the mirror overlay, as fractions of the canvas.
 * `MIRROR_ASPECT` must equal the render target's width/height (512/256 = 2) in
 * `rearviewMirror.ts`.
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
  /** Width of the mirror overlay as a fraction of canvas width, in (0, 1]. */
  widthFrac: number;
  /** Gap from the top of the canvas, as a fraction of canvas height. */
  topMarginFrac: number;
  /** canvasWidth / canvasHeight in pixels. */
  canvasAspect: number;
  /** The render target's own width / height (e.g. 512/256 = 2). */
  mirrorAspect: number;
}

/**
 * The mirror's on-screen rectangle as canvas fractions, in the form a PlayCanvas
 * camera `rect` (Vec4) expects: x, y, width, height all in 0..1 with y measured
 * from the BOTTOM of the canvas.
 *
 * `height` is DERIVED (not free): the overlay's on-screen PIXEL aspect must equal
 * the render target's aspect or the mirror image stretches. Given a target width
 * fraction, `height = widthFrac * canvasAspect / mirrorAspect` makes the rect's
 * pixel width/height equal `mirrorAspect` at any window size (so an ASPECT_AUTO
 * ortho camera framing a mirrorAspect×1 quad stays undistorted).
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
  const y = 1 - topMarginFrac - height; // camera rect y is bottom-origin
  return { x, y, width: widthFrac, height };
}

export interface MirrorCameraOffset {
  x: number;
  y: number;
  z: number;
}

/**
 * Local-space mount (relative to the chassis origin) for the rear-facing mirror
 * camera: centred left/right, raised above the roof by `roofClearance`, and
 * pushed out past the chassis's rear edge by `rearMargin`.
 *
 * The chassis's LOCAL +Z is the car's FRONT (matches `raycastVehicle.ts`, which
 * treats Bullet's +Z as forward), so the rear mount is at NEGATIVE Z. A
 * PlayCanvas camera looks down its own local −Z, so a camera parented to the
 * chassis with identity rotation already looks out the BACK — no extra flip.
 *
 * Both offsets matter: a camera over the middle of the roof grazes the rest of
 * the roof at a shallow angle and fills most of the frame with the car's own
 * bodywork; mounting at/beyond the rear edge leaves no roof ahead of it.
 */
export function mirrorCameraLocalOffset(
  chassisHalfHeight: number,
  chassisHalfLength: number,
  roofClearance = 0.25,
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
