/**
 * P7a — pure lesson catalog + briefing lookup for the PlayCanvas product shell.
 *
 * Rewritten for the E2 branch (D1.a), but the CONTENT is not open for redesign:
 * the trial already settled the wording — course titles/descriptions verbatim
 * from the original `ClientApp.tsx` MISSION_INFO, home-card labels from the
 * original `HomeScreen.tsx` with E1's FINAL fixes applied (traffic-light ja
 * label unified to 「信号機」, card descriptions localized ja/en instead of
 * English-only) — and technical tokens (LEVEL 01, BASIC, FREE) stay English in
 * both languages. Free of playcanvas/browser/firebase/three imports so
 * `node --test` exercises it directly (the store imports three+firebase, hence
 * the type-only import below).
 */

// Type-only: erased at runtime, so this module carries no store dependency.
import type { LessonId } from "./store";

export type Language = "ja" | "en";

/** A ja/en string pair. */
export interface Localized {
  ja: string;
  en: string;
}

/** Pre-drive briefing content for a graded lesson. */
export interface LessonBriefing {
  title: Localized;
  desc: Localized;
}

/** All graded lessons (every LessonId except free-mode, which has no briefing). */
export type GradedLessonId = Exclude<LessonId, "free-mode">;

/**
 * Briefing title + description per graded lesson. Wording is the settled
 * original MISSION_INFO content (see module header).
 */
export const LESSON_BRIEFINGS: Record<GradedLessonId, LessonBriefing> = {
  straight: {
    title: { ja: "直線走行", en: "Straight Driving" },
    desc: {
      ja: "基本の直線走行です。ハンドルを安定させ、一定の速度で走り抜けましょう。",
      en: "Basic straight-line driving. Keep the wheel steady and drive through at a constant speed.",
    },
  },
  "left-turn": {
    title: { ja: "左折", en: "Left Turn" },
    desc: {
      ja: "交差点を左折します。停止線で一時停止し、ミラーで左右の安全を確認してから、巻き込みに注意して曲がりましょう。",
      en: "Turn left at the intersection. Stop at the line and do a mirror safety check before turning, and watch for cyclists and pedestrians on the inside.",
    },
  },
  "right-turn": {
    title: { ja: "右折", en: "Right Turn" },
    desc: {
      ja: "交差点を右折します。停止線で一時停止し、ミラーで左右の安全を確認してから、中心のすぐ内側を通るように曲がりましょう。",
      en: "Turn right at the intersection. Stop at the line and do a mirror safety check before turning, aiming to pass just inside the center.",
    },
  },
  "s-curve": {
    title: { ja: "S字カーブ", en: "S-Curve" },
    desc: {
      ja: "S字型の狭路です。内輪差・外輪差を考慮し、脱輪しないように慎重に進みましょう。",
      en: "A narrow S-shaped lane. Account for the difference in the path of the inner and outer wheels and proceed carefully to avoid going off the track.",
    },
  },
  crank: {
    title: { ja: "クランク", en: "Crank" },
    desc: {
      ja: "直角に曲がる狭路です。車両感覚を研ぎ澄まし、適切なタイミングでハンドルを切りましょう。",
      en: "A narrow lane with right-angle turns. Sharpen your sense of the vehicle and turn the wheel at the right moment.",
    },
  },
  "traffic-light": {
    title: { ja: "信号機", en: "Traffic Light" },
    desc: {
      ja: "信号のある交差点です。赤信号で停止し、青になったら発進しましょう。",
      en: "An intersection with a traffic light. Stop on red and set off once it turns green.",
    },
  },
  crosswalk: {
    title: { ja: "横断歩道", en: "Crosswalk" },
    desc: {
      ja: "横断歩道があります。歩行者が渡ろうとしている時は、必ず停止線の手前で一時停止しましょう。",
      en: "There is a crosswalk ahead. When a pedestrian is about to cross, always come to a stop before the stop line.",
    },
  },
  "railroad-crossing": {
    title: { ja: "踏切", en: "Railroad Crossing" },
    desc: {
      ja: "前方に踏切があります。必ず一時停止し、左右の安全を確認してから通過してください。警報機が鳴っている場合は進入してはいけません。",
      en: "There is a railroad crossing ahead. Always come to a stop, check that it is safe on both sides, and then proceed. Do not enter while the warning bell is sounding.",
    },
  },
};

