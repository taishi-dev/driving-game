"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { useDrivingStore } from "@/lib/store";
import { SHELL_STRINGS } from "./productStrings";
import { LanguageScreen } from "./LanguageScreen";
import { HomeScreen } from "./HomeScreen";
import { DrivingScreen } from "./DrivingScreen";
import { FeedbackScreen } from "./FeedbackScreen";
import { TutorialScreen } from "./TutorialScreen";
import { AuthStub, HistoryStub } from "./StubScreens";

/**
 * P7a — the PlayCanvas product shell, mounted at `/`.
 *
 * A store-driven screen router over the frozen zustand store's `ScreenId`
 * (language / home / driving / feedback / tutorial / auth / history). First
 * launch (no persisted `language` in localStorage) starts on the language
 * picker; returning visitors start on Home — that decision lives in store.ts'
 * `screen` initializer, not here.
 *
 * feedback (P7b score/results; P8 adds the replay scene) and tutorial (P7b) are
 * now real screens; auth / history remain minimal localized STUBS until P10.
 * Firebase auth restore is also P10 — until then the header is always GUEST.
 */

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.toString() };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Class component: read the store snapshot directly (no hooks) rather
      // than subscribing — a crash fallback doesn't need to react to a later
      // language change. P9: this was English-only in both languages.
      const t = SHELL_STRINGS[useDrivingStore.getState().language];
      return (
        <div className="absolute inset-0 z-50 p-10 bg-white text-red-600">
          <h1 className="text-2xl font-bold">{t.errorTitle}</h1>
          <p>{t.errorBody}</p>
          {/* Raw error only in development — never expose stacks in production. */}
          {process.env.NODE_ENV !== "production" && <pre>{this.state.error}</pre>}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ProductApp() {
  const screen = useDrivingStore((s) => s.screen);

  return (
    <ErrorBoundary>
      <div className="relative w-full h-screen overflow-hidden bg-black text-white font-sans">
        {screen === "language" && <LanguageScreen />}
        {screen === "home" && <HomeScreen />}
        {screen === "driving" && <DrivingScreen />}
        {screen === "feedback" && <FeedbackScreen />}
        {screen === "tutorial" && <TutorialScreen />}
        {screen === "auth" && <AuthStub />}
        {screen === "history" && <HistoryStub />}
      </div>
    </ErrorBoundary>
  );
}
