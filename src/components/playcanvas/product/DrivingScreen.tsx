"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect } from "react";
import { useDrivingStore } from "@/lib/store";
import { createDriveControls } from "@/lib/pcDriveControls";
import { getBriefing, getLessonTitle } from "@/lib/pcLessonCatalog";
import { createProductDriveScene } from "../productDriveScene";
import { SHELL_STRINGS } from "./productStrings";

// Ammo-gated PlayCanvas canvas (client-only), driving the store-wired scene.
const DriveCanvas = dynamic(() => import("../DriveCanvas"), { ssr: false });

/**
 * P7a — the product driving screen.
 *
 * Input path: a window keydown/keyup pair feeds the pure pcDriveControls
 * contract (P6) and writes the result into the frozen store on change —
 * setPedals(gas, brake), setSteering(±0.6 keyboard partial), setGear(P/D/R).
 * The store-wired scene (productDriveScene.ts) consumes those fields per frame
 * (signed-throttle helper applies the gear sign) and writes back
 * setSpeed(rounded, on change) + setIsOffTrack — which is what the HUD below
 * renders. The webcam layer (P11) will write the same store fields at full
 * ±1.0 steer scale; nothing on this screen changes for it.
 *
 * Briefing: graded lessons arrive with missionState "briefing" (set by the
 * store's setLesson); the overlay shows the localized title/desc from the pure
 * pcLessonCatalog and Start flips missionState to "active" — the scene holds
 * the car on the brake until then. Free mode arrives already "active" (no
 * briefing, drivable immediately).
 *
 * Exit: the ✕ button (settled wording: ホームへ戻る — the へ form on THIS
 * screen only) or Escape → missionState "idle", screen "home" (original
 * handleGoHome semantics), zeroing the control fields on the way out.
 */
export function DrivingScreen() {
  const language = useDrivingStore((s) => s.language);
  const missionState = useDrivingStore((s) => s.missionState);
  const currentLesson = useDrivingStore((s) => s.currentLesson);
  const speed = useDrivingStore((s) => s.speed);
  const gear = useDrivingStore((s) => s.gear);
  const setMissionState = useDrivingStore((s) => s.setMissionState);
  const t = SHELL_STRINGS[language];

  const exitToHome = useCallback(() => {
    const st = useDrivingStore.getState();
    // Zero the live control fields so nothing carries into the next session.
    st.setPedals(0, 0);
    st.setSteering(0);
    st.setSpeed(0);
    st.setIsPaused(false);
    st.setMissionState("idle");
    st.setScreen("home");
  }, []);

  // Keyboard → pcDriveControls → store (write-on-change), plus Escape = exit.
  useEffect(() => {
    const controls = createDriveControls();
    const st = useDrivingStore.getState();
    // Fresh session starts in D with released pedals, whatever the last run left.
    st.setGear(controls.getGear());
    st.setPedals(0, 0);
    st.setSteering(0);

    const write = () => {
      const s = useDrivingStore.getState();
      const { gas, brake, steer } = controls.getInput();
      if (s.throttle !== gas || s.brake !== brake) s.setPedals(gas, brake);
      if (s.steeringAngle !== steer) s.setSteering(steer);
      const g = controls.getGear();
      if (s.gear !== g) s.setGear(g);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        exitToHome();
        return;
      }
      controls.keyDown(e.key);
      write();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      controls.keyUp(e.key);
      write();
    };
    const onBlur = () => {
      controls.reset();
      write();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      // Release everything on the way out (strict-mode remount re-inits above).
      const s = useDrivingStore.getState();
      s.setPedals(0, 0);
      s.setSteering(0);
    };
  }, [exitToHome]);

  const briefing = missionState === "briefing" ? getBriefing(currentLesson, language) : null;

  return (
    <div className="w-full h-full relative overflow-hidden bg-black">
      {/* 3D drive canvas (store-wired) */}
      <div className="absolute inset-0 z-0">
        <DriveCanvas buildScene={createProductDriveScene} />
      </div>

      {/* Top-left: lesson title + a small key hint (full HUD arrives in P8). */}
      <div className="absolute top-14 left-3 z-10 pointer-events-none select-none">
        <h1 className="text-xl font-extrabold italic tracking-tight text-white drop-shadow">
          {getLessonTitle(currentLesson, language)}
        </h1>
        <p className="text-xs text-slate-300/80 mt-1 drop-shadow">{t.drivingHint}</p>
      </div>

      {/* Exit (settled wording: へ form here, に elsewhere) — Escape also exits.
          z-40: ABOVE the briefing overlay (z-30) so a learner can back out of a
          briefing with the mouse, not only via Escape. */}
      <button
        data-testid="drive-exit"
        onClick={exitToHome}
        className="absolute top-3 right-3 z-40 px-4 py-2 bg-slate-900/80 hover:bg-red-700/90 border border-slate-600 hover:border-red-500 rounded text-sm font-bold text-white transition-colors"
      >
        {t.exitHome}
      </button>

      {/* Basic HUD: speed + gear (P8 grows this into the full product HUD). */}
      <div className="absolute bottom-6 right-6 z-10 flex items-end gap-4 pointer-events-none select-none">
        <div className="px-5 py-3 bg-slate-900/80 border border-slate-700 rounded-lg text-right">
          <div data-testid="hud-speed" className="text-4xl font-black font-mono text-white leading-none">
            {speed}
            <span className="text-sm font-bold text-slate-400 ml-1">{t.speedUnit}</span>
          </div>
        </div>
        <div className="px-4 py-3 bg-slate-900/80 border border-slate-700 rounded-lg text-center">
          <div className="text-[10px] font-bold text-slate-400 tracking-widest">{t.gearLabel}</div>
          <div data-testid="hud-gear" className="text-3xl font-black font-mono text-blue-400 leading-none">
            {gear}
          </div>
        </div>
      </div>

      {/* Briefing overlay (graded lessons only) */}
      {briefing && (
        <div className="absolute inset-0 z-30 bg-black/80 flex flex-col items-center justify-center">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-10 text-center max-w-xl shadow-2xl">
            <h2 className="text-3xl font-bold text-blue-400 mb-5">MISSION: {briefing.title}</h2>
            <p className="text-lg leading-relaxed text-slate-300 mb-10">{briefing.desc}</p>
            <button
              data-testid="briefing-start"
              onClick={() => setMissionState("active")}
              className="px-10 py-3 text-xl font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg transition-colors"
            >
              {t.startMission}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
