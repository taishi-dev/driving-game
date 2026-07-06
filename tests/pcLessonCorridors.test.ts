import { test } from "node:test";
import assert from "node:assert/strict";

import {
  densifyPolyline,
  corridorColliders,
  lessonWorldPatches,
  roadColliders,
  isOnRoad,
  SCURVE_POLYLINE,
  CRANK_POLYLINE,
  CORRIDOR_WIDTH,
} from "../src/lib/pcDriveLayout.ts";
import { getCoursePath } from "../src/lib/course.ts";

// ─── densify ─────────────────────────────────────────────────────────────────

test("densifyPolyline keeps endpoints and bounds segment length", () => {
  const out = densifyPolyline(
    [
      [0, 0],
      [0, -32],
      [10, -32],
    ],
    6,
  );
  assert.deepEqual(out[0], [0, 0]);
  assert.deepEqual(out[out.length - 1], [10, -32]);
  for (let i = 1; i < out.length; i++) {
    const d = Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]);
    assert.ok(d <= 6 + 1e-9, `segment ${i} too long: ${d}`);
  }
});

// ─── corridor coverage vs the FROZEN course paths ────────────────────────────
// The real acceptance: every point of the frozen course path must be ON ROAD
// for its lesson (with margin, so the car's centre never flags off-track while
// perfectly following the course).

function assertCourseCovered(lesson: "s-curve" | "crank") {
  const path = getCoursePath(lesson);
  const pts = path.getSpacedPoints(300);
  for (const p of pts) {
    assert.ok(
      isOnRoad(p.x, p.z, 0.5, lesson),
      `${lesson} course point (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) is off-road`,
    );
  }
}

test("the frozen s-curve course is fully inside its corridor", () => {
  assertCourseCovered("s-curve");
});

test("the frozen crank course is fully inside its corridor", () => {
  assertCourseCovered("crank");
});

test("corridors do NOT exist outside their lesson", () => {
  // The s-curve's LEFT apex — outside the crank corridor (its nearest leg
  // reaches only x ≈ -11.5 there) and far from the straight/turn roads.
  assert.equal(isOnRoad(-14.32, -62.53, 0, "s-curve"), true);
  assert.equal(isOnRoad(-14.32, -62.53, 0), false);
  assert.equal(isOnRoad(-14.32, -62.53, 0, "crank"), false);
  // Deep in the crank's right leg — past the s-curve's reach at that z.
  assert.equal(isOnRoad(16, -50, 0, "crank"), true);
  assert.equal(isOnRoad(16, -50, 0), false);
  assert.equal(isOnRoad(16, -50, 0, "s-curve"), false);
});

test("base lessons are unchanged: base collider set and straight coverage", () => {
  assert.equal(roadColliders().length, 5); // straight + 2 turns + 2 fillers
  assert.ok(isOnRoad(0, -90, 0.5, "straight")); // straight midpoint checkpoint
  assert.ok(isOnRoad(0, -90, 0.5, "traffic-light"));
});

test("corridorColliders inflates each segment AABB by the corridor width", () => {
  const boxes = corridorColliders(
    [
      [0, 0],
      [0, -6],
    ],
    7,
    "test",
  );
  assert.equal(boxes.length, 1);
  const b = boxes[0];
  assert.equal(b.cx, 0);
  assert.equal(b.cz, -3);
  assert.equal(b.sx, 7); // |dx| + width
  assert.equal(b.sz, 13); // |dz| + width
});

// ─── visual patches ──────────────────────────────────────────────────────────

