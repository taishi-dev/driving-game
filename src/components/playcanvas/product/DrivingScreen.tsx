"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useDrivingStore, type SignalState } from "@/lib/store";
import { createDriveControls } from "@/lib/pcDriveControls";
import { getBriefing, getLessonTitle } from "@/lib/pcLessonCatalog";
import { createProductDriveScene } from "../productDriveScene";
import { SHELL_STRINGS } from "./productStrings";

/**
 * P8 — HUD labels + off-track overlay strings (ja/en). Kept local to the driving
 * screen (E1 precedent) rather than in SHELL_STRINGS, which is shell chrome;
 * P9's i18n pass consolidates every screen's strings.
 */
const HUD_STRINGS = {
  ja: { speed: "速度", throttle: "アクセル", brake: "ブレーキ", steer: "ハンドル", warning: "警告", offTrack: "コース外" },
  en: { speed: "SPEED", throttle: "THROTTLE", brake: "BRAKE", steer: "STEER", warning: "WARNING", offTrack: "OFF TRACK" },
} as const;

// Ammo-gated PlayCanvas canvas (client-only), driving the store-wired scene.
const DriveCanvas = dynamic(() => import("../DriveCanvas"), { ssr: false });

// P11 webcam vision layer (self-positioned overlay: preview + localized status +
// camera-denied fallback). Client-only; mounted only while the driving screen is up.
const VisionController = dynamic(() => import("./VisionController"), { ssr: false });

/**
 * Traffic-light signal cycle, verbatim from the original `RoadProps.tsx`
 * SIGNAL_CYCLE (green 7s → yellow 2s → red 6s). Scoring's red-light check
 * (frozen scoring.ts) replays against the `signalStateLogs` this cycle writes.
 */
