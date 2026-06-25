import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { calculateMissionScore } from "../src/lib/scoring.ts";
import type { MissionScoreInput } from "../src/lib/scoring.ts";
import type { ReplayFrame } from "../src/lib/store.ts";

// A course path collapsed to a single point at the origin: a frame at (0,0,0)
// is exactly on-path (zero deviation); distance from the origin is the
// deviation for any other frame.
const originPath = { getPointAt: () => new THREE.Vector3(0, 0, 0) };

function frame(overrides: Partial<ReplayFrame> = {}): ReplayFrame {
  return {
    timestamp: 0,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    steering: 0,
    speed: 0,
    headRotation: { pitch: 0, yaw: 0, roll: 0 },
    ...overrides,
  };
}

function baseInput(overrides: Partial<MissionScoreInput> = {}): MissionScoreInput {
  return {
    lesson: "crank",
    frames: [],
    coursePath: originPath,
    signalStateLogs: [],
    lessonCheckpoints: [],
    activeCheckpoints: [],
    clearedCheckpointIds: [],
    language: "en",
    now: 1000,
    ...overrides,
  };
}

test("free-mode is not scored", () => {
  const result = calculateMissionScore(
    baseInput({ lesson: "free-mode", frames: [frame({ position: [99, 0, 0] })] }),
  );
  assert.equal(result.addedDeviationPenalty, 0);
  assert.deepEqual(result.newFeedbackLogs, []);
});

test("a frame on the path adds no deviation penalty", () => {
  const result = calculateMissionScore(baseInput({ frames: [frame({ position: [0, 0, 0] })] }));
  assert.equal(result.addedDeviationPenalty, 0);
  assert.deepEqual(result.newFeedbackLogs, []);
});

test("a frame off the path adds a deviation penalty (1.0 + (dist - 2.5) * 0.2)", () => {
  // dist = 10 -> 1.0 + (10 - 2.5) * 0.2 = 2.5
  const result = calculateMissionScore(baseInput({ frames: [frame({ position: [10, 0, 0] })] }));
  assert.equal(result.addedDeviationPenalty, 2.5);
});

test("a frame within the penalty distance is not penalized", () => {
  // dist = 2.0 < 2.5 threshold
  const result = calculateMissionScore(baseInput({ frames: [frame({ position: [2, 0, 0] })] }));
  assert.equal(result.addedDeviationPenalty, 0);
});

test("more than 30 speeding frames produce a speeding KAIZEN log", () => {
  // crank limit = 20; violation when speed > 25
  const frames = Array.from({ length: 31 }, () => frame({ speed: 30 }));
  const result = calculateMissionScore(baseInput({ frames }));
  const speeding = result.newFeedbackLogs.find((l) => l.message.includes("Speeding"));
  assert.ok(speeding, "expected a speeding KAIZEN log");
  assert.equal(speeding!.type, "KAIZEN");
  assert.match(speeding!.message, /20 km\/h/);
});

test("exactly 30 speeding frames do NOT trigger the log (threshold is > 30)", () => {
  const frames = Array.from({ length: 30 }, () => frame({ speed: 30 }));
  const result = calculateMissionScore(baseInput({ frames }));
  assert.equal(result.newFeedbackLogs.length, 0);
});

test("speeding log is localized to Japanese", () => {
  const frames = Array.from({ length: 31 }, () => frame({ speed: 30 }));
  const result = calculateMissionScore(baseInput({ frames, language: "ja" }));
  const speeding = result.newFeedbackLogs.find((l) => l.message.includes("速度超過"));
  assert.ok(speeding, "expected a Japanese speeding KAIZEN log");
});

test("a missed required-stop checkpoint adds 20 points and a KAIZEN log", () => {
  const cp = { id: "cp1", type: "stop" as const, position: [0, 0, 0] as [number, number, number], radius: 1, label: "一時停止" };
  const result = calculateMissionScore(baseInput({ activeCheckpoints: [cp], clearedCheckpointIds: [] }));
  assert.equal(result.addedDeviationPenalty, 20);
  const missed = result.newFeedbackLogs.find((l) => l.message === "You ignored a required stop");
  assert.ok(missed, "expected a missed-stop KAIZEN log");
});

test("a cleared checkpoint is not penalized", () => {
  const cp = { id: "cp1", type: "stop" as const, position: [0, 0, 0] as [number, number, number], radius: 1, label: "一時停止" };
  const result = calculateMissionScore(baseInput({ activeCheckpoints: [cp], clearedCheckpointIds: ["cp1"] }));
  assert.equal(result.addedDeviationPenalty, 0);
  assert.deepEqual(result.newFeedbackLogs, []);
});

test("a missed safety-check checkpoint is localized to Japanese using its label", () => {
  const cp = { id: "sc1", type: "safety-check" as const, position: [0, 0, 0] as [number, number, number], radius: 1, label: "右後方確認" };
  const result = calculateMissionScore(baseInput({ language: "ja", activeCheckpoints: [cp] }));
  const missed = result.newFeedbackLogs.find((l) => l.message === "右後方確認を行いませんでした");
  assert.ok(missed, "expected a Japanese missed safety-check log");
});

test("crossing a red light without stopping long enough is a signal violation", () => {
  const tl = {
    id: "tl1",
    type: "stop" as const,
    visual: "traffic-light" as const,
    position: [0, 0, 0] as [number, number, number],
    radius: 2,
    minDuration: 1000,
  };
  const frames = [
    frame({ timestamp: 0, position: [0, 0, 5], speed: 30 }), // approaching, outside radius
    frame({ timestamp: 100, position: [0, 0, 0], speed: 30 }), // crossing, never slowed
  ];
  const result = calculateMissionScore(
    baseInput({
      frames,
      lessonCheckpoints: [tl],
      signalStateLogs: [{ time: 50, checkpointId: "tl1", state: "red" }],
    }),
  );
  const signal = result.newFeedbackLogs.find((l) => l.message.includes("red light"));
  assert.ok(signal, "expected a red-light KAIZEN log");
  assert.deepEqual(signal!.meta, { penalty: 10, signalViolations: 1 });
});

test("crossing on green is not a violation", () => {
  const tl = {
    id: "tl1",
    type: "stop" as const,
    visual: "traffic-light" as const,
    position: [0, 0, 0] as [number, number, number],
    radius: 2,
    minDuration: 1000,
  };
  const frames = [frame({ timestamp: 100, position: [0, 0, 0], speed: 30 })];
  const result = calculateMissionScore(
    baseInput({
      frames,
      lessonCheckpoints: [tl],
      signalStateLogs: [{ time: 50, checkpointId: "tl1", state: "green" }],
    }),
  );
  const signal = result.newFeedbackLogs.find((l) => l.message.includes("red light"));
  assert.equal(signal, undefined);
});

test("uses the injected timestamp for log entries", () => {
  const frames = Array.from({ length: 31 }, () => frame({ speed: 30 }));
  const result = calculateMissionScore(baseInput({ frames, now: 424242 }));
  assert.equal(result.newFeedbackLogs[0].time, 424242);
});
