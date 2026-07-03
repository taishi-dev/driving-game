/**
 * B7b — pure lesson catalog + briefing lookup for the Babylon product shell.
 *
 * Free of any @babylonjs / browser / firebase imports so the home lesson list
 * and the briefing strings are exercised by `node --test` without the 3D engine
 * or the (three/firebase-importing) store (D1.a). The screen shell consumes this
 * data; grading (B7c) will consume the same LessonId contract.
 *
 * Strings are ported from the original React shell as spec — the course titles /
 * descriptions come verbatim from `ClientApp.tsx`'s MISSION_INFO and the labels
 * from `HomeScreen.tsx`'s LESSONS (match the CONTRACT, not the code).
 */

// Type-only import: erased by Node's type stripping, so this module carries NO
// runtime dependency on the store (and its three/firebase imports).
import type { LessonId } from "./store";

export type Language = "ja" | "en";

/** A localized string pair. */
export interface Localized {
  ja: string;
  en: string;
}

/** Briefing shown in the pre-drive overlay for a graded lesson. */
export interface LessonBriefing {
  title: Localized;
  desc: Localized;
}

/**
 * Course briefings for every graded lesson (all LessonIds except "free-mode",
 * which is drivable with no briefing). Titles/descriptions ported verbatim from
 * the original `ClientApp.tsx` MISSION_INFO.
 */
export const LESSON_BRIEFINGS: Record<
  Exclude<LessonId, "free-mode">,
  LessonBriefing
> = {
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

/** A selectable card on the Home screen. */
export interface HomeEntry {
  /** LessonId for lesson/free entries; "tutorial" is a screen entry, not a LessonId. */
  id: LessonId | "tutorial";
  label: Localized;
  /** Short mono sub-label (course number / mode tag). */
  sub: string;
  /** English one-liner shown on the card. */
  desc: string;
  /** How selecting the entry routes: a graded lesson, free mode, or the tutorial. */
  kind: "lesson" | "free" | "tutorial";
}

/**
 * Ordered Home cards: tutorial, the eight graded courses, then free mode —
 * matching the original `HomeScreen.tsx` LESSONS ordering.
 */
export const HOME_ENTRIES: readonly HomeEntry[] = [
  { id: "tutorial", label: { ja: "チュートリアル", en: "Tutorial" }, sub: "BASIC", desc: "LEARN CONTROLS", kind: "tutorial" },
  { id: "straight", label: { ja: "直線走行", en: "Straight Driving" }, sub: "LEVEL 01", desc: "BASIC CONTROL", kind: "lesson" },
  { id: "left-turn", label: { ja: "左折", en: "Left Turn" }, sub: "LEVEL 02", desc: "TURNING LEFT", kind: "lesson" },
  { id: "right-turn", label: { ja: "右折", en: "Right Turn" }, sub: "LEVEL 03", desc: "TURNING RIGHT", kind: "lesson" },
  { id: "s-curve", label: { ja: "S字カーブ", en: "S-Curve" }, sub: "LEVEL 04", desc: "S-CURVE", kind: "lesson" },
  { id: "crank", label: { ja: "クランク", en: "Crank" }, sub: "LEVEL 05", desc: "CRANK", kind: "lesson" },
  { id: "traffic-light", label: { ja: "信号", en: "Traffic Light" }, sub: "LEVEL 06", desc: "TRAFFIC LIGHT PRACTICE", kind: "lesson" },
  { id: "crosswalk", label: { ja: "横断歩道", en: "Crosswalk" }, sub: "LEVEL 07", desc: "STOP FOR PEDESTRIANS", kind: "lesson" },
  { id: "railroad-crossing", label: { ja: "踏切", en: "Railroad Crossing" }, sub: "LEVEL 08", desc: "RAILROAD CROSSING", kind: "lesson" },
  { id: "free-mode", label: { ja: "フリーモード", en: "Free Mode" }, sub: "FREE", desc: "EXPLORE THE CITY", kind: "free" },
] as const;

/**
 * Resolve the briefing for a lesson in the given language, or `null` for lessons
 * with no briefing (free-mode). Returning null lets the shell skip the overlay
 * cleanly rather than showing an empty card.
 */
export function getBriefing(
  lesson: LessonId,
  language: Language,
): { title: string; desc: string } | null {
  if (lesson === "free-mode") return null;
  const b = LESSON_BRIEFINGS[lesson];
  return { title: b.title[language], desc: b.desc[language] };
}
