"use client";

import type { ReactNode } from "react";
import { useDrivingStore } from "@/lib/store";
import { SHELL_STRINGS } from "./productStrings";

/**
 * P7a — minimal localized stubs for the screens that graduate in later tasks:
 * feedback (P7b grading + P8 replay review), tutorial (P7b), auth + history
 * (P10 Firebase). Each renders its localized title, a "next task" note, and a
 * back-home action carrying the E1 testid its real version will keep — so the
 * e2e drivers written now don't churn when the screens are fleshed out.
 * Back-home wording here is the settled に form (ホームに戻る); only the driving
 * screen uses へ.
 */

function StubShell({
  title,
  children,
  backTestId,
}: {
  title: string;
  children?: ReactNode;
  backTestId: string;
}) {
  const language = useDrivingStore((s) => s.language);
  const setScreen = useDrivingStore((s) => s.setScreen);
  const t = SHELL_STRINGS[language];

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white">
      <div className="text-center px-6 max-w-lg">
        <h1 className="text-3xl font-extrabold italic tracking-tight mb-4">{title}</h1>
        <p className="text-slate-400 mb-10">{t.stubComingSoon}</p>
        {children}
        <button
          data-testid={backTestId}
          onClick={() => setScreen("home")}
          className="px-8 py-3 bg-slate-800 hover:bg-blue-600 border border-slate-700 hover:border-blue-500 rounded-xl text-lg font-bold transition-colors"
        >
          {t.backHome}
        </button>
      </div>
    </div>
  );
}

/** Feedback graduates in P7b (score) + P8 (replay review). */
export function FeedbackStub() {
  const language = useDrivingStore((s) => s.language);
  return <StubShell title={SHELL_STRINGS[language].feedbackTitle} backTestId="feedback-home" />;
}

/** Tutorial graduates in P7b (DOM tutorial, ja/en). */
export function TutorialStub() {
  const language = useDrivingStore((s) => s.language);
  return <StubShell title={SHELL_STRINGS[language].tutorialTitle} backTestId="tutorial-home" />;
}

/** Auth graduates in P10 (Firebase, fail-soft guest path). */
export function AuthStub() {
  const language = useDrivingStore((s) => s.language);
  return <StubShell title={SHELL_STRINGS[language].authTitle} backTestId="auth-back-guest" />;
}

/** History graduates in P10 (mission_logs query). */
export function HistoryStub() {
  const language = useDrivingStore((s) => s.language);
  return <StubShell title={SHELL_STRINGS[language].historyTitle} backTestId="history-back-home" />;
}
