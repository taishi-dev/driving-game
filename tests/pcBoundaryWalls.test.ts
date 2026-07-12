import { test } from "node:test";
import assert from "node:assert/strict";

import {
  boundaryWalls,
  isOnRoad,
  roadColliders,
  lessonCorridorColliders,
  TILE_W,
  STRAIGHT_START_Z,
  TILE_L,
  WALL_BUFFER,
  WALL_CELL,
  type ColliderBox,
} from "../src/lib/pcDriveLayout.ts";

// Mid-Z on the straight strip (well within [STRAIGHT_START_Z - TILE_L*..., STRAIGHT_START_Z]).
const STRAIGHT_MID_Z = STRAIGHT_START_Z - TILE_L; // 6

function insideBox(x: number, z: number, b: ColliderBox): boolean {
  return (
    x >= b.cx - b.sx / 2 &&
    x <= b.cx + b.sx / 2 &&
    z >= b.cz - b.sz / 2 &&
    z <= b.cz + b.sz / 2
  );
}

function unionBBox(lesson: string | undefined) {
  const boxes = [...roadColliders(), ...lessonCorridorColliders(lesson)];
  let xMin = Infinity,
    xMax = -Infinity,
    zMin = Infinity,
    zMax = -Infinity;
  for (const b of boxes) {
    xMin = Math.min(xMin, b.cx - b.sx / 2);
    xMax = Math.max(xMax, b.cx + b.sx / 2);
    zMin = Math.min(zMin, b.cz - b.sz / 2);
    zMax = Math.max(zMax, b.cz + b.sz / 2);
  }
  return { xMin, xMax, zMin, zMax };
}

// ─── 1. No trap ──────────────────────────────────────────────────────────────

test("no wall box traps an on-road sample point (base + s-curve)", () => {
  for (const lesson of [undefined, "straight", "s-curve"] as const) {
    const walls = boundaryWalls(lesson);
    const samples: [number, number][] = [[0, 12]]; // spawn point
    const { xMin, xMax, zMin, zMax } = unionBBox(lesson);
    const step = 1;
    for (let x = xMin; x <= xMax; x += step) {
      for (let z = zMin; z <= zMax; z += step) {
        if (isOnRoad(x, z, 0, lesson)) samples.push([x, z]);
      }
    }
    for (const [x, z] of samples) {
      for (const w of walls) {
        assert.ok(
          !insideBox(x, z, w),
          `lesson=${lesson}: on-road point (${x},${z}) trapped inside wall ${w.name}`,
        );
      }
    }
  }
});

// ─── 2. Containment (closed loop) ───────────────────────────────────────────

// Does the half-line from (x0,z0) heading in direction (dx,dz) (exactly one of
// which is non-zero, ±1) cross the footprint of box `w` before reaching
// `limit` (the coordinate value of the far bbox edge in that direction)?
// Interval-overlap test — robust to exactly where within a WALL_CELL the wall
// box's (possibly sub-cell-width) footprint actually sits.
function rayCrossesBox(
  x0: number,
  z0: number,
  dx: number,
  dz: number,
  limit: number,
  w: ColliderBox,
): boolean {
  if (dx !== 0) {
    const zLo = w.cz - w.sz / 2,
      zHi = w.cz + w.sz / 2;
    if (z0 < zLo || z0 > zHi) return false;
    const xLo = w.cx - w.sx / 2,
      xHi = w.cx + w.sx / 2;
    return dx > 0 ? xHi >= x0 && xLo <= limit : xLo <= x0 && xHi >= limit;
  }
  const xLo = w.cx - w.sx / 2,
    xHi = w.cx + w.sx / 2;
  if (x0 < xLo || x0 > xHi) return false;
  const zLo = w.cz - w.sz / 2,
    zHi = w.cz + w.sz / 2;
  return dz > 0 ? zHi >= z0 && zLo <= limit : zLo <= z0 && zHi >= limit;
}

test("rays outward from interior on-road cells each cross a wall (closed loop)", () => {
  const lesson = "straight";
  const walls = boundaryWalls(lesson);
  const { xMin, xMax, zMin, zMax } = unionBBox(lesson);

  const interiorCells: [number, number][] = [
    [0, STRAIGHT_MID_Z],
    [0, STRAIGHT_START_Z],
    [1, STRAIGHT_MID_Z],
    [-1, STRAIGHT_MID_Z],
  ];

  // Walls sit up to WALL_BUFFER + WALL_CELL beyond the raw union bbox (the
  // algorithm's own inflate pad), plus grid-snap/thickness slop — search a
  // margin comfortably past that so the ray doesn't stop short of a real wall.
  const REACH_MARGIN = WALL_BUFFER + 2 * WALL_CELL + 1;

  function rayHitsWall(x0: number, z0: number, dx: number, dz: number): boolean {
    const limit =
      dx > 0
        ? xMax + REACH_MARGIN
        : dx < 0
          ? xMin - REACH_MARGIN
          : dz > 0
            ? zMax + REACH_MARGIN
            : zMin - REACH_MARGIN;
    return walls.some((w) => rayCrossesBox(x0, z0, dx, dz, limit, w));
  }

  for (const [x, z] of interiorCells) {
    assert.ok(isOnRoad(x, z, 0, lesson), `test setup: (${x},${z}) should be on-road`);
    assert.ok(rayHitsWall(x, z, 1, 0), `+x ray from (${x},${z}) missed a wall`);
    assert.ok(rayHitsWall(x, z, -1, 0), `-x ray from (${x},${z}) missed a wall`);
    assert.ok(rayHitsWall(x, z, 0, 1), `+z ray from (${x},${z}) missed a wall`);
    assert.ok(rayHitsWall(x, z, 0, -1), `-z ray from (${x},${z}) missed a wall`);
  }
});

