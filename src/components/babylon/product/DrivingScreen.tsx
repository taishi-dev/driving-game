"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useDrivingStore } from "@/lib/store";
import { getBriefing, getLessonTitle } from "@/lib/lessonCatalog";
import { STEER_MAGNITUDE } from "@/lib/driveControls";

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
    warning: "警告",
    throttle: "アクセル",
    brake: "ブレーキ",
    steer: "ハンドル",
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
    warning: "WARNING",
    throttle: "THROTTLE",
    brake: "BRAKE",
    steer: "STEER",
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
  const drivingFeedback = useDrivingStore((s) => s.drivingFeedback);
  const throttle = useDrivingStore((s) => s.throttle);
  const brake = useDrivingStore((s) => s.brake);
  const steeringAngle = useDrivingStore((s) => s.steeringAngle);
  const t = STRINGS[language];

  // Steering position normalized to [-1, 1] for the HUD indicator (keyboard
  // steer is ±STEER_MAGNITUDE; clamp so any larger value still stays on the rail).
  const steerNorm = Math.max(-1, Math.min(1, steeringAngle / STEER_MAGNITUDE));

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

      {/* Title + lesson name (top-left). The subtitle is the LOCALIZED lesson
          title (not the raw LessonId). */}
      <div className="absolute top-0 left-0 z-10 p-4 pr-6 max-w-[70%] pointer-events-none select-none">
        <h1 className="text-2xl font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{t.appTitle}</h1>
        <p className="text-sm opacity-80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
          {getLessonTitle(currentLesson, language)}
        </p>
      </div>

      {/* Rearview-mirror frame: a bezel overlaying the in-scene mirror RTT
          (top-center) so it reads as a mirror against the sky. Kept in sync with
          the mirror's on-screen rectangle in rearviewMirror.ts / mirrorLayout.ts
          (widthFrac 0.26, topMargin 0.02, 2:1 aspect). */}
      <div
        className="absolute z-10 pointer-events-none select-none"
        style={{ top: "2%", left: "50%", width: "26%", transform: "translateX(-50%)", aspectRatio: "2 / 1" }}
        data-testid="mirror-frame"
      >
        <div className="w-full h-full rounded-lg border-[3px] border-slate-200/70 shadow-[0_2px_10px_rgba(0,0,0,0.55),inset_0_0_0_2px_rgba(0,0,0,0.5)]" />
      </div>

      {/* Controls hint (bottom-left, above the FPS badge). p-3 keeps the left
          edge clear of the viewport edge (fixes the pre-existing clipping). */}
      <div className="absolute bottom-12 left-3 z-10 max-w-[60%] pointer-events-none select-none">
        <p className="text-xs opacity-80 bg-black/40 rounded px-2 py-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
          {t.controlsHint}
        </p>
      </div>

      {/* B7c: checkpoint-cleared toast (original Dashboard's green popup — the
          strings come verbatim from the frozen evaluateCheckpoint). */}
      {drivingFeedback && (
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none">
          <div
            data-testid="driving-feedback"
            className="bg-black/80 border-2 border-green-400 rounded-xl px-8 py-4 text-green-400 text-2xl font-bold whitespace-nowrap shadow-[0_0_20px_rgba(74,222,128,0.3)]"
          >
            {drivingFeedback}
          </div>
        </div>
      )}

      {/* Off-track WARNING (centered, blinking) — the original Dashboard's
          off-track feedback. Complements the compact OFF TRACK badge in the HUD. */}
      {isOffTrack && (
        <div
          data-testid="offtrack-warning"
          className="absolute top-[30%] left-1/2 -translate-x-1/2 z-20 text-center pointer-events-none select-none animate-pulse"
        >
          <div className="text-2xl font-bold tracking-[0.25em] px-5 py-2 rounded border-2 border-red-500 bg-red-950/50 text-red-400">
            {t.warning}
          </div>
          <div className="text-sm mt-1 text-red-400">{t.offTrack}</div>
        </div>
      )}

      {/* HUD: speed + gear + throttle/brake + steering + off-track (bottom-right) */}
      <div className="absolute bottom-6 right-6 z-10 flex items-end gap-4 pointer-events-none select-none">
        {isOffTrack && (
          <div className="px-3 py-1 rounded bg-red-600/80 text-sm font-bold font-mono animate-pulse">{t.offTrack}</div>
        )}
        <div className="px-5 py-3 rounded-lg bg-black/50 border border-white/10 font-mono min-w-[190px]">
          {/* Speed + gear */}
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs text-slate-400">{t.speed}</div>
              <div className="text-3xl font-bold leading-none" data-testid="hud-speed">
                {speed}
                <span className="text-sm text-slate-400 ml-1">km/h</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-400" data-testid="hud-gear">
              {gear}
            </div>
          </div>

          {/* Throttle / brake bars (live from the store) */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2" data-testid="hud-throttle" data-value={throttle.toFixed(2)}>
              <span className="text-[10px] w-14 text-slate-400">{t.throttle}</span>
              <div className="flex-1 h-2 rounded bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-[width] duration-75"
                  style={{ width: `${Math.round(Math.max(0, Math.min(1, throttle)) * 100)}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2" data-testid="hud-brake" data-value={brake.toFixed(2)}>
              <span className="text-[10px] w-14 text-slate-400">{t.brake}</span>
              <div className="flex-1 h-2 rounded bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-red-500 transition-[width] duration-75"
                  style={{ width: `${Math.round(Math.max(0, Math.min(1, brake)) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Steering indicator: centered track with a thumb that tracks steer. */}
          <div className="mt-3" data-testid="hud-steer" data-value={steerNorm.toFixed(2)}>
            <div className="text-[10px] text-slate-400 mb-1">{t.steer}</div>
            <div className="relative h-2 rounded bg-white/10">
              <div className="absolute left-1/2 top-0 h-full w-px bg-white/40" />
              <div
                className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-blue-400 shadow transition-[left] duration-75"
                style={{ left: `${50 + steerNorm * 50}%` }}
              />
            </div>
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
