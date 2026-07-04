import { test } from "node:test";
import assert from "node:assert/strict";

import {
  HOME_CARDS,
  LESSON_BRIEFINGS,
  getBriefing,
  getLessonTitle,
} from "../src/lib/pcLessonCatalog.ts";

const NINE_LESSON_IDS = [
  "free-mode",
  "straight",
  "s-curve",
  "crank",
  "left-turn",
  "right-turn",
  "traffic-light",
  "crosswalk",
  "railroad-crossing",
] as const;

// ─── Home cards ──────────────────────────────────────────────────────────────
test("home cards cover all nine LessonIds plus the tutorial card", () => {
  const ids = HOME_CARDS.map((c) => c.id);
  for (const id of NINE_LESSON_IDS) assert.ok(ids.includes(id), `missing card: ${id}`);
  assert.ok(ids.includes("tutorial"), "missing tutorial card");
  assert.equal(HOME_CARDS.length, 10);
});

test("home card order: tutorial first, free-mode last (original ordering)", () => {
  assert.equal(HOME_CARDS[0].id, "tutorial");
  assert.equal(HOME_CARDS[HOME_CARDS.length - 1].id, "free-mode");
});

test("card kinds route correctly: tutorial / free / lesson", () => {
  for (const c of HOME_CARDS) {
    const expected = c.id === "tutorial" ? "tutorial" : c.id === "free-mode" ? "free" : "lesson";
    assert.equal(c.kind, expected, `card ${c.id}`);
  }
});

test("every card is fully localized: label + desc have both ja and en", () => {
  for (const c of HOME_CARDS) {
    assert.ok(c.label.ja.length > 0 && c.label.en.length > 0, `label ${c.id}`);
    assert.ok(c.desc.ja.length > 0 && c.desc.en.length > 0, `desc ${c.id}`);
  }
});

test("technical sub tokens stay English (LEVEL nn / BASIC / FREE)", () => {
  for (const c of HOME_CARDS) {
    assert.match(c.sub, /^(LEVEL \d\d|BASIC|FREE)$/, `sub ${c.id}: ${c.sub}`);
  }
});

test("settled wording: traffic-light ja label is 信号機 (not 信号)", () => {
  const card = HOME_CARDS.find((c) => c.id === "traffic-light")!;
  assert.equal(card.label.ja, "信号機");
  assert.equal(LESSON_BRIEFINGS["traffic-light"].title.ja, "信号機");
});

// ─── Briefings ───────────────────────────────────────────────────────────────
test("all eight graded lessons have localized briefings; free-mode has none", () => {
  for (const id of NINE_LESSON_IDS) {
    if (id === "free-mode") {
      assert.equal(getBriefing(id, "ja"), null);
      assert.equal(getBriefing(id, "en"), null);
      continue;
    }
    for (const lang of ["ja", "en"] as const) {
      const b = getBriefing(id, lang);
      assert.ok(b, `briefing ${id} ${lang}`);
      assert.ok(b!.title.length > 0 && b!.desc.length > 0, `briefing text ${id} ${lang}`);
    }
  }
});

test("getBriefing resolves the settled original wording (straight, both languages)", () => {
  assert.deepEqual(getBriefing("straight", "en"), {
    title: "Straight Driving",
    desc: "Basic straight-line driving. Keep the wheel steady and drive through at a constant speed.",
  });
  assert.equal(getBriefing("straight", "ja")!.title, "直線走行");
});

// ─── Titles ──────────────────────────────────────────────────────────────────
test("getLessonTitle works for every LessonId including free-mode", () => {
  assert.equal(getLessonTitle("free-mode", "ja"), "フリーモード");
  assert.equal(getLessonTitle("free-mode", "en"), "Free Mode");
  assert.equal(getLessonTitle("crank", "en"), "Crank");
  assert.equal(getLessonTitle("railroad-crossing", "ja"), "踏切");
});