test("rays outward from interior s-curve cells each cross a wall (stair-stepped containment)", () => {
  const lesson = "s-curve";
  const walls = boundaryWalls(lesson);
  const { xMin, xMax, zMin, zMax } = unionBBox(lesson);

  const interiorCells: [number, number][] = [
    [0, 0],
    [10, -18],
    [5, -45],
    [0, -80],
  ];

  const REACH_MARGIN = WALL_BUFFER + 2 * WALL_CELL + 1;

  function rayHitsWall(x0: number, z0: number, dx: number, dz: number): boolean {
    const limit =
      dx > 0
        ? xMax + REACH_MARGIN
        : dx < 0
          ? xMin - REACH_MARGIN
          : dz > 0
            ? zMax + REACH_MARGIN
            : zMin - REACH_MARGIN;
    return walls.some((w) => rayCrossesBox(x0, z0, dx, dz, limit, w));
  }

  for (const [x, z] of interiorCells) {
    assert.ok(isOnRoad(x, z, 0, lesson), `test setup: (${x},${z}) should be on-road for s-curve`);
    assert.ok(rayHitsWall(x, z, 1, 0), `+x ray from (${x},${z}) missed a wall`);
    assert.ok(rayHitsWall(x, z, -1, 0), `-x ray from (${x},${z}) missed a wall`);
    assert.ok(rayHitsWall(x, z, 0, 1), `+z ray from (${x},${z}) missed a wall`);
    assert.ok(rayHitsWall(x, z, 0, -1), `-z ray from (${x},${z}) missed a wall`);
  }
});

// ─── 3. Bounded count ────────────────────────────────────────────────────────

test("merged wall box count stays well under 200", () => {
  assert.ok(boundaryWalls("straight").length < 200, "straight wall count too high");
  assert.ok(boundaryWalls("s-curve").length < 200, "s-curve wall count too high");
});

// ─── 4. Buffer honored ───────────────────────────────────────────────────────

test("wall buffer: 1m outside road edge is free, 3m outside is enclosed", () => {
  const lesson = "straight";
  const walls = boundaryWalls(lesson);
  const halfW = TILE_W / 2; // 3

  // Just outside the true edge but within WALL_BUFFER (1.25m) — must be free.
  const nearRight = { x: halfW + 1.0, z: STRAIGHT_MID_Z };
  const nearLeft = { x: -halfW - 1.0, z: STRAIGHT_MID_Z };
  for (const p of [nearRight, nearLeft]) {
    for (const w of walls) {
      assert.ok(
        !insideBox(p.x, p.z, w),
        `point (${p.x},${p.z}) within WALL_BUFFER unexpectedly inside wall ${w.name}`,
      );
    }
  }

  // 3m outside the true edge — outward ray from road center must cross a wall.
  const farRight = { x: halfW + 3.0, z: STRAIGHT_MID_Z };
  const farLeft = { x: -halfW - 3.0, z: STRAIGHT_MID_Z };
  function crossesWall(x0: number, x1: number, z: number): boolean {
    const dir = Math.sign(x1 - x0) || 1;
    return walls.some((w) => rayCrossesBox(x0, z, dir, 0, x1, w));
  }
  assert.ok(
    crossesWall(0, farRight.x, farRight.z),
    `ray from road center through (${farRight.x},${farRight.z}) missed a wall`,
  );
  assert.ok(
    crossesWall(0, farLeft.x, farLeft.z),
    `ray from road center through (${farLeft.x},${farLeft.z}) missed a wall`,
  );
});

// ─── 5. Per-lesson difference ───────────────────────────────────────────────

test("s-curve corridor walls differ from the base road walls", () => {
  const baseWalls = boundaryWalls("straight");
  const scurveWalls = boundaryWalls("s-curve");

  // The overall union bbox (dominated by the far-reaching turn strips, present
  // in BOTH lessons) is identical either way — the difference is the extra
  // boundary carved around the corridor's own shape, not the outer envelope.
  // Structurally: the corridor adds many more on/off transitions, so the
  // merged wall count differs a lot.
  assert.notEqual(
    scurveWalls.length,
    baseWalls.length,
    "s-curve and base wall counts should differ",
  );

  // Concretely: the s-curve corridor reaches its apex around (14.12, -28.27),
  // which is on-road for "s-curve" but off the base road entirely (only
  // |x| <= 3 is on-road there for "straight") — a lesson-specific point wall
  // boundaries for "s-curve" must clear as on-road while "straight" walls
  // never even need to consider it.
  const [ax, az] = [14.12, -28.27];
  assert.ok(isOnRoad(ax, az, 0, "s-curve"), "s-curve apex should be on-road for s-curve");
  assert.ok(!isOnRoad(ax, az, 0, "straight"), "s-curve apex should be off the base road");
  assert.ok(
    !scurveWalls.some((w) => insideBox(ax, az, w)),
    "s-curve apex should not itself be trapped inside an s-curve wall",
  );
});
