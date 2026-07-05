"use client";

import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { useDrivingStore } from "@/lib/store";
import { SHELL_STRINGS } from "./productStrings";
import { LanguageScreen } from "./LanguageScreen";
import { HomeScreen } from "./HomeScreen";
import { DrivingScreen } from "./DrivingScreen";
import { FeedbackScreen } from "./FeedbackScreen";
import { TutorialScreen } from "./TutorialScreen";
import { AuthScreen } from "./AuthScreen";
import { HistoryScreen } from "./HistoryScreen";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

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
 * real screens; auth / history graduated in P10 (Firebase, fail-soft guest
 * path) — every screen is now real, nothing left stubbed.
 *
 * P10: the shell restores the persisted Firebase auth session on load
 * (original ClientApp semantics). `@/lib/firebase` is the single FAIL-SOFT
 * entry — with no NEXT_PUBLIC_FIREBASE_* config it exports `auth = null`
 * instead of throwing at import, so the whole product still boots and runs as
 * guest with zero config.
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

  // Restore the persisted Firebase auth session on load (original ClientApp
  // semantics): Firebase keeps the session in browserLocalPersistence, but the
  // store re-inits `user` to null on every page load — without this, a reload
  // silently demotes the user to guest (history won't load, runs aren't saved).
  // Fail-soft: `auth` is null when Firebase is unconfigured, so this is a no-op.
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      const store = useDrivingStore.getState();
      store.setUser(u);
      if (!u) store.setMissionHistory([]);
    });
    return unsubscribe;
  }, []);

  return (
    <ErrorBoundary>
      <div className="relative w-full h-screen overflow-hidden bg-black text-white font-sans">
        {screen === "language" && <LanguageScreen />}
        {screen === "home" && <HomeScreen />}
        {screen === "driving" && <DrivingScreen />}
        {screen === "feedback" && <FeedbackScreen />}
        {screen === "tutorial" && <TutorialScreen />}
        {screen === "auth" && <AuthScreen />}
        {screen === "history" && <HistoryScreen />}
      </div>
    </ErrorBoundary>
  );
}
