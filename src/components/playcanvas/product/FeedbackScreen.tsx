"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useDrivingStore } from "@/lib/store";
import { MISSION_CHECKPOINTS } from "@/lib/mission/missions";
import { getLessonTitle } from "@/lib/pcLessonCatalog";
import { createReplayScene } from "../replayScene";
import { SHELL_STRINGS } from "./productStrings";

// Ammo-gated PlayCanvas canvas (client-only), running the replay-review scene.
// buildDriveWorld's static road colliders need the physics world, so the replay
// scene reuses the same loadAmmo() gate the drive scene does (see replayScene).
const DriveCanvas = dynamic(() => import("../DriveCanvas"), { ssr: false });

/**
 * P7b — the graded feedback screen (graduates the P7a FeedbackStub). Shows what
 * the brief requires:
 *   - score total, computed EXACTLY like the original `ui/FeedbackScreen.tsx`:
 *     100 − (Σ KAIZEN meta.penalty, default 5 each) − floor(deviationPenalty),
 *     clamped at 0;
 *   - clear time (missionStartTime → missionEndTime, mm:ss.cs);
 *   - the AI-instructor improvement points (the KAIZEN feedback logs produced by
 *     the frozen scoring.ts, via the store's calculateMissionResult);
 *   - per-checkpoint results over the lesson's SCORED checkpoints (scored !== false,
 *     excluding the traffic-light signal, whose grading is the signal-violation path).
 *
 * The left panel is a REPLAY PLACEHOLDER: the 3D replay-review scene is P8. This
 * screen only reads store numbers the grading runtime already wrote, so the seam
 * is a swap-in of the ReplayCanvas later — the results panel does not change.
 *
 * Firestore persistence + History are P10 (auth); nothing is saved here yet.
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
    typeStop: "一時停止",
    typeMirror: "ミラー確認",
    typeSafety: "安全確認",
    typeSpeed: "速度制限",
    replay: "リプレイ",
    chase: "CHASE",
    driver: "DRIVER",
    noReplay: "この走行の記録はありません。",
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
    typeStop: "Stop",
    typeMirror: "Mirror check",
    typeSafety: "Safety check",
    typeSpeed: "Speed limit",
    replay: "REPLAY",
    chase: "CHASE",
    driver: "DRIVER",
    noReplay: "No recording is available for this drive.",
  },
} as const;

/**
 * Localized display names for the per-checkpoint result rows, keyed by checkpoint
 * id. The frozen `missions.ts` `label` field is MIXED language ("一時停止" vs
 * "Railroad Crossing Stop") and display-unreliable in either language, so — the
 * settled trial approach (E1 precedent) — the feedback list derives its own
 * bilingual names and NEVER renders `cp.label`. Covers every scored checkpoint id
 * in the frozen table; the type-name is the fallback for any future id.
 */
const CHECKPOINT_NAMES: Record<string, { ja: string; en: string }> = {
  "stop-1": { ja: "一時停止", en: "Stop at the line" },
  "mirror-1": { ja: "安全確認", en: "Mirror safety check" },
  "cw-safety-1": { ja: "横断歩道の安全確認", en: "Crosswalk safety check" },
  "rr-stop-1": { ja: "踏切前の一時停止", en: "Stop before the crossing" },
};

export function FeedbackScreen() {
  const language = useDrivingStore((s) => s.language);
  const currentLesson = useDrivingStore((s) => s.currentLesson);
  const feedbackLogs = useDrivingStore((s) => s.feedbackLogs);
  const clearedCheckpointIds = useDrivingStore((s) => s.clearedCheckpointIds);
  const deviationPenalty = useDrivingStore((s) => s.deviationPenalty);
  const missionStartTime = useDrivingStore((s) => s.missionStartTime);
  const missionEndTime = useDrivingStore((s) => s.missionEndTime);
  const replayData = useDrivingStore((s) => s.replayData);
  const replayViewMode = useDrivingStore((s) => s.replayViewMode);
  const setReplayViewMode = useDrivingStore((s) => s.setReplayViewMode);
  const setIsReplaying = useDrivingStore((s) => s.setIsReplaying);
  const setScreen = useDrivingStore((s) => s.setScreen);
  const setMissionState = useDrivingStore((s) => s.setMissionState);
  const clearReplayData = useDrivingStore((s) => s.clearReplayData);
  const t = STRINGS[language];
  const shell = SHELL_STRINGS[language];

  const hasReplay = replayData.length > 0;

  // Mark the replay flag while this screen shows a recorded run (convention
  // parity with the original: `isReplaying` = a replay is on screen). Cleared on
  // unmount — the driving scene's grading loop already skips grading when set.
  useEffect(() => {
    if (!hasReplay) return;
    setIsReplaying(true);
    return () => setIsReplaying(false);
  }, [hasReplay, setIsReplaying]);

  const kaizenLogs = feedbackLogs.filter((l) => l.type === "KAIZEN");

  // Original score formula, VERBATIM (ui/FeedbackScreen.tsx): 100 − Σ KAIZEN
  // penalties (default 5) − floor(deviationPenalty), clamped at 0.
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

  // Per-checkpoint results over the SCORED checkpoints (same filter as the frozen
  // scoring.ts missed-checkpoint pass: scored !== false AND not the traffic-light signal).
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
          {t.missionFeedback}: {getLessonTitle(currentLesson, language)}
        </h2>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: 3D replay-review view. Plays the recorded run through the world
            (kinematic car, timestamp-interpolated playback via replayScene). */}
        <div className="w-1/2 relative border-r border-slate-700 bg-black">
          {hasReplay ? (
            <div className="absolute inset-0" data-testid="replay-canvas">
              {/* fit="container": the replay lives in a half-width panel, so the
                  canvas must track its ELEMENT size, not the window. */}
              <DriveCanvas buildScene={createReplayScene} showFps fit="container" />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm px-8 text-center">
              {t.noReplay}
            </div>
          )}

          {/* Replay overlay: recording badge + chase/driver camera toggle.
              Top-RIGHT of the panel — the canvas's FPS badge owns the top-left. */}
          {hasReplay && (
            <div className="absolute top-4 right-4 z-10 flex gap-2 items-center">
              <div className="bg-black/60 px-3 py-1 rounded text-xs font-mono text-red-500 animate-pulse">
                ● {t.replay}
              </div>
              <div className="flex bg-slate-800/80 rounded p-1 border border-slate-600">
                <button
                  onClick={() => setReplayViewMode("chase")}
                  data-testid="replay-chase"
                  data-active={replayViewMode === "chase"}
                  className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                    replayViewMode === "chase" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {t.chase}
                </button>
                <button
                  onClick={() => setReplayViewMode("driver")}
                  data-testid="replay-driver"
                  data-active={replayViewMode === "driver"}
                  className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                    replayViewMode === "driver" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {t.driver}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: score + AI feedback + per-checkpoint results (scrolls). */}
        <div className="w-1/2 overflow-y-auto">
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
                      <ul
                        className="list-disc list-inside mt-2 space-y-2 text-sm"
                        data-testid="feedback-kaizen"
                      >
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
                        <span className="text-sm font-bold">
                          {CHECKPOINT_NAMES[cp.id]?.[language] ?? typeName(cp.type)}
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
                {shell.backHome}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
