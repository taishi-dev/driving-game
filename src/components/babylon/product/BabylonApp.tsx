"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { useDrivingStore } from "@/lib/store";
import { HomeScreen } from "./HomeScreen";
import { LanguageScreen } from "./LanguageScreen";
import { DrivingScreen } from "./DrivingScreen";
import { FeedbackScreen } from "./FeedbackScreen";
import { TutorialScreen } from "./TutorialScreen";
import { AuthScreen, HistoryScreen } from "./StubScreens";

/**
 * B7b — the Babylon product app shell. THIS is the product at `/` now (the old
 * React-Three-Fiber `ClientApp` is retired from the root route). It is a pure
 * store-driven screen router: it reads `screen` from the engine-agnostic zustand
 * store and renders exactly one screen. First launch with no saved language
 * starts on the picker (store `screen` init); afterwards it starts on Home.
 *
 * No Firebase here: auth/history are B10 stubs, so the shell stays fail-soft and
 * never imports config-dependent modules at the root.
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
      return (
        <div className="absolute inset-0 z-50 p-10 text-red-400 bg-slate-900">
          <h1 className="text-2xl font-bold mb-2">Something went wrong.</h1>
          <p>Please reload the page.</p>
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