/** How selecting a Home card routes. */
export type HomeCardKind = "lesson" | "free" | "tutorial";

/** One selectable card on the Home screen. */
export interface HomeCard {
  /** LessonId for lesson/free cards; "tutorial" routes to the tutorial screen. */
  id: LessonId | "tutorial";
  label: Localized;
  /** Technical token (course level / mode tag) — stays English in both languages. */
  sub: string;
  /** Short card one-liner, localized. */
  desc: Localized;
  kind: HomeCardKind;
}

/**
 * Ordered Home cards: tutorial, the eight graded courses (LEVEL 01–08), then
 * free mode — the original ordering with E1's final localized card text.
 */
export const HOME_CARDS: readonly HomeCard[] = [
  { id: "tutorial", label: { ja: "チュートリアル", en: "Tutorial" }, sub: "BASIC", desc: { ja: "操作を学ぶ", en: "LEARN CONTROLS" }, kind: "tutorial" },
  { id: "straight", label: { ja: "直線走行", en: "Straight Driving" }, sub: "LEVEL 01", desc: { ja: "基本操作", en: "BASIC CONTROL" }, kind: "lesson" },
  { id: "left-turn", label: { ja: "左折", en: "Left Turn" }, sub: "LEVEL 02", desc: { ja: "左折の練習", en: "TURNING LEFT" }, kind: "lesson" },
  { id: "right-turn", label: { ja: "右折", en: "Right Turn" }, sub: "LEVEL 03", desc: { ja: "右折の練習", en: "TURNING RIGHT" }, kind: "lesson" },
  { id: "s-curve", label: { ja: "S字カーブ", en: "S-Curve" }, sub: "LEVEL 04", desc: { ja: "S字カーブ走行", en: "S-CURVE" }, kind: "lesson" },
  { id: "crank", label: { ja: "クランク", en: "Crank" }, sub: "LEVEL 05", desc: { ja: "クランク走行", en: "CRANK" }, kind: "lesson" },
  { id: "traffic-light", label: { ja: "信号機", en: "Traffic Light" }, sub: "LEVEL 06", desc: { ja: "信号機の練習", en: "TRAFFIC LIGHT PRACTICE" }, kind: "lesson" },
  { id: "crosswalk", label: { ja: "横断歩道", en: "Crosswalk" }, sub: "LEVEL 07", desc: { ja: "歩行者優先", en: "STOP FOR PEDESTRIANS" }, kind: "lesson" },
  { id: "railroad-crossing", label: { ja: "踏切", en: "Railroad Crossing" }, sub: "LEVEL 08", desc: { ja: "踏切の通過", en: "RAILROAD CROSSING" }, kind: "lesson" },
  { id: "free-mode", label: { ja: "フリーモード", en: "Free Mode" }, sub: "FREE", desc: { ja: "街を自由に走行", en: "EXPLORE THE CITY" }, kind: "free" },
] as const;

export const FREE_MODE_TITLE: Localized = { ja: "フリーモード", en: "Free Mode" };

/**
 * Localized display title for any lesson (drive HUD subtitle etc.). Graded
 * lessons reuse their briefing title; free-mode has its own.
 */
export function getLessonTitle(lesson: LessonId, language: Language): string {
  if (lesson === "free-mode") return FREE_MODE_TITLE[language];
  return LESSON_BRIEFINGS[lesson].title[language];
}

/**
 * Briefing for a lesson in the given language, or null when the lesson has no
 * briefing (free-mode) so the shell can skip the overlay cleanly.
 */
export function getBriefing(
  lesson: LessonId,
  language: Language,
): { title: string; desc: string } | null {
  if (lesson === "free-mode") return null;
  const b = LESSON_BRIEFINGS[lesson];
  return { title: b.title[language], desc: b.desc[language] };
}