const SIGNAL_CYCLE: readonly { state: SignalState; durationMs: number }[] = [
  { state: "green", durationMs: 7000 },
  { state: "yellow", durationMs: 2000 },
  { state: "red", durationMs: 6000 },
];

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
  const throttle = useDrivingStore((s) => s.throttle);
  const brake = useDrivingStore((s) => s.brake);
  const steeringAngle = useDrivingStore((s) => s.steeringAngle);
  const isOffTrack = useDrivingStore((s) => s.isOffTrack);
  const drivingFeedback = useDrivingStore((s) => s.drivingFeedback);
  const setMissionState = useDrivingStore((s) => s.setMissionState);
  const setHeadRotation = useDrivingStore((s) => s.setHeadRotation);
  const t = SHELL_STRINGS[language];
  const hud = HUD_STRINGS[language];

  // Steering position normalized to [-1, 1] for the HUD indicator. The store's
  // steeringAngle is on the settled two-source scale: the webcam layer (P11)
  // writes ±1.0 (full lock), the keyboard writes ±0.6 (intentionally partial,
  // matching the original app). ±1.0 is the canonical full-lock scale, so
  // normalize by it directly — a full vision lock rails, keyboard reads ~60%.
  // The clamp guards overshoot.
  const steerNorm = Math.max(-1, Math.min(1, steeringAngle));

  // Traffic-light lesson only: the current signal, cycled by SIGNAL_CYCLE and
  // rendered as a DOM widget (the world has no 3D signal model yet).
  const [signal, setSignal] = useState<SignalState | null>(null);

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

  // Traffic-light signal cycle. DELIBERATE deviation from the original (and E1):
  // the original anchored the cycle at the TrafficLight component's mount, but
  // setMissionState("active") wipes signalStateLogs, so the first "green" log was
  // lost. Anchoring the cycle at missionState === "active" (after that wipe)
  // preserves the initial-state log and is a strictly better anchor — the E1
  // known edge, fixed here. Logs write to signalStateLogs for scoring's
  // red-light check; the local `signal` state drives the widget.
  const active = missionState === "active";
  useEffect(() => {
    if (currentLesson !== "traffic-light" || !active) return;
    let index = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const cycle = () => {
      if (cancelled) return;
      const { state, durationMs } = SIGNAL_CYCLE[index];
      try {
        useDrivingStore
          .getState()
          .addSignalStateLog({ time: Date.now(), checkpointId: "signal-1", state });
      } catch {
        // Never break the drive on a logging failure (original behavior).
      }
      setSignal(state);
      index = (index + 1) % SIGNAL_CYCLE.length;
      timer = setTimeout(cycle, durationMs);
    };
    cycle();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentLesson, active]);

  const briefing = missionState === "briefing" ? getBriefing(currentLesson, language) : null;

  return (
    <div className="w-full h-full relative overflow-hidden bg-black">
      {/* 3D drive canvas (store-wired) */}
      <div className="absolute inset-0 z-0">
        <DriveCanvas buildScene={createProductDriveScene} />
      </div>

      {/* P11 webcam vision layer: hands→steering/gear, face→head/gaze,
          feet→pedals (calibrated), plus the localized status panel and the
          camera-denied keyboard-fallback overlay. Self-positioned (top-right,
          clearing the exit button). */}
      <VisionController />

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

      {/* Full product HUD: speed + gear + throttle/brake bars + steering
          indicator + off-track badge (bottom-right). Throttle/brake/steer read
          live from the store (the same fields the webcam layer writes in P11);
          the steer indicator is normalized to ±1.0 full-lock. */}
      <div className="absolute bottom-6 right-6 z-10 flex items-end gap-4 pointer-events-none select-none">
        {isOffTrack && (
          <div className="px-3 py-1 rounded bg-red-600/80 text-sm font-bold font-mono animate-pulse">
            {hud.offTrack}
          </div>
        )}
        <div className="px-5 py-3 bg-slate-900/80 border border-slate-700 rounded-lg font-mono min-w-[210px]">
          {/* Speed + gear */}
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[10px] text-slate-400 tracking-widest">{hud.speed}</div>
              <div data-testid="hud-speed" className="text-4xl font-black text-white leading-none">
                {speed}
                <span className="text-sm font-bold text-slate-400 ml-1">{t.speedUnit}</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] font-bold text-slate-400 tracking-widest">{t.gearLabel}</div>
              <div data-testid="hud-gear" className="text-3xl font-black text-blue-400 leading-none">
                {gear}
              </div>
            </div>
          </div>

          {/* Throttle / brake bars (live from the store) */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2" data-testid="hud-throttle" data-value={throttle.toFixed(2)}>
              <span className="text-[10px] w-16 text-slate-400">{hud.throttle}</span>
              <div className="flex-1 h-2 rounded bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-[width] duration-75"
                  style={{ width: `${Math.round(Math.max(0, Math.min(1, throttle)) * 100)}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2" data-testid="hud-brake" data-value={brake.toFixed(2)}>
              <span className="text-[10px] w-16 text-slate-400">{hud.brake}</span>
              <div className="flex-1 h-2 rounded bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-red-500 transition-[width] duration-75"
                  style={{ width: `${Math.round(Math.max(0, Math.min(1, brake)) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Steering indicator: centered track with a thumb tracking steerNorm. */}
          <div className="mt-3" data-testid="hud-steer" data-value={steerNorm.toFixed(2)}>
            <div className="text-[10px] text-slate-400 mb-1">{hud.steer}</div>
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

      {/* Off-track WARNING (centered, blinking) — the original Dashboard's
          off-track overlay (WARNING / OFF TRACK at top-30%, blink). Complements
          the compact OFF TRACK badge in the HUD above. */}
      {isOffTrack && (
        <div
          data-testid="offtrack-warning"
          className="absolute top-[30%] left-1/2 -translate-x-1/2 z-20 text-center pointer-events-none select-none animate-pulse"
        >
          <div className="text-2xl font-bold tracking-[0.25em] px-5 py-2 rounded border-2 border-red-500 bg-red-950/50 text-red-400">
            {hud.warning}
          </div>
          <div className="text-sm mt-1 text-red-400">{hud.offTrack}</div>
        </div>
      )}

      {/* Traffic-light signal widget (traffic-light lesson only). Drives the same
          SIGNAL_CYCLE that scoring's red-light check replays. */}
      {signal && active && (
        <div
          data-testid="drive-signal"
          data-signal={signal}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900/85 border border-white/15 pointer-events-none select-none"
        >
          {(["green", "yellow", "red"] as const).map((c) => (
            <div
              key={c}
              className={`w-6 h-6 rounded-full ${
                c === "green" ? "bg-green-500" : c === "yellow" ? "bg-yellow-500" : "bg-red-500"
              }`}
              style={{
                opacity: signal === c ? 1 : 0.15,
                boxShadow: signal === c ? "0 0 14px currentColor" : "none",
              }}
            />
          ))}
        </div>
      )}

      {/* Driving-feedback toast (checkpoint OK / safety-check flashes, 2s each).
          top-20% per the original Dashboard, above the off-track warning (30%). */}
      {drivingFeedback && (
        <div
          data-testid="drive-feedback"
          className="absolute top-[20%] left-1/2 -translate-x-1/2 z-20 px-6 py-3 rounded-xl bg-black/70 border border-green-500/50 text-2xl font-bold text-green-300 pointer-events-none select-none"
        >
          {drivingFeedback}
        </div>
      )}

      {/* Briefing overlay (graded lessons only) */}
      {briefing && (
        <div className="absolute inset-0 z-30 bg-black/80 flex flex-col items-center justify-center">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-10 text-center max-w-xl shadow-2xl">
            <h2 className="text-3xl font-bold text-blue-400 mb-5">MISSION: {briefing.title}</h2>
            <p className="text-lg leading-relaxed text-slate-300 mb-10">{briefing.desc}</p>
            <button
              data-testid="briefing-start"
              onClick={() => {
                // Per-run head reset (E1 lesson): graded lessons — the only ones
                // with mirror/safety checkpoints — always enter "active" through
                // this button. The frozen setMissionState("active") does not touch
                // headRotation, so clear it here so a stale yaw from a prior run
                // can't leak into this run's checkpoint grading. A live camera
                // overwrites yaw next frame; with no camera it stays 0, exactly
                // what grading expects.
                setHeadRotation({ pitch: 0, yaw: 0, roll: 0 });
                setMissionState("active");
              }}
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
