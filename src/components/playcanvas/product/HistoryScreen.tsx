"use client";

import { useEffect, useState } from "react";
import { useDrivingStore, type LessonId } from "@/lib/store";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, getDocs, limit } from "firebase/firestore";
import { getScoreRank, type ScoreRank } from "@/lib/pcMissionLog";
import { LESSON_BRIEFINGS, FREE_MODE_TITLE, getLessonTitle, type Language } from "@/lib/pcLessonCatalog";
import { SHELL_STRINGS } from "./productStrings";

/**
 * P10 — real driving-history screen for the PlayCanvas product (graduates the
 * P7a HistoryStub). Ported from the original `ui/HistoryScreen.tsx`: reads the
 * last 10 records for the signed-in user from the Firestore `mission_logs`
 * collection (the SAME path the DEPLOYED owner-isolation rules cover — the
 * query filters on `userId == user.uid`, matching the rules' owner check),
 * caches them in the store's `missionHistory`, and renders the score/rank/time
 * cards.
 *
 * Fail-soft invariant: guests (which includes every visitor when Firebase is
 * unconfigured — nobody can sign in) get a "login required" card, never a
 * crash; `db` is null-checked before any Firestore call.
 *
 * Two bilingual bugs the original had (E1 found + fixed the same way, ported
 * here): the "📊 Driving History" title was hardcoded English-only, and
 * "Loading records..." leaked into the ja STRINGS object too — both are now
 * proper ja/en pairs below.
 *
 * Lesson display names come from the pure pcLessonCatalog (bilingual for ALL
 * lessons incl. crosswalk / railroad-crossing, which the original's local map
 * was missing) with the raw id as a last-resort fallback for unknown records.
 */

const STRINGS = {
  ja: {
    loginRequiredTitle: "🔒 ログインが必要です",
    loginRequiredBody: "履歴を見るにはログインしてください",
    loginButton: "ログイン / 新規登録",
    back: "戻る",
    title: "📊 走行履歴", // P10 fix: was hardcoded English in the original
    drivingRecordSuffix: " の走行記録",
    dbConfigError: "データベースの設定が必要です。管理者にお問い合わせください。",
    loadFailed: "履歴の読み込みに失敗しました",
    noHistory: "履歴はまだありません",
    noHistorySub: "ミッションをクリアすると記録が残ります",
    challengeMission: "ミッションに挑戦する",
    totalRecords: (n: number) => `全 ${n} 件の記録`,
    sortedByLatest: "最新順に表示",
    loadingRecords: "読み込み中...", // P10 fix: was English "Loading records..." leaking into ja
    reload: "再読み込み",
    time: "タイム",
    score: "スコア",
  },
  en: {
    loginRequiredTitle: "🔒 Login Required",
    loginRequiredBody: "Please log in to view your history",
    loginButton: "Log In / Sign Up",
    back: "Back",
    title: "📊 Driving History",
    drivingRecordSuffix: "'s driving records",
    dbConfigError: "Database setup is required. Please contact the administrator.",
    loadFailed: "Failed to load history",
    noHistory: "No history yet",
    noHistorySub: "Clear a mission to start recording your progress",
    challengeMission: "Take on a Mission",
    totalRecords: (n: number) => `${n} records total`,
    sortedByLatest: "Sorted by latest",
    loadingRecords: "Loading records...",
    reload: "Reload",
    time: "TIME",
    score: "SCORE",
  },
} as const;

/** Rank badge colors keyed by the pure pcMissionLog rank. */
const RANK_STYLES: Record<ScoreRank, { color: string; bg: string }> = {
  S: { color: "text-yellow-400", bg: "bg-yellow-400/20" },
  A: { color: "text-green-400", bg: "bg-green-400/20" },
  B: { color: "text-blue-400", bg: "bg-blue-400/20" },
  C: { color: "text-orange-400", bg: "bg-orange-400/20" },
  D: { color: "text-red-400", bg: "bg-red-400/20" },
};

/** Saved records hold a plain string lesson id; resolve it bilingually when known. */
function lessonName(lesson: string, language: Language): string {
  if (lesson === "free-mode") return FREE_MODE_TITLE[language];
  if (lesson in LESSON_BRIEFINGS) return getLessonTitle(lesson as LessonId, language);
  return lesson;
}

