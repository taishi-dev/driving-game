import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeMirrorViewport,
  mirrorCameraLocalOffset,
} from "../src/lib/mirrorLayout.ts";

test("computeMirrorViewport centres the mirror horizontally", () => {
  const rect = computeMirrorViewport({
    widthFrac: 0.26,
    topMarginFrac: 0.02,
    canvasAspect: 1.6,
    mirrorAspect: 2,
  });
  assert.ok(Math.abs(rect.x - (1 - 0.26) / 2) < 1e-9);
  assert.ok(Math.abs(rect.x + rect.width / 2 - 0.5) < 1e-9);
});

test("computeMirrorViewport sits topMarginFrac below the top edge (y is bottom-origin)", () => {
  const rect = computeMirrorViewport({
    widthFrac: 0.26,
    topMarginFrac: 0.02,
    canvasAspect: 1.6,
    mirrorAspect: 2,
  });
  // Babylon Viewport y is measured from the BOTTOM of the canvas, so the top
  // edge of the rect (y + height) must sit topMarginFrac below y=1.
  assert.ok(Math.abs(rect.y + rect.height - (1 - 0.02)) < 1e-9);
});

test("computeMirrorViewport derives height from the aspect ratios so the on-screen pixel aspect always matches mirrorAspect (no stretching)", () => {
  for (const canvasAspect of [1.0, 1.6, 1.7777, 2.4]) {
    for (const mirrorAspect of [1, 2, 2.5]) {
      const rect = computeMirrorViewport({
        widthFrac: 0.25,
        topMarginFrac: 0.02,
        canvasAspect,
        mirrorAspect,
      });
      // pixelWidth = rect.width * canvasWidth; pixelHeight = rect.height * canvasHeight
      // canvasWidth = canvasAspect * canvasHeight, so:
      const pixelAspect = (rect.width * canvasAspect) / rect.height;
      assert.ok(
        Math.abs(pixelAspect - mirrorAspect) < 1e-9,
        `expected pixel aspect ${mirrorAspect}, got ${pixelAspect}`,
      );
    }
  }
});

test("computeMirrorViewport rejects a non-positive or over-1 widthFrac", () => {
  assert.throws(() =>
    computeMirrorViewport({ widthFrac: 0, topMarginFrac: 0.02, canvasAspect: 1.6, mirrorAspect: 2 }),
  );
  assert.throws(() =>
    computeMirrorViewport({ widthFrac: 1.5, topMarginFrac: 0.02, canvasAspect: 1.6, mirrorAspect: 2 }),
  );
});

test("computeMirrorViewport rejects non-positive aspect ratios", () => {
  assert.throws(() =>
    computeMirrorViewport({ widthFrac: 0.26, topMarginFrac: 0.02, canvasAspect: 0, mirrorAspect: 2 }),
  );
  assert.throws(() =>
    computeMirrorViewport({ widthFrac: 0.26, topMarginFrac: 0.02, canvasAspect: 1.6, mirrorAspect: -1 }),
  );
});

test("mirrorCameraLocalOffset places the camera above the chassis roof, centred left/right, at the rear edge", () => {
  // Chassis local +Z is the car's FRONT (matches raycastVehicle.ts, which
  // derives the drive direction from Vector3.Forward() == local +Z); the
  // mirror camera mounts at the opposite end, local -Z.
  const offset = mirrorCameraLocalOffset(0.4, 2.0);
  assert.deepEqual(offset, { x: 0, y: 0.55, z: -2.1 });
});

test("mirrorCameraLocalOffset honours a custom roof clearance", () => {
  const offset = mirrorCameraLocalOffset(0.4, 2.0, 0.3);
  assert.ok(Math.abs(offset.y - 0.7) < 1e-9);
});

test("mirrorCameraLocalOffset honours a custom rear margin", () => {
  const offset = mirrorCameraLocalOffset(0.4, 2.0, 0.15, 0.5);
  assert.ok(Math.abs(offset.z - -2.5) < 1e-9);
});

test("mirrorCameraLocalOffset places the camera at/beyond the rear edge so the car's own roof never fills the frame", () => {
  // Regression guard for the self-occlusion bug found by visual verification:
  // a camera sitting near the box's horizontal centre grazes over the
  // remaining roof directly ahead, which (at any reasonable FOV) fills most
  // of the mirror with the car's own roof instead of the world behind it.
  // The camera must be at or beyond the chassis's rear face
  // (z <= -chassisHalfLength, since local +Z is the car's front).
  const chassisHalfLength = 2.0;
  const offset = mirrorCameraLocalOffset(0.4, chassisHalfLength);
  assert.ok(offset.z <= -chassisHalfLength);
});

test("mirrorCameraLocalOffset rejects a non-positive chassisHalfHeight", () => {
  assert.throws(() => mirrorCameraLocalOffset(0, 2.0));
  assert.throws(() => mirrorCameraLocalOffset(-0.1, 2.0));
});

test("mirrorCameraLocalOffset rejects a non-positive chassisHalfLength", () => {
  assert.throws(() => mirrorCameraLocalOffset(0.4, 0));
  assert.throws(() => mirrorCameraLocalOffset(0.4, -1));
});

test("mirrorCameraLocalOffset rejects a negative roofClearance", () => {
  assert.throws(() => mirrorCameraLocalOffset(0.4, 2.0, -0.01));
});

test("mirrorCameraLocalOffset rejects a negative rearMargin", () => {
  assert.throws(() => mirrorCameraLocalOffset(0.4, 2.0, 0.15, -0.01));
});
