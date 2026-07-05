import { test } from "node:test";
import assert from "node:assert/strict";

import {
  heroCarUniformScale,
  chassisGroundLocalY,
  HERO_CAR_WIDTH_TOLERANCE,
} from "../src/lib/pcHeroCarFit.ts";

// The drive/replay chassis is a 1.8 x 4.0 m box (VEHICLE_TUNING halfExtents
// {x:0.9, z:2.0}); the visual GLB is fitted by ONE uniform factor so the model
// never distorts.

test("model exactly chassis-sized scales by 1", () => {
  assert.equal(heroCarUniformScale(1.8, 4.0, 1.8, 4.0), 1);
});

test("long narrow model is length-fit to the chassis", () => {
  // 5 m long model onto a 4 m chassis -> 0.8, width nowhere near limiting.
  assert.equal(heroCarUniformScale(1.0, 5.0, 1.8, 4.0), 0.8);
});

test("over-wide model is capped by the width fit (with tolerance)", () => {
  // Model as long as the chassis but twice as wide: length fit would be 1,
  // width must cap it at (1.8 * tolerance) / 3.6.
  const s = heroCarUniformScale(3.6, 4.0, 1.8, 4.0);
  assert.ok(Math.abs(s - (1.8 * HERO_CAR_WIDTH_TOLERANCE) / 3.6) < 1e-12);
  assert.ok(s < 1);
});

test("non-positive model dimensions throw", () => {
  assert.throws(() => heroCarUniformScale(0, 4.0, 1.8, 4.0));
  assert.throws(() => heroCarUniformScale(1.8, -1, 1.8, 4.0));
});

test("chassis-local ground plane derives from suspension rest geometry", () => {
  // VEHICLE_TUNING: connection y=0.1, rest 0.6, wheel radius 0.4 -> at rest the
  // tyre contact patch sits 0.9 m under the chassis centre.
  assert.equal(chassisGroundLocalY(0.1, 0.6, 0.4), -0.9);
  // General shape: connectionY - rest - radius.
  assert.equal(chassisGroundLocalY(0.2, 0.5, 0.35), 0.2 - 0.5 - 0.35);
});
