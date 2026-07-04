import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TILE_W,
  TILE_L,
  ROAD_Y,
  STRAIGHT_START_Z,
  STRAIGHT_TILE_COUNT,
  STRAIGHT_CHECKPOINT,
  straightRoadStrip,
  roadColliders,
  isOnRoad,
  checkCoordinateContract,
} from "../src/lib/pcDriveLayout.ts";

test("straight strip is DERIVED from the placement constants", () => {
  const s = straightRoadStrip();
  // Width is TILE_W centred on X=0.
  assert.equal(s.xMin, -TILE_W / 2);
  assert.equal(s.xMax, TILE_W / 2);
  // Z spans from the first tile's front edge to the last tile's back edge.
  const firstCentre = STRAIGHT_START_Z;
  const lastCentre = STRAIGHT_START_Z - (STRAIGHT_TILE_COUNT - 1) * TILE_L;
  assert.equal(s.zMax, firstCentre + TILE_L / 2); // 18 + 6 = 24
  assert.equal(s.zMin, lastCentre - TILE_L / 2); // (18-216) - 6 = -204
  assert.equal(s.y, ROAD_Y);
  // Concrete contract numbers (X=right, −Z=forward, Y=0): Z ∈ [−204, 24].
  assert.equal(s.zMax, 24);
  assert.equal(s.zMin, -204);
});

test("coordinate contract PASSES for the straight-lesson checkpoint (0,0,−90)", () => {
  const c = checkCoordinateContract();
  assert.equal(c.ok, true, c.reason);
  assert.equal(c.onRoad, true);
  assert.deepEqual(c.checkpoint, { x: 0, y: 0, z: -90 });
  assert.equal(STRAIGHT_CHECKPOINT.z, -90);
});

test("checkpoint (0,0,−90) is inside |X|<3 and within the straight Z span", () => {
  const s = straightRoadStrip();
  assert.ok(Math.abs(STRAIGHT_CHECKPOINT.x) < 3);
  assert.ok(STRAIGHT_CHECKPOINT.z > s.zMin && STRAIGHT_CHECKPOINT.z < s.zMax);
});

test("contract FAILS off the side of the straight (x=5, z=−90)", () => {
  const c = checkCoordinateContract({ x: 5, y: 0, z: -90 });
  assert.equal(c.ok, false);
  assert.match(c.reason ?? "", /inX=false/);
});

test("contract FAILS past the end of the straight (z=−260)", () => {
  const c = checkCoordinateContract({ x: 0, y: 0, z: -260 });
  assert.equal(c.ok, false);
  assert.match(c.reason ?? "", /inZ=false/);
});

test("contract FAILS off the road surface (y=2)", () => {
  const c = checkCoordinateContract({ x: 0, y: 2, z: -90 });
  assert.equal(c.ok, false);
  assert.match(c.reason ?? "", /inY=false/);
});

test("isOnRoad: on the straight centreline, off to the side", () => {
  assert.equal(isOnRoad(0, -90), true); // centreline mid-course
  assert.equal(isOnRoad(0, 20), true); // near the +Z start
  assert.equal(isOnRoad(0, -200), true); // near the −Z end
  assert.equal(isOnRoad(2.9, -90), true); // just inside the 3m half-width
  assert.equal(isOnRoad(4, -90), false); // off the side
  assert.equal(isOnRoad(0, 40), false); // past the +Z start
  assert.equal(isOnRoad(0, -260), false); // past the −Z end
});

test("isOnRoad: the turn strips are driveable near the junction", () => {
  // Left/right turn strips run out along ±X at TURN_Z (−38).
  assert.equal(isOnRoad(-30, -38), true);
  assert.equal(isOnRoad(30, -38), true);
  // Far past the reach is off-road.
  assert.equal(isOnRoad(80, -38), false);
});

test("roadColliders() are all FLAT with their top face at Y=0", () => {
  const boxes = roadColliders();
  assert.ok(boxes.length >= 3);
  for (const b of boxes) {
    // top face = cy + sy/2 should be 0 (flat wheel-ray/physics ground at Y=0)
    assert.ok(Math.abs(b.cy + b.sy / 2) < 1e-9, `${b.name} top face not at Y=0`);
    assert.ok(b.sy > 0 && b.sy <= 1, `${b.name} should be a thin flat slab`);
    assert.ok(b.sx > 0 && b.sz > 0);
  }
  // The straight collider must cover the full straight strip.
  const straight = boxes.find((b) => b.name.includes("straight"));
  assert.ok(straight);
  assert.equal(straight.sx, TILE_W);
  assert.equal(straight.sz, 228); // 24 − (−204)
});

test("isOnRoad margin shrinks the footprint", () => {
  // At the exact edge (x=3), a positive margin makes it read off-road.
  assert.equal(isOnRoad(2.99, -90, 0), true);
  assert.equal(isOnRoad(2.99, -90, 0.5), false);
});
