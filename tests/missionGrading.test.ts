import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGradingState,
  stepMissionGrading,
  gradingSpeedFromMetersPerSec,
  type GradingFrame,
} from "../src/lib/mission/missionGrading.ts";

function frame(overrides: Partial<GradingFrame> & Pick<GradingFrame, "lesson">): GradingFrame {
  return {
    position: { x: 999, z: 999 }, // far from any goal/checkpoint by default
    headYaw: 0,
    speed: 0,
    language: "en",
    ...overrides,
  };
}

test("free-mode is never graded", () => {
  const s = createGradingState();
  const r = stepMissionGrading(s, frame({ lesson: "free-mode", position: { x: 0, z: 0 } }));
  assert.equal(r.goalReached, false);
  assert.deepEqual(r.cleared, []);
});

test("straight: reaching the goal (0,-150) reports goalReached", () => {
  const s = createGradingState();
  const r = stepMissionGrading(s, frame({ lesson: "straight", position: { x: 0, z: -150 } }));
  assert.equal(r.goalReached, true);
});

test("straight: away from the goal does not complete", () => {
  const s = createGradingState();
  const r = stepMissionGrading(s, frame({ lesson: "straight", position: { x: 0, z: -50 } }));
  assert.equal(r.goalReached, false);
});

test("goal short-circuits checkpoint evaluation (returns before the loop)", () => {
  // railroad-crossing has a scored stop checkpoint; if the car is AT the goal,
  // checkpoints are not evaluated this frame.
  const s = createGradingState();
  const r = stepMissionGrading(
    s,
    frame({ lesson: "railroad-crossing", position: { x: 0, z: -100 }, speed: 0 }),
  );
  assert.equal(r.goalReached, true);
  assert.deepEqual(r.cleared, []);
  assert.equal(s.cleared.size, 0);
});

test("railroad-crossing: stop checkpoint clears when stopped in its radius", () => {
  const s = createGradingState();
  // stop checkpoint rr-stop-1 at (0,0,-60), radius 5; nearly stopped.
  const r = stepMissionGrading(
    s,
    frame({ lesson: "railroad-crossing", position: { x: 0, z: -60 }, speed: 0.01 }),
  );
  assert.equal(r.goalReached, false);
  assert.equal(r.cleared.length, 1);
  assert.equal(r.cleared[0].id, "rr-stop-1");
  assert.ok(s.cleared.has("rr-stop-1"));
});

test("railroad-crossing: moving through the stop zone does NOT clear it", () => {
  const s = createGradingState();
  const r = stepMissionGrading(
    s,
    frame({ lesson: "railroad-crossing", position: { x: 0, z: -60 }, speed: 5 }),
  );
  assert.equal(r.cleared.length, 0);
  assert.equal(s.cleared.size, 0);
});

test("already-cleared checkpoints are skipped on later frames", () => {
  const s = createGradingState();
  stepMissionGrading(s, frame({ lesson: "railroad-crossing", position: { x: 0, z: -60 }, speed: 0 }));
  const r2 = stepMissionGrading(
    s,
    frame({ lesson: "railroad-crossing", position: { x: 0, z: -60 }, speed: 0 }),
  );
  assert.deepEqual(r2.cleared, []); // not re-reported
});

// --- No-camera faithfulness: mirror + safety-check never clear at headYaw=0 ---

test("left-turn mirror checkpoint does NOT clear at headYaw=0 (no webcam)", () => {
  // mirror-1 targetYaw -0.5, tolerance 0.5: |0 - (-0.5)| = 0.5 is NOT < 0.5.
  // speed 5 keeps the overlapping stop-1 zone from clearing in the same frame
  // (that is separate, correct behavior pinned elsewhere).
  const s = createGradingState();
  const r = stepMissionGrading(
    s,
    frame({ lesson: "left-turn", position: { x: 0, z: -28 }, headYaw: 0, speed: 5 }),
  );
  assert.equal(r.cleared.length, 0);
});

test("left-turn mirror checkpoint clears when head yaw matches the target", () => {
  const s = createGradingState();
  const r = stepMissionGrading(
    s,
    frame({ lesson: "left-turn", position: { x: 0, z: -28 }, headYaw: -0.5 }),
  );
  const ids = r.cleared.map((c) => c.id);
  assert.ok(ids.includes("mirror-1"));
});

test("crosswalk safety-check needs BOTH look directions (never clears at headYaw=0)", () => {
  const s = createGradingState();
  const r = stepMissionGrading(
    s,
    frame({ lesson: "crosswalk", position: { x: 0, z: -30 }, headYaw: 0 }),
  );
  assert.equal(r.cleared.length, 0);
});

test("crosswalk safety-check clears after looking left then right across frames", () => {
  const s = createGradingState();
  // Look left (yaw > 0.3) — latches lookedLeft, not yet cleared.
  const r1 = stepMissionGrading(
    s,
    frame({ lesson: "crosswalk", position: { x: 0, z: -30 }, headYaw: 0.4 }),
  );
  assert.equal(r1.cleared.length, 0);
  // Look right (yaw < -0.3) — both latched -> cleared.
  const r2 = stepMissionGrading(
    s,
    frame({ lesson: "crosswalk", position: { x: 0, z: -30 }, headYaw: -0.4 }),
  );
  const ids = r2.cleared.map((c) => c.id);
  assert.ok(ids.includes("cw-safety-1"));
});

test("speed unit conversion preserves the 2 km/h stop threshold", () => {
  // The frozen stop test is Math.abs(speed) < 0.02 in original units (u*100 = km/h).
  assert.ok(Math.abs(gradingSpeedFromMetersPerSec(0.5)) < 0.02); // 1.8 km/h -> stopped
  assert.ok(Math.abs(gradingSpeedFromMetersPerSec(0.6)) >= 0.02); // 2.16 km/h -> moving
  assert.ok(Math.abs(gradingSpeedFromMetersPerSec(-0.5)) < 0.02); // reverse creep counts as stopped
  // Display contract: u * 100 = km/h (10 m/s = 36 km/h).
  assert.equal(gradingSpeedFromMetersPerSec(10) * 100, 36);
});

test("Japanese feedback string uses the checkpoint label", () => {
  const s = createGradingState();
  const r = stepMissionGrading(
    s,
    frame({ lesson: "railroad-crossing", position: { x: 0, z: -60 }, speed: 0, language: "ja" }),
  );
  assert.ok(r.cleared[0].feedback?.includes("Railroad Crossing Stop"));
});
