import { test } from "node:test";
import assert from "node:assert/strict";
import type { MissionCheckpoint } from "../src/lib/store.ts";
import { evaluateCheckpoint, type SafetyCheckState } from "../src/lib/mission/checkpointEval.ts";

const NO_SAFETY: SafetyCheckState = { lookedLeft: false, lookedRight: false };

function cp(overrides: Partial<MissionCheckpoint> & Pick<MissionCheckpoint, "type">): MissionCheckpoint {
  return { id: "c1", position: [0, 0, 0], radius: 4, ...overrides };
}

test("stop: in zone + nearly stopped -> cleared with EN feedback", () => {
  const r = evaluateCheckpoint({
    checkpoint: cp({ type: "stop", label: "一時停止" }),
    position: { x: 0, z: 0 }, headYaw: 0, speed: 0.01, language: "en", safety: NO_SAFETY,
  });
  assert.equal(r.cleared, true);
  assert.equal(r.feedback, "🛑 Stop OK!");
});

test("stop: JA feedback uses the label", () => {
  const r = evaluateCheckpoint({
    checkpoint: cp({ type: "stop", label: "踏切前一時停止" }),
    position: { x: 0, z: 0 }, headYaw: 0, speed: 0, language: "ja", safety: NO_SAFETY,
  });
  assert.equal(r.feedback, "🛑 踏切前一時停止 OK!");
});

test("stop: in zone but still moving (speed >= 0.02) -> not cleared", () => {
  const r = evaluateCheckpoint({
    checkpoint: cp({ type: "stop" }),
    position: { x: 0, z: 0 }, headYaw: 0, speed: 0.05, language: "en", safety: NO_SAFETY,
  });
  assert.equal(r.cleared, false);
  assert.equal(r.feedback, null);
});

test("stop: outside radius -> not cleared", () => {
  const r = evaluateCheckpoint({
    checkpoint: cp({ type: "stop", radius: 4 }),
    position: { x: 0, z: -10 }, headYaw: 0, speed: 0, language: "en", safety: NO_SAFETY,
  });
  assert.equal(r.cleared, false);
});

test("safety-check: clears only after looking BOTH ways, then resets safety", () => {
  const base = { checkpoint: cp({ type: "safety-check", radius: 6, label: "安全確認" }), position: { x: 0, z: 0 }, speed: 0, language: "en" as const };
  // Look left only.
  const r1 = evaluateCheckpoint({ ...base, headYaw: 0.5, safety: NO_SAFETY });
  assert.equal(r1.cleared, false);
  assert.deepEqual(r1.safety, { lookedLeft: true, lookedRight: false });
  // Then look right -> both -> cleared, safety reset.
  const r2 = evaluateCheckpoint({ ...base, headYaw: -0.5, safety: r1.safety });
  assert.equal(r2.cleared, true);
  assert.equal(r2.feedback, "👀 Left-Right Check OK!");
  assert.deepEqual(r2.safety, { lookedLeft: false, lookedRight: false });
});

test("safety-check: yaw within the deadband does not latch either flag", () => {
  const r = evaluateCheckpoint({
    checkpoint: cp({ type: "safety-check", radius: 6 }),
    position: { x: 0, z: 0 }, headYaw: 0.1, speed: 0, language: "en", safety: NO_SAFETY,
  });
  assert.deepEqual(r.safety, { lookedLeft: false, lookedRight: false });
});

test("safety-check: leaving the zone (dist > radius+2) resets accumulated looks", () => {
  const r = evaluateCheckpoint({
    checkpoint: cp({ type: "safety-check", radius: 6 }),
    position: { x: 0, z: -9 }, headYaw: 0, speed: 0, language: "en",
    safety: { lookedLeft: true, lookedRight: false },
  });
  assert.deepEqual(r.safety, { lookedLeft: false, lookedRight: false });
  assert.equal(r.cleared, false);
});

test("safety-check: just outside radius but within +2 keeps accumulated looks", () => {
  // radius 6, dist 7 (between 6 and 8) -> no clear, no reset
  const r = evaluateCheckpoint({
    checkpoint: cp({ type: "safety-check", radius: 6 }),
    position: { x: 0, z: -7 }, headYaw: 0, speed: 0, language: "en",
    safety: { lookedLeft: true, lookedRight: false },
  });
  assert.deepEqual(r.safety, { lookedLeft: true, lookedRight: false });
});

test("mirror: cleared when yaw within 0.5 of targetYaw, literal feedback", () => {
  const r = evaluateCheckpoint({
    checkpoint: cp({ type: "mirror", radius: 6, targetYaw: -0.5 }),
    position: { x: 0, z: 0 }, headYaw: -0.3, speed: 0, language: "ja", safety: NO_SAFETY,
  });
  assert.equal(r.cleared, true);
  assert.equal(r.feedback, "👀 Check OK!");
});

test("mirror: not cleared when yaw outside tolerance", () => {
  const r = evaluateCheckpoint({
    checkpoint: cp({ type: "mirror", radius: 6, targetYaw: -0.5 }),
    position: { x: 0, z: 0 }, headYaw: 0.5, speed: 0, language: "en", safety: NO_SAFETY,
  });
  assert.equal(r.cleared, false);
});
