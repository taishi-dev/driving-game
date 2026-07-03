"use client";

import { useDrivingStore } from "@/lib/store";
import { MISSION_CHECKPOINTS } from "@/lib/mission/missions";

/**
 * B7c — the graded feedback screen (extends the B7b placeholder minimally; the
 * full results/replay design is B8). Shows what the brief requires:
 *   - score total, computed EXACTLY like the original FeedbackScreen:
 *     100 - (sum of KAIZEN meta.penalty, default 5 each) - floor(deviationPenalty),
 *     clamped at 0;
 *   - clear time (missionStartTime -> missionEndTime, mm:ss.cs);
 *   - the AI-instructor improvement points (the KAIZEN feedback logs produced by
 *     the frozen scoring.ts);
 *   - per-checkpoint results over the lesson's scored checkpoints (scored !== false,
 *     excluding the traffic-light signal, whose grading is the signal-violation path).
 * No Firebase here (history persistence is B10) and no replay scene (B8).
 */

const STRINGS = {
  ja: {
    missionFeedback: "ミッション結果",
    aiInstructorFeedback: "AI Instructor Feedback",
    feedbackPerfect: "全体的に素晴らしい走行でした！速度・視線ともに安定しています。",
    feedbackStable: "全体的に安定した走行でしたが、いくつか気になる点がありました。",
    improvementPoints: "改善ポイント:",
    checkpoints: "チェックポイント",
    cleared: "クリア",
    missed: "未達成",
    noCheckpoints: "このコースにチェックポイントはありません。",
    score: "スコア",
    clearTime: "クリアタイム",
    retry: "もう一度挑戦",
    backToHome: "ホームに戻る",
    typeStop: "一時停止",
    typeMirror: "ミラー確認",
    typeSafety: "安全確認",
    typeSpeed: "速度制限",
  },
  en: {
    missionFeedback: "Mission Feedback",
    aiInstructorFeedback: "AI Instructor Feedback",
    feedbackPerfect: "Overall, an excellent drive! Both your speed and gaze were steady.",
    feedbackStable: "Overall a steady drive, but there were a few points worth noting.",
    improvementPoints: "Points to improve:",
    checkpoints: "Checkpoints",
    cleared: "Cleared",
    missed: "Missed",
    noCheckpoints: "This course has no checkpoints.",
    score: "Score",
    clearTime: "Clear Time",
    retry: "Try Again",
    backToHome: "Back to Home",
    typeStop: "Stop",
    typeMirror: "Mirror check",
    typeSafety: "Safety check",
    typeSpeed: "Speed limit",
  },
} as const;

