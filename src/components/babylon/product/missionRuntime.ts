"use client";

import { useDrivingStore, type ReplayFrame, type SignalState } from "@/lib/store";
import { getCoursePath } from "@/lib/course";
import {
  createGradingState,
  stepMissionGrading,
  gradingSpeedFromMetersPerSec,
  type GradingState,
} from "@/lib/mission/missionGrading";

/**
 * B7c — the mission runtime for the Babylon driving canvas. This is the Babylon
 * counterpart of the original `MissionController`/`useMission` wiring:
 *
 *  - Per rendered frame (while `missionState === "active"`, not paused/replaying,
 *    not free-mode) it records a {@link ReplayFrame} and advances the pure
 *    grading reducer (`stepMissionGrading` -> frozen missions/checkpointEval).
 *  - Cleared checkpoints -> `addClearedCheckpoint` + a 2s driving-feedback toast
 *    (exact original timing/strings from evaluateCheckpoint).
 *  - Goal reached -> snapshot replayData BEFORE scoring, `calculateMissionResult`
 *    (frozen scoring.ts via the store), `missionState: "success"`, feedback screen
 *    — the original useMission order, preserved.
 *  - traffic-light lesson: runs the original signal cycle (green 7s / yellow 2s /
 *    red 6s from RoadProps) and logs each state via `addSignalStateLog`, which is
 *    what scoring's signal-violation check replays against. The world has no 3D
 *    signal model yet (world build-out is tracked separately), so the canvas shows
 *    a DOM signal widget driven by `onSignalChange`.
 *
 * Faithful no-fail semantics: the original app never sets `missionState:"failed"`
 * (nothing in the R3F code writes it) — runs end in success or the driver exits.
 * Mirror/safety checkpoints read the store's headRotation as-is; without a webcam
 * (B11) headYaw stays 0, so they never clear and score as missed checkpoints
 * (-20 each) exactly like the original with no camera.
 */

/** Original signal cycle (verbatim from `RoadProps.tsx` SIGNAL_CYCLE). */
export const SIGNAL_CYCLE: readonly { state: SignalState; durationMs: number }[] = [
  { state: "green", durationMs: 7000 },
  { state: "yellow", durationMs: 2000 },
  { state: "red", durationMs: 6000 },
];

export interface MissionRuntimeDeps {
  /** Chassis world position (post-physics). */
  getPosition: () => { x: number; y: number; z: number };
  /** Chassis world rotation (Babylon euler, radians) for the replay recording. */
  getRotation: () => { x: number; y: number; z: number };
  /** Signed forward velocity in m/s (raycastVehicle debug.forwardVel). */
  getForwardVel: () => number;
  /** Signal widget hook; called on every traffic-light state change. */
  onSignalChange?: (state: SignalState) => void;
}

export interface MissionRuntime {
  /** Call once per rendered frame (after physics/telemetry). */
  step: () => void;
  dispose: () => void;
}

export function createMissionRuntime(deps: MissionRuntimeDeps): MissionRuntime {
  let grading: GradingState = createGradingState();
  let frames: ReplayFrame[] = [];
  let wasActive = false;
  let disposed = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  // --- Traffic-light signal cycle (only for the traffic-light lesson). ---
  // Mirrors the original TrafficLight component: log the current state on mount
  // and on every transition; the driver-facing widget follows via onSignalChange.
  let signalTimer: ReturnType<typeof setTimeout> | null = null;
  if (useDrivingStore.getState().currentLesson === "traffic-light") {
    let index = 0;
    const cycle = () => {
      if (disposed) return;
      const { state, durationMs } = SIGNAL_CYCLE[index];
      try {
        useDrivingStore
          .getState()
          .addSignalStateLog({ time: Date.now(), checkpointId: "signal-1", state });
      } catch {
        // noop — never break the drive loop on logging (original behavior).
      }
      deps.onSignalChange?.(state);
      index = (index + 1) % SIGNAL_CYCLE.length;
      signalTimer = setTimeout(cycle, durationMs);
    };
    cycle();
  }

  const step = () => {
    if (disposed) return;
    const st = useDrivingStore.getState();

    if (st.missionState !== "active") {
      wasActive = false;
      return;
    }
    // Fresh run start (first active frame): reset local grading + recording.
    // (Store-side per-run state is reset in setMissionState("active"); this covers
    // same-lesson retries where the canvas stays mounted.)
    if (!wasActive) {
      wasActive = true;
      grading = createGradingState();
      frames = [];
    }

    // Original useMission guards: no grading while paused / replaying / free-mode.
    if (st.isPaused || st.isReplaying || st.currentLesson === "free-mode") return;

    const pos = deps.getPosition();
    const rot = deps.getRotation();
    const forwardVel = deps.getForwardVel();

    // Record the replay frame (original Car.tsx contract: speed in km/h;
    // headRotation snapshot; rotation here is the Babylon chassis euler —
    // scoring only reads position/speed/timestamp, B8 replays the euler as-is).
    frames.push({
      timestamp: Date.now(),
      position: [pos.x, pos.y, pos.z],
      rotation: [rot.x, rot.y, rot.z],
      steering: st.steeringAngle,
      speed: Math.abs(forwardVel) * 3.6,
      headRotation: { ...st.headRotation },
    });

    const result = stepMissionGrading(grading, {
      lesson: st.currentLesson,
      position: { x: pos.x, z: pos.z },
      headYaw: st.headRotation.yaw,
      speed: gradingSpeedFromMetersPerSec(forwardVel),
      language: st.language,
    });

    for (const c of result.cleared) {
      st.addClearedCheckpoint(c.id);
      if (c.feedback) {
        st.setDrivingFeedback(c.feedback);
        timers.push(
          setTimeout(() => useDrivingStore.getState().setDrivingFeedback(null), 2000),
        );
      }
    }

    if (result.goalReached) {
      // Order preserved from useMission: snapshot replay BEFORE scoring (the
      // store's calculateMissionResult reads replayData), then score, then the
      // success transition, then the feedback screen.
      useDrivingStore.setState({ replayData: frames });
      st.calculateMissionResult(getCoursePath(st.currentLesson));
      st.setMissionState("success");
      st.setScreen("feedback");
      wasActive = false;
    }
  };

  const dispose = () => {
    disposed = true;
    if (signalTimer !== null) clearTimeout(signalTimer);
    timers.forEach(clearTimeout);
    timers.length = 0;
  };

  return { step, dispose };
}
