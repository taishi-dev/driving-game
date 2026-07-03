import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TILE_W,
  TILE_L,
  STRAIGHT_START_Z,
  STRAIGHT_TILE_COUNT,
  STRAIGHT_CHECKPOINT,
  straightRoadStrip,
  checkCoordinateContract,
} from "../src/lib/driveLayout.ts";

test("straightRoadStrip is derived from the placement constants", () => {
  const strip = straightRoadStrip();
  // Width is centred on X=0 with half-width TILE_W/2.
  assert.equal(strip.xMin, -TILE_W / 2);
  assert.equal(strip.xMax, TILE_W / 2);
  // Z bounds come from the first/last tile centres ± TILE_L/2.
  const firstCentre = STRAIGHT_START_Z;
  const lastCentre = STRAIGHT_START_Z - (STRAIGHT_TILE_COUNT - 1) * TILE_L;
  assert.equal(strip.zMax, firstCentre + TILE_L / 2);
  assert.equal(strip.zMin, lastCentre - TILE_L / 2);
  // Concretely, the current constants give X∈[-3,3], Z∈[-204,24].
  assert.deepEqual(
    { xMin: strip.xMin, xMax: strip.xMax, zMin: strip.zMin, zMax: strip.zMax },
    { xMin: -3, xMax: 3, zMin: -204, zMax: 24 },
  );
});

test("course.ts straight checkpoint (0,0,-90) is inside the road strip", () => {
  const r = checkCoordinateContract();
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.checkpoint, { x: 0, y: 0, z: -90 });
  assert.deepEqual(STRAIGHT_CHECKPOINT, { x: 0, y: 0, z: -90 });
});

test("the check is NOT tautological — it fails when the point leaves the strip", () => {
  // Off to the side (beyond half-width): off the road.
  assert.equal(checkCoordinateContract({ x: TILE_W, y: 0, z: -90 }).ok, false);
  // Past the far end of the straight (beyond the last tile).
  assert.equal(
    checkCoordinateContract({ x: 0, y: 0, z: straightRoadStrip().zMin - 1 }).ok,
    false,
  );
  // Off the ground plane.
  assert.equal(checkCoordinateContract({ x: 0, y: 5, z: -90 }).ok, false);
});

test("the derived strip actually covers every placed straight tile", () => {
  // Each tile centre ± TILE_L/2 must lie within the reported strip; this ties
  // the contract to the real placement loop in driveWorld.ts.
  const strip = straightRoadStrip();
  for (let i = 0; i < STRAIGHT_TILE_COUNT; i++) {
    const centre = STRAIGHT_START_Z - i * TILE_L;
    assert.ok(centre - TILE_L / 2 >= strip.zMin - 1e-9, `tile ${i} underflows strip`);
    assert.ok(centre + TILE_L / 2 <= strip.zMax + 1e-9, `tile ${i} overflows strip`);
  }
});