export function HistoryScreen() {
  const setScreen = useDrivingStore((s) => s.setScreen);
  const user = useDrivingStore((s) => s.user);
  const missionHistory = useDrivingStore((s) => s.missionHistory);
  const setMissionHistory = useDrivingStore((s) => s.setMissionHistory);
  const language = useDrivingStore((s) => s.language);
  const t = STRINGS[language];
  const shell = SHELL_STRINGS[language];
  // Spinner only when there is nothing cached to show; cached history renders instantly.
  const [loading, setLoading] = useState(() => useDrivingStore.getState().missionHistory.length === 0);
  const [error, setError] = useState<"config" | "load" | "">("");

  useEffect(() => {
    let cancelled = false;
    async function fetchHistory() {
      if (!user || !db) {
        setLoading(false);
        return;
      }
      // Background refresh: only show the spinner when nothing is cached yet.
      const hadCache = useDrivingStore.getState().missionHistory.length > 0;
      if (!hadCache) setLoading(true);
      setError("");
      try {
        const q = query(
          collection(db, "mission_logs"),
          where("userId", "==", user.uid),
          orderBy("timestamp", "desc"),
          limit(10),
        );
        const querySnapshot = await getDocs(q);
        if (cancelled) return;
        const historyData = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          timestamp: doc.data().timestamp,
          lesson: doc.data().lesson,
          score: doc.data().score,
          clearTime: doc.data().clearTime,
          feedbackSummary: doc.data().feedbackSummary,
        }));
        setMissionHistory(historyData);
      } catch (e: unknown) {
        console.error("Error fetching history:", e);
        if (cancelled) return;
        // Keep showing cached history if a background refresh fails; only
        // surface an error when there is nothing cached to display. Store an
        // error KIND, not localized text, so a later language switch re-localizes it.
        if (useDrivingStore.getState().missionHistory.length === 0) {
          const isMissingIndex = e instanceof Error && "code" in e && e.code === "failed-precondition";
          setError(isMissingIndex ? "config" : "load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [user, setMissionHistory]);

  // Guest (or unconfigured-Firebase) state: sensible card, never a crash.
  if (!user) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white">
        <div className="text-center" data-testid="history-login-required">
          <h2 className="text-2xl font-bold text-blue-400 mb-4">{t.loginRequiredTitle}</h2>
          <p className="text-slate-400 mb-6">{t.loginRequiredBody}</p>
          <div className="space-x-4">
            <button
              onClick={() => setScreen("auth")}
              data-testid="history-goto-auth"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded font-bold"
            >
              {t.loginButton}
            </button>
            <button
              onClick={() => setScreen("home")}
              data-testid="history-back-home"
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded"
            >
              {t.back}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 text-white p-8 overflow-hidden">
      <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-700">
        <div>
          <h2 className="text-2xl font-bold text-blue-400">{t.title}</h2>
          <p className="text-sm text-slate-400 mt-1">
            {user.email?.split("@")[0]}
            {t.drivingRecordSuffix}
          </p>
        </div>
        <button
          onClick={() => setScreen("home")}
          data-testid="history-back-home"
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded"
        >
          ← {shell.backHome}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center text-slate-500 mt-10">
            <div className="animate-pulse">{t.loadingRecords}</div>
          </div>
        ) : error ? (
          <div className="text-center mt-10">
            <div className="text-red-400 mb-4" data-testid="history-error">
              {error === "config" ? t.dbConfigError : t.loadFailed}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded"
            >
              {t.reload}
            </button>
          </div>
        ) : missionHistory.length === 0 ? (
          <div className="text-center mt-10" data-testid="history-empty">
            <div className="text-6xl mb-4">🏎️</div>
            <div className="text-slate-500 mb-4">{t.noHistory}</div>
            <p className="text-slate-600 text-sm mb-6">{t.noHistorySub}</p>
            <button
              onClick={() => setScreen("home")}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded font-bold"
            >
              {t.challengeMission}
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm text-slate-400">{t.totalRecords(missionHistory.length)}</div>
              <div className="text-xs text-slate-500">{t.sortedByLatest}</div>
            </div>
            <div className="grid gap-3" data-testid="history-list">
              {missionHistory.map((item, index) => {
                const rank = getScoreRank(item.score);
                const rankStyle = RANK_STYLES[rank];
                return (
                  <div
                    key={item.id}
                    className="bg-slate-800 p-4 rounded-lg flex items-center gap-4 border border-slate-700 hover:border-slate-600 transition-colors"
                  >
                    <div className="text-xl font-bold text-slate-600 w-10 text-center">
                      #{missionHistory.length - index}
                    </div>
                    {/* Main info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-bold text-lg text-white">
                          {lessonName(item.lesson, language)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(item.timestamp).toLocaleString(language === "en" ? "en-US" : "ja-JP", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="text-sm text-slate-400">{item.feedbackSummary}</div>
                    </div>

                    {/* Time */}
                    <div className="text-center px-3">
                      <div className="text-xs text-slate-500">{t.time}</div>
                      <div className="text-lg font-mono text-white">{item.clearTime}</div>
                    </div>

                    {/* Score */}
                    <div className="text-center px-3">
                      <div className="text-xs text-slate-500">{t.score}</div>
                      <div
                        className={`text-2xl font-bold ${
                          item.score >= 80
                            ? "text-green-400"
                            : item.score >= 60
                              ? "text-yellow-400"
                              : "text-red-400"
                        }`}
                      >
                        {item.score}
                      </div>
                    </div>

                    {/* Rank */}
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${rankStyle.bg}`}>
                      <span className={`text-2xl font-black ${rankStyle.color}`}>{rank}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
