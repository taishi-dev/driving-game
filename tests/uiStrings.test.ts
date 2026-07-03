import { test } from "node:test";
import assert from "node:assert/strict";

import { COMMON_STRINGS, CHECKPOINT_NAMES } from "../src/lib/uiStrings.ts";
import { MISSION_CHECKPOINTS } from "../src/lib/mission/missions.ts";

// Completeness test (lessonCatalog pattern): every shared string must have a
// non-empty ja AND en value, so a screen switching `language` never falls back
// to an empty string in either direction.
test("every COMMON_STRINGS entry has non-empty ja and en", () => {
  for (const [key, value] of Object.entries(COMMON_STRINGS)) {
    assert.ok(typeof value.ja === "string" && value.ja.length > 0, `${key} missing ja`);
    assert.ok(typeof value.en === "string" && value.en.length > 0, `${key} missing en`);
  }
});

test("COMMON_STRINGS has the expected shared keys", () => {
  const keys = Object.keys(COMMON_STRINGS).sort();
  assert.deepEqual(keys, ["appTitle", "backToHome"].sort());
});

test("appTitle matches the canonical branding used across screens", () => {
  assert.equal(COMMON_STRINGS.appTitle.ja, "バーチャル教習所");
  assert.equal(COMMON_STRINGS.appTitle.en, "Virtual Driving School");
});

test("backToHome uses the canonical wording (not the drifted 'ホームへ戻る' variant)", () => {
  assert.equal(COMMON_STRINGS.backToHome.ja, "ホームに戻る");
  assert.equal(COMMON_STRINGS.backToHome.en, "Back to Home");
});

// Feedback renders CHECKPOINT_NAMES[cp.id] for every scored, non-traffic-light
// checkpoint (the same filter the feedback screen uses). Every such checkpoint
// in the FROZEN missions table must have a non-empty ja + en name, so no row
// ever falls back to the mixed-language `cp.label`.
test("CHECKPOINT_NAMES covers every scored checkpoint in the missions table, in both languages", () => {
  for (const [lesson, checkpoints] of Object.entries(MISSION_CHECKPOINTS)) {
    for (const cp of checkpoints) {
      if (cp.scored === false || cp.visual === "traffic-light") continue;
      const name = CHECKPOINT_NAMES[cp.id];
      assert.ok(name, `missing CHECKPOINT_NAMES entry for ${lesson}/${cp.id}`);
      assert.ok(name.ja.length > 0, `${lesson}/${cp.id} name missing ja`);
      assert.ok(name.en.length > 0, `${lesson}/${cp.id} name missing en`);
    }
  }
});

test("every CHECKPOINT_NAMES entry has non-empty ja and en", () => {
  for (const [key, value] of Object.entries(CHECKPOINT_NAMES)) {
    assert.ok(value.ja.length > 0, `${key} missing ja`);
    assert.ok(value.en.length > 0, `${key} missing en`);
  }
});