test("corridor asphalt patches cover every point NOT already on the base road", () => {
  for (const lesson of ["s-curve", "crank"] as const) {
    const patches = lessonWorldPatches(lesson).filter((p) => p.kind === "asphalt");
    assert.ok(patches.length >= 10, `${lesson}: too few patches (${patches.length})`);
    // No patch may sit on the base road (it would Z-fight the road tiles)...
    for (const p of patches) {
      assert.ok(!isOnRoad(p.cx, p.cz, 2), `${lesson} patch on base road at (${p.cx}, ${p.cz})`);
    }
    // ...and every densified corridor point must be covered by a patch OR the
    // base road, so the paving has no visual holes along the drive line.
    const poly = densifyPolyline(lesson === "s-curve" ? SCURVE_POLYLINE : CRANK_POLYLINE, 6);
    for (const [x, z] of poly) {
      const paved =
        isOnRoad(x, z, 0) ||
        patches.some((p) => Math.hypot(p.cx - x, p.cz - z) < 4.5); // 9x9 patch half-diag
      assert.ok(paved, `${lesson} corridor point (${x}, ${z}) unpaved`);
    }
  }
});

test("crosswalk lesson gets crosswalk stripes at its safety checkpoint (z=-30)", () => {
  const patches = lessonWorldPatches("crosswalk");
  const cw = patches.find((p) => p.kind === "crosswalk");
  assert.ok(cw, "crosswalk patch missing");
  assert.equal(cw!.cz, -30);
  assert.equal(cw!.cx, 0);
});

test("railroad lesson gets rails + crossbucks at its stop checkpoint (z=-60)", () => {
  const patches = lessonWorldPatches("railroad-crossing");
  const rails = patches.filter((p) => p.kind === "rail");
  assert.ok(rails.length >= 2, "expected at least two rails");
  for (const r of rails) assert.ok(Math.abs(r.cz - -61) < 3, `rail at odd z ${r.cz}`);
  const bucks = patches.filter((p) => p.kind === "crossbuck");
  assert.equal(bucks.length, 2, "one crossbuck per side");
  assert.ok(bucks.every((b) => Math.abs(b.cx) >= CORRIDOR_WIDTH / 2));
});

test("traffic-light lesson gets a crosswalk just past the signal stop line", () => {
  const patches = lessonWorldPatches("traffic-light");
  const cw = patches.find((p) => p.kind === "crosswalk");
  assert.ok(cw, "crosswalk patch missing");
  assert.ok(cw!.cz < -18 && cw!.cz > -26, `crosswalk at odd z ${cw!.cz}`);
});

test("straight and turn lessons get no extra patches", () => {
  assert.deepEqual(lessonWorldPatches("straight"), []);
  assert.deepEqual(lessonWorldPatches("left-turn"), []);
  assert.deepEqual(lessonWorldPatches("free-mode"), []);
});

// ─── buildings/props must clear the lesson corridor ─────────────────────────

import { lessonBuildings, lessonProps } from "../src/lib/pcDriveLayout.ts";

function overlapsCorridor(cx: number, cz: number, half: number, lesson: string): boolean {
  return corridorColliders(
    densifyPolyline(lesson === "s-curve" ? SCURVE_POLYLINE : CRANK_POLYLINE, 6),
    CORRIDOR_WIDTH,
    "t",
  ).some(
    (b) =>
      Math.abs(cx - b.cx) < half + b.sx / 2 && Math.abs(cz - b.cz) < half + b.sz / 2,
  );
}

test("base lessons keep the full building/prop set", () => {
  assert.equal(lessonBuildings("straight").length, 6);
  assert.equal(lessonProps("straight").length, 8);
  assert.equal(lessonBuildings(undefined).length, 6);
});

test("corridor lessons drop buildings/props that sit in the corridor", () => {
  for (const lesson of ["s-curve", "crank"] as const) {
    for (const b of lessonBuildings(lesson)) {
      assert.ok(
        !overlapsCorridor(b.x, b.z, 8, lesson),
        `${lesson}: building ${b.file} at (${b.x},${b.z}) blocks the corridor`,
      );
    }
    for (const p of lessonProps(lesson)) {
      assert.ok(
        !overlapsCorridor(p.x, p.z, 1, lesson),
        `${lesson}: prop ${p.file} at (${p.x},${p.z}) blocks the corridor`,
      );
    }
    // The filter must not nuke everything — the world should still have life.
    assert.ok(lessonBuildings(lesson).length >= 3, `${lesson}: too few buildings survive`);
  }
});
