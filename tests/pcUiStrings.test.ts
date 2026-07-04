import { test } from "node:test";
import assert from "node:assert/strict";

import { SHELL_STRINGS, CHECKPOINT_NAMES } from "../src/components/playcanvas/product/productStrings.ts";
import { MISSION_CHECKPOINTS } from "../src/lib/mission/missions.ts";

// P9 — parity tests for the pure shared-strings module (mirrors the
// `pcLessonCatalog.test.ts` / E1 `uiStrings.test.ts` pattern): every shared
// string must have a non-empty ja AND en value, so a screen switching
// `language` never falls back to an empty string in either direction.
test("every SHELL_STRINGS key has non-empty ja and en, and both languages declare the same key set", () => {
  const jaKeys = Object.keys(SHELL_STRINGS.ja).sort();
  const enKeys = Object.keys(SHELL_STRINGS.en).sort();
  assert.deepEqual(jaKeys, enKeys, "ja/en key sets diverged");

  for (const key of jaKeys) {
    const jaVal = (SHELL_STRINGS.ja as Record<string, string>)[key];
    const enVal = (SHELL_STRINGS.en as Record<string, string>)[key];
    assert.ok(typeof jaVal === "string" && jaVal.length > 0, `${key} missing ja`);
    assert.ok(typeof enVal === "string" && enVal.length > 0, `${key} missing en`);
  }
});

// Settled trial-wide convention (E1 canon): the DRIVING screen's exit uses the
// へ particle; every other screen's back-home action uses the に particle.
test("settled wording: exitHome uses へ (driving screen only), backHome uses に (everywhere else)", () => {
  assert.match(SHELL_STRINGS.ja.exitHome, /ホームへ戻る/);
  assert.match(SHELL_STRINGS.ja.backHome, /ホームに戻る/);
  assert.equal(SHELL_STRINGS.en.exitHome, "✕ Back to Home");
  assert.equal(SHELL_STRINGS.en.backHome, "Back to Home");
});

// Technical tokens stay English in both languages (settled convention).
test("technical tokens (speedUnit) stay English in both languages", () => {
  assert.equal(SHELL_STRINGS.ja.speedUnit, "km/h");
  assert.equal(SHELL_STRINGS.en.speedUnit, "km/h");
});

// P9 fix: the Ammo physics gate (DriveCanvas) and the top-level error boundary
// (ProductApp) were English-only in both languages before this pass.
test("physics-gate and error-boundary strings are localized (P9 fix, not English-only)", () => {
  for (const key of ["physicsLoading", "physicsFailedPrefix", "errorTitle", "errorBody"] as const) {
    assert.notEqual(SHELL_STRINGS.ja[key], SHELL_STRINGS.en[key], `${key} identical ja/en — likely untranslated`);
  }
});

// Feedback renders CHECKPOINT_NAMES[cp.id] for every scored, non-traffic-light
// checkpoint (the same filter FeedbackScreen.tsx uses). Every such checkpoint
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
