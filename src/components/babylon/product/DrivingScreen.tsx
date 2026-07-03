"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useDrivingStore } from "@/lib/store";
import { getBriefing } from "@/lib/lessonCatalog";

// Store-wired Babylon drive canvas. Client-only (WebGL/window + Havok WASM).
const DriveScreenCanvas = dynamic(() => import("./DriveScreenCanvas"), { ssr: false });

const STRINGS = {
  ja: {
    appTitle: "バーチャル教習所",
    controlsHint: "W/↑ アクセル · S/↓ ブレーキ · A/D/←→ ハンドル · 1 P · 2 D · 3 R",
    startMission: "ミッション開始",
    exit: "ホームへ戻る",
    exitHint: "Esc でホームへ",
    freeMode: "フリーモード",
    speed: "速度",
    offTrack: "コース外",
  },
  en: {
    appTitle: "Virtual Driving School",
    controlsHint: "W/↑ gas · S/↓ brake · A/D/←→ steer · 1 Park · 2 Drive · 3 Reverse",
    startMission: "Start Mission",
    exit: "Back to Home",
    exitHint: "Press Esc to exit",
    freeMode: "Free Mode",
    speed: "SPEED",
    offTrack: "OFF TRACK",
  },
} as const;

/**
 * B7b driving screen: the store-wired Babylon canvas plus its overlays —
 * pre-drive briefing (graded lessons only), a live HUD, and exit/back
 * (button + Escape). Grading / goal detection / scoring is B7c; this screen
 * only runs the drive and manages entry/exit, leaving `missionState` seams for
 * B7c to hook success/failure into.
 */
export function DrivingScreen() {
  const language = useDrivingStore((s) => s.language);
  const currentLesson = useDrivingStore((s) => s.currentLesson);
  const missionState = useDrivingStore((s) => s.missionState);
  const setMissionState = useDrivingStore((s) => s.setMissionState);
  const setScreen = useDrivingStore((s) => s.setScreen);
  const speed = useDrivingStore((s) => s.speed);
  const gear = useDrivingStore((s) => s.gear);
  const isOffTrack = useDrivingStore((s) => s.isOffTrack);
  const t = STRINGS[language];

  const goHome = () => {
    setMissionState("idle");
    setScreen("home");
  };

  // Escape exits to home; only while this screen is mounted.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") goHome();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const briefing = getBriefing(currentLesson, language);
  const showBriefing = missionState === "briefing" && briefing !== null;

  return (
    <div className="w-full h-full relative overflow-hidden bg-black text-white">
      {/* 3D drive scene */}
      <div className="absolute inset-0 z-0">
        <DriveScreenCanvas />
      </div>

      {/* Title + controls hint (top-left) */}
      <div className="absolute top-0 left-0 z-10 p-4 pointer-events-none select-none">
        <h1 className="text-2xl font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{t.appTitle}</h1>
        <p className="text-sm opacity-80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
          {currentLesson === "free-mode" ? t.freeMode : currentLesson}
          <br />
          {t.controlsHint}
        </p>
      </div>

      {/* HUD: speed + gear + off-track (bottom-right) */}
      <div className="absolute bottom-6 right-6 z-10 flex items-end gap-4 pointer-events-none select-none">
        {isOffTrack && (
          <div className="px-3 py-1 rounded bg-red-600/80 text-sm font-bold font-mono animate-pulse">{t.offTrack}</div>
        )}
        <div className="px-5 py-3 rounded-lg bg-black/50 border border-white/10 text-right font-mono">
          <div className="text-xs text-slate-400">{t.speed}</div>
          <div className="text-3xl font-bold" data-testid="hud-speed">
            {speed}
            <span className="text-sm text-slate-400 ml-1">km/h</span>
          </div>
          <div className="text-xl font-bold text-blue-400 mt-1" data-testid="hud-gear">
            {gear}
          </div>
        </div>
      </div>

      {/* Exit button (top-right) */}
      <button
        onClick={goHome}
        data-testid="drive-exit"
        className="absolute top-6 right-6 z-20 px-4 py-2 rounded-lg bg-slate-800/80 hover:bg-red-600 border border-slate-600 hover:border-red-500 text-sm font-bold transition-colors"
        title={t.exitHint}
      >
        ✕ {t.exit}
      </button>

      {/* Briefing overlay (graded lessons only) */}
      {showBriefing && briefing && (
        <div className="absolute inset-0 z-30 flex flex-col justify-center items-center bg-black/80">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-10 text-center max-w-2xl shadow-2xl">
            <h2 className="text-3xl font-bold text-blue-400 mb-5">MISSION: {briefing.title}</h2>
            <p className="text-lg leading-relaxed text-slate-300 mb-10">{briefing.desc}</p>
            <button
              onClick={() => setMissionState("active")}
              data-testid="briefing-start"
              className="px-10 py-3 text-xl font-bold bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-lg"
            >
              {t.startMission}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
