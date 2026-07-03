"use client";

import { useDrivingStore } from "@/lib/store";
import { COMMON_STRINGS } from "@/lib/uiStrings";

/**
 * B7b placeholder / stub screens. Each is a self-contained screen with a clear
 * "return to home" path and NO Firebase / R3F imports (fail-soft: nothing here
 * touches config-dependent modules). Remaining stubs land in later tasks:
 *   - Auth / History  -> B10 (Firebase auth + saved runs)
 * (Feedback and Tutorial graduated to real screens in B7c — see
 *  FeedbackScreen.tsx / TutorialScreen.tsx in this directory.)
 *
 * `backToHome` is shared (B9 consolidation): this file previously had its own
 * "ホームへ戻る" that had drifted from the canonical "ホームに戻る" used
 * elsewhere — see `uiStrings.ts`.
 */

const STRINGS = {
  ja: {
    authTitle: "ログイン / 登録",
    authNote: "アカウント機能は B10 で実装予定です。",
    historyTitle: "走行履歴",
    historyNote: "走行履歴は B10 で実装予定です。",
  },
  en: {
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

export function AuthScreen() {
  const language = useDrivingStore((s) => s.language);
  const t = STRINGS[language];
  return (
    <StubShell title={t.authTitle} note={t.authNote}>
      <HomeButton label={COMMON_STRINGS.backToHome[language]} />
    </StubShell>
  );
}

export function HistoryScreen() {
  const language = useDrivingStore((s) => s.language);
  const t = STRINGS[language];
  return (
    <StubShell title={t.historyTitle} note={t.historyNote}>
      <HomeButton label={COMMON_STRINGS.backToHome[language]} />
    </StubShell>
  );
}
