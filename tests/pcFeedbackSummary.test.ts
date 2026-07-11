import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEVIATION_FEEDBACK_THRESHOLD,
  deviationFeedbackPoint,
  isCleanRun,
} from "../src/lib/pcFeedbackSummary.ts";

// Task 2 — a wander-heavy run (deviationPenalty high) produces NO kaizen log,
// so kaizenLogs.length === 0 used to read as "excellent drive" even at score 0.
// These pure helpers decide when a run is truly clean and surface a
// "you drifted from the course" point when it isn't.

test("clean run: no deviation, no kaizen -> isCleanRun true, no deviation point", () => {
  assert.equal(isCleanRun(0, 0), true);
  assert.equal(deviationFeedbackPoint(0, "en"), null);
});

test("below threshold: minor deviation still reads as clean", () => {
  assert.equal(deviationFeedbackPoint(3, "en"), null);
  assert.equal(isCleanRun(0, 3), true);
});

test("at/above threshold: deviation point appears (both languages) and run is not clean", () => {
  assert.notEqual(deviationFeedbackPoint(DEVIATION_FEEDBACK_THRESHOLD, "en"), null);
  assert.notEqual(deviationFeedbackPoint(20, "en"), null);
  assert.notEqual(deviationFeedbackPoint(DEVIATION_FEEDBACK_THRESHOLD, "ja"), null);
  assert.notEqual(deviationFeedbackPoint(20, "ja"), null);
  assert.equal(isCleanRun(0, 20), false);
});

test("kaizen present: run is not clean even with zero deviation", () => {
  assert.equal(isCleanRun(2, 0), false);
});

test("bilingual: en and ja deviation messages differ and are non-empty", () => {
  const en = deviationFeedbackPoint(20, "en");
  const ja = deviationFeedbackPoint(20, "ja");
  assert.ok(en && en.length > 0);
  assert.ok(ja && ja.length > 0);
  assert.notEqual(en, ja);
});
