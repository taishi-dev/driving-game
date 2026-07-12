/**
 * Task 2 — the AI-instructor feedback text on FeedbackScreen must reflect the
 * actual score, not just `kaizenLogs.length`.
 *
 * Bug: the score subtracts `floor(deviationPenalty)` (path wander, the car
 * drifting off the course centerline) — but wandering generates NO kaizen
 * log. A wander-heavy run can therefore have an empty kaizen list AND a low
 * score, yet the screen used to show the "excellent drive" headline.
 *
 * Pure (no playcanvas/browser/react imports) so it runs under node --test;
 * FeedbackScreen wires these two helpers in instead of changing the score.
 */

import type { Language } from "./pcLessonCatalog";

/** Points lost to path deviation before we call it out to the driver. */
export const DEVIATION_FEEDBACK_THRESHOLD = 5;

const DEVIATION_MESSAGES = {
  en: "You drifted from the course — try to stay centered in your lane.",
  ja: "コースから外れて走行しました。車線の中央を維持しましょう。",
} as const;

// `|| 0` mirrors FeedbackScreen's score formula (`Math.floor(deviationPenalty || 0)`)
// so a non-numeric value can never spuriously trip the threshold.
const deviationPoints = (deviationPenalty: number): number => Math.floor(deviationPenalty || 0);

/** Localized "you drifted from the course" point, or null if deviation is minor. */
export function deviationFeedbackPoint(deviationPenalty: number, lang: Language): string | null {
  if (deviationPoints(deviationPenalty) < DEVIATION_FEEDBACK_THRESHOLD) return null;
  return DEVIATION_MESSAGES[lang];
}

/** True only when there are no kaizen logs AND deviation is below the threshold. */
export function isCleanRun(kaizenCount: number, deviationPenalty: number): boolean {
  return kaizenCount === 0 && deviationPoints(deviationPenalty) < DEVIATION_FEEDBACK_THRESHOLD;
}
