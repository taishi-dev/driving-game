/**
 * B10 — pure builder for the Firestore `mission_logs` record, reproducing the
 * ORIGINAL app's save semantics exactly (src/components/ui/FeedbackScreen.tsx
 * `saveResultToFirestore`):
 *
 *  - score  = max(0, 100 - Σ(KAIZEN meta.penalty, default 5 each)
 *                        - floor(deviationPenalty))
 *  - clearTime = "mm:ss" (the SAVED record has no centiseconds, unlike the
 *    on-screen clear-time display which is mm:ss.cs)
 *  - feedbackSummary = firstKaizen.message + " 他"/" and more", or the
 *    localized "great drive" string when there were no KAIZEN events
 *  - field set { userId, timestamp, lesson, score, clearTime, feedbackSummary }
 *    — the same shape the deployed owner-isolation rules validate on
 *    `mission_logs`; do not add or rename fields.
 *
 * Pure (no firebase / store imports) so it runs under node --test; the store's
 * FeedbackEvent is structurally compatible with {@link KaizenLogLike}.
 */

import type { Language } from "./lessonCatalog";

export interface KaizenLogLike {
  type: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface MissionLogInput {
  userId: string;
  lesson: string;
  /** Record timestamp (Date.now() at save time — injected for purity). */
  timestamp: number;
  language: Language;
  feedbackLogs: readonly KaizenLogLike[];
  deviationPenalty: number;
  missionStartTime: number;
  missionEndTime: number;
}

export interface MissionLogRecord {
  userId: string;
  timestamp: number;
  lesson: string;
  score: number;
  clearTime: string;
  feedbackSummary: string;
}

/** Original FeedbackScreen STRINGS.summaryMore / summaryGreat, verbatim. */
const SUMMARY_STRINGS = {
  ja: { more: " 他", great: "素晴らしい走行でした" },
  en: { more: " and more", great: "A great drive" },
} as const;

export function buildMissionLog(input: MissionLogInput): MissionLogRecord {
  const t = SUMMARY_STRINGS[input.language];
  const kaizenLogs = input.feedbackLogs.filter((l) => l.type === "KAIZEN");
  const kaizenPenalty = kaizenLogs.reduce(
    (acc, l) => acc + (typeof l.meta?.penalty === "number" ? l.meta.penalty : 5),
    0,
  );
  const totalPenalty = kaizenPenalty + Math.floor(input.deviationPenalty || 0);
  const score = Math.max(0, 100 - totalPenalty);

  const diff = input.missionEndTime - input.missionStartTime;
  const min = Math.floor(diff / 60000);
  const sec = Math.floor((diff % 60000) / 1000);
  const clearTime = `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;

  return {
    userId: input.userId,
    timestamp: input.timestamp,
    lesson: input.lesson,
    score,
    clearTime,
    feedbackSummary: kaizenLogs.length > 0 ? kaizenLogs[0].message + t.more : t.great,
  };
}

/** Rank badge thresholds for the history screen (original ui/HistoryScreen.tsx). */
export type ScoreRank = "S" | "A" | "B" | "C" | "D";

export function getScoreRank(score: number): ScoreRank {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}
