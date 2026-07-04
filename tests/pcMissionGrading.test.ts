import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGradingState,
  stepMissionGrading,
  STOP_SPEED_DISPLAY_DIVISOR,
  type GradingFrame,
} from "../src/lib/pcMissionGrading.ts";

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
  // checkpoints are not evaluated this frame (useMission early-return order).
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
  // stop checkpoint rr-stop-1 at (0,0,-60), radius 5; ~1 km/h display = stopped.
  const r = stepMissionGrading(
    s,
    frame({ lesson: "railroad-crossing", position: { x: 0, z: -60 }, speed: 1 }),
  );
  assert.equal(r.goalReached, false);
  assert.equal(r.cleared.length, 1);
  assert.equal(r.cleared[0].id, "rr-stop-1");
  assert.ok(s.cleared.has("rr-stop-1"));
});

test("railroad-crossing: moving through the stop zone does NOT clear it", () => {
  const s = createGradingState();
  // 30 km/h display = well above the 2 km/h stop threshold.
  const r = stepMissionGrading(
    s,
    frame({ lesson: "railroad-crossing", position: { x: 0, z: -60 }, speed: 30 }),
  );
  assert.equal(r.cleared.length, 0);
  assert.equal(s.cleared.size, 0);
});

test("already-cleared checkpoints are skipped on later frames (no re-report)", () => {
  const s = createGradingState();
  stepMissionGrading(s, frame({ lesson: "railroad-crossing", position: { x: 0, z: -60 }, speed: 0 }));
  const r2 = stepMissionGrading(
    s,
    frame({ lesson: "railroad-crossing", position: { x: 0, z: -60 }, speed: 0 }),
  );
  assert.deepEqual(r2.cleared, []);
});

// --- No-camera faithfulness: mirror + safety-check never clear at headYaw=0 ---

test("left-turn mirror checkpoint does NOT clear at headYaw=0 (no webcam)", () => {
  // mirror-1 targetYaw -0.5, tolerance fixed 0.5: |0 - (-0.5)| = 0.5 is NOT < 0.5.
  // speed 30 keeps the overlapping stop-1 zone from clearing this frame too.
  const s = createGradingState();
  const r = stepMissionGrading(
    s,
    frame({ lesson: "left-turn", position: { x: 0, z: -28 }, headYaw: 0, speed: 30 }),
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

test("crosswalk safety-check clears after looking left then right across frames (latch)", () => {
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

test("display-km/h speed contract preserves the 2 km/h stop threshold", () => {
  // The frozen stop test is Math.abs(speed) < 0.02 after dividing display km/h by 100.
  assert.equal(STOP_SPEED_DISPLAY_DIVISOR, 100);
  // 1.9 km/h -> 0.019 < 0.02 -> stopped -> clears the rr stop.
  const stopped = createGradingState();
  const rStopped = stepMissionGrading(
    stopped,
    frame({ lesson: "railroad-crossing", position: { x: 0, z: -60 }, speed: 1.9 }),
  );
  assert.equal(rStopped.cleared.length, 1);
  // 2.1 km/h -> 0.021 >= 0.02 -> still moving -> does NOT clear.
  const moving = createGradingState();
  const rMoving = stepMissionGrading(
    moving,
    frame({ lesson: "railroad-crossing", position: { x: 0, z: -60 }, speed: 2.1 }),
  );
  assert.equal(rMoving.cleared.length, 0);
});

test("Japanese feedback string uses the checkpoint label", () => {
  const s = createGradingState();
  const r = stepMissionGrading(
    s,
    frame({ lesson: "railroad-crossing", position: { x: 0, z: -60 }, speed: 0, language: "ja" }),
  );
  assert.ok(r.cleared[0].feedback?.includes("Railroad Crossing Stop"));
});