export function FeedbackScreen() {
  const language = useDrivingStore((s) => s.language);
  const currentLesson = useDrivingStore((s) => s.currentLesson);
  const feedbackLogs = useDrivingStore((s) => s.feedbackLogs);
  const clearedCheckpointIds = useDrivingStore((s) => s.clearedCheckpointIds);
  const deviationPenalty = useDrivingStore((s) => s.deviationPenalty);
  const missionStartTime = useDrivingStore((s) => s.missionStartTime);
  const missionEndTime = useDrivingStore((s) => s.missionEndTime);
  const setScreen = useDrivingStore((s) => s.setScreen);
  const setMissionState = useDrivingStore((s) => s.setMissionState);
  const clearReplayData = useDrivingStore((s) => s.clearReplayData);
  const t = STRINGS[language];

  const kaizenLogs = feedbackLogs.filter((l) => l.type === "KAIZEN");

  // Original score formula, verbatim (FeedbackScreen.tsx in the R3F app).
  const kaizenPenalty = kaizenLogs.reduce(
    (acc, l) => acc + (typeof l.meta?.penalty === "number" ? l.meta.penalty : 5),
    0,
  );
  const totalPenalty = kaizenPenalty + Math.floor(deviationPenalty || 0);
  const score = Math.max(0, 100 - totalPenalty);

  const clearTime = (() => {
    if (!missionStartTime || !missionEndTime) return "--:--.--";
    const diff = missionEndTime - missionStartTime;
    const min = Math.floor(diff / 60000);
    const sec = Math.floor((diff % 60000) / 1000);
    const ms = Math.floor((diff % 1000) / 10);
    return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}.${ms
      .toString()
      .padStart(2, "0")}`;
  })();

  // Per-checkpoint results over the SCORED checkpoints (same filter as the
  // frozen scoring.ts missed-checkpoint pass).
  const gradedCheckpoints = (MISSION_CHECKPOINTS[currentLesson] ?? []).filter(
    (cp) => cp.scored !== false && cp.visual !== "traffic-light",
  );
  const typeName = (type: string) =>
    type === "stop"
      ? t.typeStop
      : type === "mirror"
        ? t.typeMirror
        : type === "safety-check"
          ? t.typeSafety
          : t.typeSpeed;

  const handleRetry = () => {
    clearReplayData();
    setMissionState("briefing");
    setScreen("driving");
  };
  const handleHome = () => {
    clearReplayData();
    setMissionState("idle");
    setScreen("home");
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 text-white overflow-hidden">
      {/* Header */}
      <div className="h-16 px-6 flex items-center justify-between border-b border-slate-700 bg-slate-800 flex-shrink-0">
        <h2 className="text-xl font-bold text-blue-400">
          {t.missionFeedback}: {currentLesson}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-8">
          {/* Score + clear time */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="p-6 bg-slate-800 rounded-xl border border-slate-700">
              <div className="text-xs text-slate-500 mb-1">{t.score}</div>
              <div className="text-5xl font-bold text-blue-400" data-testid="feedback-score">
                {score}
                <span className="text-lg text-slate-500">/100</span>
              </div>
            </div>
            <div className="p-6 bg-slate-800 rounded-xl border border-slate-700">
              <div className="text-xs text-slate-500 mb-1">{t.clearTime}</div>
              <div className="text-5xl font-bold" data-testid="feedback-time">
                {clearTime}
              </div>
            </div>
          </div>

          {/* AI instructor feedback (original strings) */}
          <div className="mb-8 p-6 bg-slate-800 rounded-xl border border-slate-700">
            <h3 className="text-lg font-bold mb-4 text-green-400 flex items-center gap-2">
              <span>✨</span> {t.aiInstructorFeedback}
            </h3>
            <div className="space-y-4 text-slate-300 leading-relaxed">
              {kaizenLogs.length === 0 ? (
                <p>{t.feedbackPerfect}</p>
              ) : (
                <>
                  <p>{t.feedbackStable}</p>
                  <div className="mt-4">
                    <span className="text-yellow-400 font-bold">{t.improvementPoints}</span>
                    <ul className="list-disc list-inside mt-2 space-y-2 text-sm" data-testid="feedback-kaizen">
                      {kaizenLogs.map((log, i) => (
                        <li key={i}>
                          <span className="font-bold text-white">{log.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Per-checkpoint results */}
          <div className="mb-8 p-6 bg-slate-800 rounded-xl border border-slate-700">
            <h3 className="text-lg font-bold mb-4 text-blue-400">{t.checkpoints}</h3>
            {gradedCheckpoints.length === 0 ? (
              <p className="text-slate-500 text-sm">{t.noCheckpoints}</p>
            ) : (
              <ul className="space-y-2">
                {gradedCheckpoints.map((cp) => {
                  const cleared = clearedCheckpointIds.includes(cp.id);
                  return (
                    <li
                      key={cp.id}
                      data-testid={`feedback-checkpoint-${cp.id}`}
                      data-cleared={cleared}
                      className="flex items-center justify-between px-4 py-3 rounded-lg bg-slate-900/60 border border-slate-700"
                    >
                      <span className="text-sm">
                        <span className="text-slate-500 mr-2 font-mono">{typeName(cp.type)}</span>
                        <span className="font-bold">{cp.label ?? cp.id}</span>
                      </span>
                      <span
                        className={`text-sm font-bold px-3 py-1 rounded ${
                          cleared ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {cleared ? `✓ ${t.cleared}` : `✗ ${t.missed}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-4 pb-8">
            <button
              onClick={handleRetry}
              data-testid="feedback-retry"
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-blue-900/20"
            >
              {t.retry}
            </button>
            <button
              onClick={handleHome}
              data-testid="feedback-home"
              className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors border border-slate-600"
            >
              {t.backToHome}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
