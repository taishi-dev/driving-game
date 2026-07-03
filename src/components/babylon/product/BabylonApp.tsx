"use client";

import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { useDrivingStore } from "@/lib/store";
import { HomeScreen } from "./HomeScreen";
import { LanguageScreen } from "./LanguageScreen";
import { DrivingScreen } from "./DrivingScreen";
import { FeedbackScreen } from "./FeedbackScreen";
import { TutorialScreen } from "./TutorialScreen";
import { AuthScreen } from "./AuthScreen";
import { HistoryScreen } from "./HistoryScreen";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

/**
 * B7b — the Babylon product app shell. THIS is the product at `/` now (the old
 * React-Three-Fiber `ClientApp` is retired from the root route). It is a pure
 * store-driven screen router: it reads `screen` from the engine-agnostic zustand
 * store and renders exactly one screen. First launch with no saved language
 * starts on the picker (store `screen` init); afterwards it starts on Home.
 *
 * B10: the shell restores the persisted Firebase auth session on load (original
 * ClientApp semantics). `@/lib/firebase` is the single FAIL-SOFT entry — with no
 * NEXT_PUBLIC_FIREBASE_* config it exports `auth = null` instead of throwing at
 * import, so the whole product still boots and runs as guest with zero config.
 */

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.toString() };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[BabylonApp] uncaught error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      // Class component: read the store snapshot directly (no hooks) rather
      // than subscribing — a crash fallback doesn't need to react to a later
      // language change (B9: this used to be English-only in both languages).
      const language = useDrivingStore.getState().language;
      const t = language === "ja"
        ? { title: "問題が発生しました。", body: "ページを再読み込みしてください。" }
        : { title: "Something went wrong.", body: "Please reload the page." };
      return (
        <div className="absolute inset-0 z-50 p-10 text-red-400 bg-slate-900">
          <h1 className="text-2xl font-bold mb-2">{t.title}</h1>
          <p>{t.body}</p>
          {process.env.NODE_ENV !== "production" && (
            <pre className="mt-4 text-xs whitespace-pre-wrap">{this.state.error}</pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

function ScreenRouter() {
  const screen = useDrivingStore((s) => s.screen);
  switch (screen) {
    case "language":
      return <LanguageScreen />;
    case "home":
      return <HomeScreen />;
    case "driving":
      return <DrivingScreen />;
    case "feedback":
      return <FeedbackScreen />;
    case "tutorial":
      return <TutorialScreen />;
    case "auth":
      return <AuthScreen />;
    case "history":
      return <HistoryScreen />;
    default:
      return <HomeScreen />;
  }
}

export default function BabylonApp() {
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
      <div
        style={{
          width: "100%",
          height: "100vh",
          position: "relative",
          background: "black",
          overflow: "hidden",
        }}
      >
        <ScreenRouter />
      </div>
    </ErrorBoundary>
  );
}
