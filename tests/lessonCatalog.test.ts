import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LESSON_BRIEFINGS,
  HOME_ENTRIES,
  getBriefing,
} from "../src/lib/lessonCatalog.ts";

// The eight graded courses (every LessonId except "free-mode"). Kept literal so
// the test fails loudly if a lesson is dropped from the catalog.
const GRADED_LESSONS = [
  "straight",
  "left-turn",
  "right-turn",
  "s-curve",
  "crank",
  "traffic-light",
  "crosswalk",
  "railroad-crossing",
] as const;

test("every graded lesson has a briefing with non-empty ja + en title and desc", () => {
  for (const id of GRADED_LESSONS) {
    const b = LESSON_BRIEFINGS[id];
    assert.ok(b, `missing briefing for ${id}`);
    assert.ok(b.title.ja.length > 0, `${id} ja title empty`);
    assert.ok(b.title.en.length > 0, `${id} en title empty`);
    assert.ok(b.desc.ja.length > 0, `${id} ja desc empty`);
    assert.ok(b.desc.en.length > 0, `${id} en desc empty`);
  }
});

test("LESSON_BRIEFINGS has exactly the eight graded lessons (no free-mode)", () => {
  const keys = Object.keys(LESSON_BRIEFINGS).sort();
  assert.deepEqual(keys, [...GRADED_LESSONS].sort());
});

test("HOME_ENTRIES contains tutorial, all eight courses, and free-mode", () => {
  const ids = HOME_ENTRIES.map((e) => e.id);
  assert.ok(ids.includes("tutorial"), "tutorial entry missing");
  assert.ok(ids.includes("free-mode"), "free-mode entry missing");
  for (const id of GRADED_LESSONS) {
    assert.ok(ids.includes(id), `home entry missing ${id}`);
  }
  // tutorial + 8 courses + free-mode
  assert.equal(HOME_ENTRIES.length, GRADED_LESSONS.length + 2);
});

test("HOME_ENTRIES kind matches id semantics", () => {
  for (const e of HOME_ENTRIES) {
    if (e.id === "tutorial") assert.equal(e.kind, "tutorial");
    else if (e.id === "free-mode") assert.equal(e.kind, "free");
    else assert.equal(e.kind, "lesson");
    assert.ok(e.label.ja.length > 0 && e.label.en.length > 0, `${e.id} label missing a language`);
  }
});

test("getBriefing returns the requested language", () => {
  const en = getBriefing("straight", "en");
  const ja = getBriefing("straight", "ja");
  assert.equal(en?.title, "Straight Driving");
  assert.equal(ja?.title, "直線走行");
  assert.notEqual(en?.desc, ja?.desc);
});

test("getBriefing returns null for free-mode (no briefing)", () => {
  assert.equal(getBriefing("free-mode", "en"), null);
  assert.equal(getBriefing("free-mode", "ja"), null);
});
