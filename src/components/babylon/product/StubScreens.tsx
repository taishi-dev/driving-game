"use client";

import { useDrivingStore } from "@/lib/store";

/**
 * B7b placeholder / stub screens. Each is a self-contained screen with a clear
 * "return to home" path and NO Firebase / R3F imports (fail-soft: nothing here
 * touches config-dependent modules). They hold the ScreenId slots so the flow is
 * complete now; the real implementations land in later tasks:
 *   - FeedbackScreen  -> B8 (results + replay)
 *   - TutorialScreen  -> B7c (guided control tutorial)
 *   - Auth / History  -> B10 (Firebase auth + saved runs)
 */

const STRINGS = {
  ja: {
    backToHome: "ホームへ戻る",
    retry: "もう一度",
    feedbackTitle: "ミッション結果",
    feedbackNote: "詳細な採点とリプレイは B8 で実装予定です。",
    tutorialTitle: "チュートリアル",
    tutorialNote: "操作チュートリアルは B7c で実装予定です。",
    authTitle: "ログイン / 登録",
    authNote: "アカウント機能は B10 で実装予定です。",
    historyTitle: "走行履歴",
    historyNote: "走行履歴は B10 で実装予定です。",
  },
  en: {
    backToHome: "Back to Home",
    retry: "Try Again",
    feedbackTitle: "Mission Result",
    feedbackNote: "Detailed scoring and replay arrive in B8.",
    tutorialTitle: "Tutorial",
    tutorialNote: "The control tutorial arrives in B7c.",
    authTitle: "Login / Register",
    authNote: "Accounts arrive in B10.",
    historyTitle: "Driving History",
    historyNote: "Saved runs arrive in B10.",
  },
} as const;

function StubShell({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white">
      <div className="text-center px-6 max-w-lg">
        <h1 className="text-3xl font-bold text-blue-400 mb-4">{title}</h1>
        <p className="text-slate-400 mb-8">{note}</p>
        {children}
      </div>
    </div>
  );
}

function HomeButton({ label }: { label: string }) {
  const setScreen = useDrivingStore((s) => s.setScreen);
  const setMissionState = useDrivingStore((s) => s.setMissionState);
  return (
    <button
      data-testid="stub-home"
      onClick={() => {
        setMissionState("idle");
        setScreen("home");
      }}
      className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold transition-colors"
    >
      {label}
    </button>
  );
}

export function FeedbackScreen() {
  const language = useDrivingStore((s) => s.language);
  const currentLesson = useDrivingStore((s) => s.currentLesson);
  const setScreen = useDrivingStore((s) => s.setScreen);
  const setMissionState = useDrivingStore((s) => s.setMissionState);
  const t = STRINGS[language];
  return (
    <StubShell title={`${t.feedbackTitle}: ${currentLesson}`} note={t.feedbackNote}>
      <div className="flex gap-4 justify-center">
        <button
          onClick={() => {
            setMissionState("briefing");
            setScreen("driving");
          }}
          className="px-8 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold transition-colors"
        >
          {t.retry}
        </button>
        <HomeButton label={t.backToHome} />
      </div>
    </StubShell>
  );
}

export function TutorialScreen() {
  const language = useDrivingStore((s) => s.language);
  const t = STRINGS[language];
  return (
    <StubShell title={t.tutorialTitle} note={t.tutorialNote}>
      <HomeButton label={t.backToHome} />
    </StubShell>
  );
}

export function AuthScreen() {
  const language = useDrivingStore((s) => s.language);
  const t = STRINGS[language];
  return (
    <StubShell title={t.authTitle} note={t.authNote}>
      <HomeButton label={t.backToHome} />
    </StubShell>
  );
}

export function HistoryScreen() {
  const language = useDrivingStore((s) => s.language);
  const t = STRINGS[language];
  return (
    <StubShell title={t.historyTitle} note={t.historyNote}>
      <HomeButton label={t.backToHome} />
    </StubShell>
  );
}
