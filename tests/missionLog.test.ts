import { test } from "node:test";
import assert from "node:assert/strict";

import { buildMissionLog, getScoreRank } from "../src/lib/missionLog.ts";

// B10 — the Firestore mission_logs record builder must reproduce the ORIGINAL
// app's save semantics exactly (src/components/ui/FeedbackScreen.tsx
// saveResultToFirestore): same fields, same score formula, same mm:ss clear
// time (the saved record has NO centiseconds, unlike the on-screen display),
// same first-kaizen summary strings — so records written by the Babylon port
// are indistinguishable from the original's and pass the same deployed
// owner-isolation rules on the `mission_logs` collection.

const baseInput = {
  userId: "uid-1",
  lesson: "s-curve",
  timestamp: 1_700_000_000_000,
  language: "ja" as const,
  feedbackLogs: [],
  deviationPenalty: 0,
  missionStartTime: 1_700_000_000_000,
  missionEndTime: 1_700_000_083_456, // +83.456s -> 01:23 (floor, no centiseconds)
};

test("perfect run: score 100, mm:ss clear time, 'great drive' summary (ja)", () => {
  const log = buildMissionLog(baseInput);
  assert.deepEqual(log, {
    userId: "uid-1",
    timestamp: 1_700_000_000_000,
    lesson: "s-curve",
    score: 100,
    clearTime: "01:23",
    feedbackSummary: "素晴らしい走行でした",
  });
});

test("english summary for a perfect run", () => {
  const log = buildMissionLog({ ...baseInput, language: "en" });
  assert.equal(log.feedbackSummary, "A great drive");
});

test("kaizen logs: numeric meta.penalty summed, non-numeric defaults to 5", () => {
  const log = buildMissionLog({
    ...baseInput,
    feedbackLogs: [
      { type: "KAIZEN", message: "一時停止を守りましょう", meta: { penalty: 20 } },
      { type: "KAIZEN", message: "速度超過です", meta: {} }, // -> default 5
      { type: "KAIZEN", message: "ふらつきに注意", meta: { penalty: "x" } }, // -> default 5
      { type: "GOOD", message: "ナイス", meta: { penalty: 50 } }, // ignored (not KAIZEN)
    ],
  });
  assert.equal(log.score, 100 - 20 - 5 - 5);
});

test("summary uses the FIRST kaizen message plus the localized 'more' suffix", () => {
  const logs = [
    { type: "KAIZEN", message: "一時停止を守りましょう", meta: { penalty: 20 } },
    { type: "KAIZEN", message: "速度超過です" },
  ];
  assert.equal(
    buildMissionLog({ ...baseInput, feedbackLogs: logs }).feedbackSummary,
    "一時停止を守りましょう 他",
  );
  assert.equal(
    buildMissionLog({ ...baseInput, feedbackLogs: logs, language: "en" }).feedbackSummary,
    "一時停止を守りましょう and more",
  );
});

test("deviation penalty is floored and combined; score clamps at 0", () => {
  assert.equal(
    buildMissionLog({ ...baseInput, deviationPenalty: 12.9 }).score,
    100 - 12,
  );
  assert.equal(
    buildMissionLog({
      ...baseInput,
      deviationPenalty: 80,
      feedbackLogs: [{ type: "KAIZEN", message: "m", meta: { penalty: 40 } }],
    }).score,
    0,
  );
});

test("clear time pads minutes and seconds to two digits and floors seconds", () => {
  const at = (ms: number) =>
    buildMissionLog({ ...baseInput, missionEndTime: baseInput.missionStartTime + ms }).clearTime;
  assert.equal(at(0), "00:00");
  assert.equal(at(999), "00:00");
  assert.equal(at(59_999), "00:59");
  assert.equal(at(60_000), "01:00");
  assert.equal(at(605_000), "10:05");
});

// History screen rank badge (original ui/HistoryScreen.tsx getScoreRank).
test("score ranks match the original thresholds", () => {
  assert.equal(getScoreRank(100), "S");
  assert.equal(getScoreRank(90), "S");
  assert.equal(getScoreRank(89), "A");
  assert.equal(getScoreRank(80), "A");
  assert.equal(getScoreRank(79), "B");
  assert.equal(getScoreRank(70), "B");
  assert.equal(getScoreRank(69), "C");
  assert.equal(getScoreRank(60), "C");
  assert.equal(getScoreRank(59), "D");
  assert.equal(getScoreRank(0), "D");
});
