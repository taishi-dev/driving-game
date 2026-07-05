import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MS_TO_KMH,
  msToKmh,
  kmhToMs,
  overSpeedDragMagnitude,
  speedSensitiveSteer,
} from "../src/lib/pcVehicleKernel.ts";

test("msToKmh / kmhToMs round-trip and known values", () => {
  assert.equal(MS_TO_KMH, 3.6);
  assert.equal(msToKmh(10), 36);
  assert.equal(kmhToMs(36), 10);
  const ms = 16.6;
  assert.ok(Math.abs(kmhToMs(msToKmh(ms)) - ms) < 1e-12);
  // ~60 km/h feel target ≈ 16.67 m/s
  assert.ok(Math.abs(kmhToMs(60) - 16.6667) < 1e-3);
});

test("overSpeedDrag is zero at or below the cap", () => {
  assert.equal(overSpeedDragMagnitude(0, 16.5, 1200, 4), 0);
  assert.equal(overSpeedDragMagnitude(16.5, 16.5, 1200, 4), 0);
  assert.equal(overSpeedDragMagnitude(16.4999, 16.5, 1200, 4), 0);
});

test("overSpeedDrag ramps linearly with excess speed", () => {
  const mass = 1200;
  const cap = 16.5;
  const k = 4;
  // 1 m/s over → excess*mass*k
  assert.equal(overSpeedDragMagnitude(17.5, cap, mass, k), 1 * mass * k);
  // 2 m/s over → double
  assert.equal(
    overSpeedDragMagnitude(18.5, cap, mass, k),
    2 * overSpeedDragMagnitude(17.5, cap, mass, k),
  );
});

test("speedSensitiveSteer equals input*max at rest, shrinks with speed", () => {
  const max = 0.5;
  const falloff = 0.05;
  // at rest, full lock == max angle
  assert.ok(Math.abs(speedSensitiveSteer(1, max, 0, falloff) - max) < 1e-12);
  assert.ok(Math.abs(speedSensitiveSteer(-1, max, 0, falloff) + max) < 1e-12);
  // at speed, magnitude is strictly smaller
  const atSpeed = speedSensitiveSteer(1, max, 20, falloff);
  assert.ok(atSpeed > 0 && atSpeed < max);
  // exact falloff form
  assert.ok(Math.abs(atSpeed - max / (1 + 20 * falloff)) < 1e-12);
});

test("speedSensitiveSteer clamps input to [-1,1] and neutral stays 0", () => {
  const max = 0.5;
  assert.equal(speedSensitiveSteer(0, max, 10, 0.05), 0);
  // input beyond the rails is clamped
  assert.equal(
    speedSensitiveSteer(5, max, 0, 0.05),
    speedSensitiveSteer(1, max, 0, 0.05),
  );
  assert.equal(
    speedSensitiveSteer(-5, max, 0, 0.05),
    speedSensitiveSteer(-1, max, 0, 0.05),
  );
});
