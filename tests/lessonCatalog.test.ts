import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LESSON_BRIEFINGS,
  HOME_ENTRIES,
  getBriefing,
  getLessonTitle,
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

// B9 defect 1: card `desc` used to be an English-only string. Every entry's
// desc must now be localized in both directions.
test("HOME_ENTRIES desc is localized (non-empty ja + en) for every entry", () => {
  for (const e of HOME_ENTRIES) {
    assert.ok(e.desc.ja.length > 0, `${e.id} desc missing ja`);
    assert.ok(e.desc.en.length > 0, `${e.id} desc missing en`);
  }
});

// B9 defect 2: the traffic-light card used to say "信号" while the briefing
// said "信号機" (ja label drift). They must now agree on "信号機".
test("traffic-light ja label matches its briefing title (no ja label drift)", () => {
  const entry = HOME_ENTRIES.find((e) => e.id === "traffic-light");
  assert.ok(entry, "traffic-light entry missing");
  assert.equal(entry.label.ja, LESSON_BRIEFINGS["traffic-light"].title.ja);
  assert.equal(entry.label.ja, "信号機");
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

test("getLessonTitle returns the localized title for every graded lesson", () => {
  for (const id of GRADED_LESSONS) {
    assert.equal(getLessonTitle(id, "en"), LESSON_BRIEFINGS[id].title.en);
    assert.equal(getLessonTitle(id, "ja"), LESSON_BRIEFINGS[id].title.ja);
    assert.ok(getLessonTitle(id, "en").length > 0);
    assert.ok(getLessonTitle(id, "ja").length > 0);
  }
});

test("getLessonTitle returns a localized Free Mode title (never the raw id)", () => {
  assert.equal(getLessonTitle("free-mode", "en"), "Free Mode");
  assert.equal(getLessonTitle("free-mode", "ja"), "フリーモード");
  assert.notEqual(getLessonTitle("free-mode", "en"), "free-mode");
});
