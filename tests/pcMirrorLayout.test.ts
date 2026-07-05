import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MIRROR_ASPECT,
  computeMirrorViewport,
  mirrorCameraLocalOffset,
} from "../src/lib/pcMirrorLayout.ts";

test("viewport is horizontally centred with bottom-origin y", () => {
  const r = computeMirrorViewport({
    widthFrac: 0.26,
    topMarginFrac: 0.02,
    canvasAspect: 1920 / 1200,
    mirrorAspect: MIRROR_ASPECT,
  });
  // centred: x = (1 - width)/2
  assert.ok(Math.abs(r.x - (1 - 0.26) / 2) < 1e-12);
  assert.equal(r.width, 0.26);
  // height derived so pixel-aspect == mirrorAspect
  const expectedH = (0.26 * (1920 / 1200)) / MIRROR_ASPECT;
  assert.ok(Math.abs(r.height - expectedH) < 1e-12);
  // y places the top edge topMarginFrac below the canvas top (bottom-origin)
  assert.ok(Math.abs(r.y - (1 - 0.02 - expectedH)) < 1e-12);
});

test("viewport pixel aspect equals mirrorAspect at any window size", () => {
  for (const [w, h] of [[1920, 1200], [1280, 720], [1000, 1000]]) {
    const canvasAspect = w / h;
    const r = computeMirrorViewport({
      widthFrac: 0.3,
      topMarginFrac: 0.02,
      canvasAspect,
      mirrorAspect: MIRROR_ASPECT,
    });
    const pxAspect = (r.width * w) / (r.height * h);
    assert.ok(Math.abs(pxAspect - MIRROR_ASPECT) < 1e-9, `pxAspect ${pxAspect} != ${MIRROR_ASPECT} at ${w}x${h}`);
  }
});

test("viewport rejects invalid inputs", () => {
  const base = { topMarginFrac: 0.02, canvasAspect: 1.6, mirrorAspect: 2 };
  assert.throws(() => computeMirrorViewport({ ...base, widthFrac: 0 }));
  assert.throws(() => computeMirrorViewport({ ...base, widthFrac: 1.5 }));
  assert.throws(() => computeMirrorViewport({ ...base, widthFrac: 0.3, canvasAspect: 0 }));
  assert.throws(() => computeMirrorViewport({ widthFrac: 0.3, topMarginFrac: 0.02, canvasAspect: 1.6, mirrorAspect: 0 }));
});

test("camera mount is centred, raised above the roof, behind the rear edge", () => {
  const o = mirrorCameraLocalOffset(0.5, 2.0, 0.25, 0.1);
  assert.equal(o.x, 0);
  assert.equal(o.y, 0.5 + 0.25); // half-height + clearance
  assert.equal(o.z, -(2.0 + 0.1)); // NEGATIVE Z = behind (local +Z is front)
  assert.ok(o.z < 0);
});

test("camera mount rejects invalid inputs", () => {
  assert.throws(() => mirrorCameraLocalOffset(0, 2));
  assert.throws(() => mirrorCameraLocalOffset(0.5, 0));
  assert.throws(() => mirrorCameraLocalOffset(0.5, 2, -1));
  assert.throws(() => mirrorCameraLocalOffset(0.5, 2, 0.2, -1));
});
