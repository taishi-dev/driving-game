import { create } from "zustand";
import { FootCalibration, PedalState } from "./footPedalRecognition";
import * as THREE from "three";
import { User } from "firebase/auth";
import { MISSION_CHECKPOINTS, type MissionCheckpoint } from "@/lib/mission/missions";
import { calculateMissionScore } from "./scoring";

export interface ReplayFrame {
  timestamp: number;
  position: [number, number, number];
  rotation: [number, number, number];
  steering: number;
  speed: number;
  headRotation: { pitch: number; yaw: number; roll: number };
}

export interface MissionHistoryItem {
  id: string;
  timestamp: number;
  lesson: string;
  score: number;
  clearTime: string;
  feedbackSummary: string;
}

export interface FeedbackEvent {
  time: number;
  type: "KAIZEN" | "GOOD";
  message: string;
  meta?: Record<string, unknown>;
}

/** Signal / Traffic Light state logs */
export type SignalState = "green" | "yellow" | "red";

export interface SignalStateLog {
  time: number;
  checkpointId: string;
  state: SignalState;
}

// The canonical checkpoint type now lives in the pure mission module. Re-export
// it so existing importers (scoring, checkpointEval, useRegisterCheckpoint) that
// import MissionCheckpoint from the store stay unchanged.
export type { MissionCheckpoint };

export type LessonId =
  | "free-mode"
  | "straight"
  | "s-curve"
  | "crank"
  | "left-turn"
  | "right-turn"
  | "traffic-light"
  | "crosswalk"
  | "railroad-crossing";

export type ScreenId = "home" | "driving" | "feedback" | "auth" | "history" | "tutorial" | "language";
export type MissionState = "idle" | "briefing" | "active" | "success" | "failed";

export interface DrivingState {
  // Screen Management
  screen: ScreenId;
  isPaused: boolean;
  // UI language. Persisted to localStorage; default English.
  language: "ja" | "en";

  // Vehicle Control, Head Tracking, Foot Pedal, Telemetry, Replay System, System
  steeringAngle: number;
  throttle: number;
  brake: number;
  headRotation: { pitch: number; yaw: number; roll: number };
  footCalibration: FootCalibration | null;
  pedalState: PedalState;
  calibrationStage: "idle" | "waiting_for_brake" | "calibrated";
  speed: number;
  gear: "P" | "D" | "R";

  currentLesson: LessonId;

  missionState: MissionState;
  isOffTrack: boolean;
  drivingFeedback: string | null;

  isReplaying: boolean;
  replayData: ReplayFrame[];
  replayViewMode: "chase" | "driver";

  isVisionReady: boolean;
  debugInfo: string;

  // Auth / History
  user: User | null;
  missionHistory: MissionHistoryItem[];

  setUser: (user: User | null) => void;
  setMissionHistory: (history: MissionHistoryItem[]) => void;
  addHistoryItem: (item: MissionHistoryItem) => void;

  // Actions
  setScreen: (screen: ScreenId) => void;
  setLanguage: (lang: "ja" | "en") => void;
  setIsPaused: (paused: boolean) => void;
  setSteering: (val: number) => void;
  setPedals: (throttle: number, brake: number) => void;
  setSpeed: (speed: number) => void;

  setLesson: (lesson: LessonId) => void;

  setMissionState: (state: MissionState) => void;
  setOffTrack: (isOff: boolean) => void;
  setDrivingFeedback: (msg: string | null) => void;
  setHeadRotation: (rotation: { pitch: number; yaw: number; roll: number }) => void;
  setVisionReady: (ready: boolean) => void;
  setDebugInfo: (info: string) => void;
  setFootCalibration: (calibration: FootCalibration | null) => void;
  updatePedalState: (pedalState: PedalState) => void;
  setCalibrationStage: (stage: "idle" | "waiting_for_brake" | "calibrated") => void;
  startCalibration: () => void;

  // Pedal input mode: camera (foot tracking) or keyboard (W/S) fallback for
  // when legs/feet can't be tracked reliably. See docs/superpowers/plans/0004.
  pedalInputMode: "camera" | "keyboard";
  setPedalInputMode: (mode: "camera" | "keyboard") => void;

  // Mission scoring/time
  missionStartTime: number;
  missionEndTime: number;
  deviationPenalty: number;
  addDeviationPenalty: (amount: number) => void;
  calculateMissionResult: (coursePath: THREE.CurvePath<THREE.Vector3>) => void;

  // Replay
  setIsReplaying: (isReplaying: boolean) => void;
  setReplayViewMode: (mode: "chase" | "driver") => void;
  addReplayFrame: (frame: ReplayFrame) => void;
  clearReplayData: () => void;

  // Feedback / Gaze / Video
  gaze: { x: number; y: number };
  feedbackLogs: FeedbackEvent[];
  recordedVideo: string | null;
  signalStateLogs: SignalStateLog[];
  setGaze: (gaze: { x: number; y: number }) => void;
  addFeedbackLog: (log: FeedbackEvent) => void;
  addSignalStateLog: (log: SignalStateLog) => void;
  clearFeedbackLogs: () => void;
  clearSignalStateLogs: () => void;
  setRecordedVideo: (url: string | null) => void;
  setGear: (gear: "P" | "D" | "R") => void;

  // ✅ Added: type definitions for checkpoint management
  activeCheckpoints: MissionCheckpoint[];
  registerCheckpoint: (cp: MissionCheckpoint) => void;
  unregisterCheckpoint: (id: string) => void;

  // ✅ Added: cleared-checkpoint management
  clearedCheckpointIds: string[];
  addClearedCheckpoint: (id: string) => void;
  resetClearedCheckpoints: () => void;
}

export const useDrivingStore = create<DrivingState>((set) => ({
  // First launch (no saved language) starts on the language-selection page;
  // returning visitors (saved choice) go straight to Home. ClientApp is
  // client-only (ssr:false), so reading localStorage here is safe.
  screen:
    typeof window !== "undefined" && localStorage.getItem("language")
      ? "home"
      : "language",
  isPaused: false,
  // Default English: only an explicit saved "ja" choice yields Japanese;
  // unset or any other value resolves to English.
  language:
    typeof window !== "undefined" && localStorage.getItem("language") === "ja"
      ? "ja"
      : "en",

  steeringAngle: 0,
  throttle: 0,
  brake: 0,
  headRotation: { pitch: 0, yaw: 0, roll: 0 },

  footCalibration: null,
  pedalState: {
    throttle: 0,
    brake: 0,
    isAccelPressed: false,
    isBrakePressed: false,
    brakePressDuration: 0,
    brakePressCount: 0,
  },
  calibrationStage: "idle",
  pedalInputMode:
    typeof window !== "undefined" && localStorage.getItem("pedalInputMode") === "keyboard"
      ? "keyboard"
      : "camera",

  speed: 0,
  gear: "D",

  currentLesson: "straight",

  missionState: "idle",
  isOffTrack: false,
  drivingFeedback: null,

  isReplaying: false,
  replayData: [],
  replayViewMode: "chase",

  isVisionReady: false,
  debugInfo: "Initializing...",

  user: null,
  missionHistory: [],

  setUser: (user) => set({ user }),
  setMissionHistory: (history) => set({ missionHistory: history }),
  addHistoryItem: (item) =>
    set((state) => ({
      missionHistory: [item, ...state.missionHistory],
    })),

  setScreen: (screen) => set({ screen }),
  setLanguage: (lang) => {
    if (typeof window !== "undefined") localStorage.setItem("language", lang);
    set({ language: lang });
  },
  setIsPaused: (paused) => set({ isPaused: paused }),
  setSteering: (val) => set({ steeringAngle: val }),
  setPedals: (throttle, brake) => set({ throttle, brake }),
  setSpeed: (speed) => set({ speed }),

  setLesson: (lesson) =>
    set(() => ({
      currentLesson: lesson,
      missionState: lesson === "free-mode" ? "active" : "briefing",
      deviationPenalty: 0,
      missionStartTime: 0,
      missionEndTime: 0,
    })),

  missionStartTime: 0,
  missionEndTime: 0,

  setMissionState: (state) =>
    set(() => {
      const now = Date.now();
      const updates: Partial<DrivingState> = { missionState: state };

      if (state === "active") {
        updates.missionStartTime = now;
        updates.missionEndTime = 0;
        // Start-of-run reset: clear the previous run's per-run scoring state so a
        // same-lesson retry (currentLesson unchanged, so Car's lesson-change reset
        // never fires) doesn't stack onto it. Covers retry AND fresh-lesson starts.
        updates.feedbackLogs = [];
        updates.signalStateLogs = [];
        updates.deviationPenalty = 0;
        updates.clearedCheckpointIds = [];
      } else if (state === "success" || state === "failed") {
        updates.missionEndTime = now;
      }
      return updates;
    }),

  deviationPenalty: 0,
  addDeviationPenalty: (amount) =>
    set((s) => ({ deviationPenalty: s.deviationPenalty + amount })),

  calculateMissionResult: (coursePath) => {
    const st = useDrivingStore.getState();
    // free-mode is not scored
    if (st.currentLesson === "free-mode") return;

    // Scoring lives in the pure, unit-tested calculateMissionScore (scoring.ts);
    // the store just supplies the run snapshot and applies the result.
    const result = calculateMissionScore({
      lesson: st.currentLesson,
      frames: st.replayData,
      coursePath,
      signalStateLogs: st.signalStateLogs,
      lessonCheckpoints: MISSION_CHECKPOINTS[st.currentLesson] || [],
      activeCheckpoints: st.activeCheckpoints,
      clearedCheckpointIds: st.clearedCheckpointIds,
      language: st.language,
      now: Date.now(),
    });

    set((s) => ({
      deviationPenalty: s.deviationPenalty + result.addedDeviationPenalty,
      feedbackLogs: [...s.feedbackLogs, ...result.newFeedbackLogs],
    }));
  },

  setOffTrack: (isOff) => set({ isOffTrack: isOff }),
  setDrivingFeedback: (msg) => set({ drivingFeedback: msg }),
  setHeadRotation: (rotation) => set({ headRotation: rotation }),
  setVisionReady: (ready) => set({ isVisionReady: ready }),
  setDebugInfo: (info) => set({ debugInfo: info }),
  setFootCalibration: (calibration) => set({ footCalibration: calibration }),
  updatePedalState: (pedalState) =>
    set({ pedalState, throttle: pedalState.throttle, brake: pedalState.brake }),
  setCalibrationStage: (stage) => set({ calibrationStage: stage }),
  setPedalInputMode: (mode) => {
    if (typeof window !== "undefined") localStorage.setItem("pedalInputMode", mode);
    set({ pedalInputMode: mode });
  },
  startCalibration: () =>
    set({
      calibrationStage: "waiting_for_brake",
      footCalibration: null,
      debugInfo: "キャリブレーション開始: ブレーキを踏んでください",
    }),

  setIsReplaying: (isReplaying) => set({ isReplaying }),
  setReplayViewMode: (mode) => set({ replayViewMode: mode }),
  addReplayFrame: (frame) => set((state) => ({ replayData: [...state.replayData, frame] })),
  clearReplayData: () => set({ replayData: [] }),

  gaze: { x: 0, y: 0 },
  feedbackLogs: [],
  recordedVideo: null,
  signalStateLogs: [],
  setGaze: (gaze) => set({ gaze }),
  addFeedbackLog: (log) => set((state) => ({ feedbackLogs: [...state.feedbackLogs, log] })),
  addSignalStateLog: (log) => set((state) => ({ signalStateLogs: [...state.signalStateLogs, log] })),
  clearFeedbackLogs: () => set({ feedbackLogs: [] }),
  clearSignalStateLogs: () => set({ signalStateLogs: [] }),
  setRecordedVideo: (url) => set({ recordedVideo: url }),
  setGear: (gear) => set({ gear }),

  // ✅ Added: checkpoint management implementation (this was missing)
  activeCheckpoints: [],
  registerCheckpoint: (cp) => set((state) => ({ 
    activeCheckpoints: [...state.activeCheckpoints, cp] 
  })),
  unregisterCheckpoint: (id) => set((state) => ({ 
    activeCheckpoints: state.activeCheckpoints.filter((c) => c.id !== id) 
  })),

  // ✅ Added: cleared-state management implementation
  clearedCheckpointIds: [],
  addClearedCheckpoint: (id) => set((state) => ({
    clearedCheckpointIds: [...state.clearedCheckpointIds, id]
  })),
  resetClearedCheckpoints: () => set({ clearedCheckpointIds: [] }),
}));

// E2E/debug hook: expose the store on `window.__drivingStore`. The store holds
// the authenticated Firebase user, so this is DOUBLE-gated to ensure it can never
// reach a real production deploy:
//   1. build-time: only when NEXT_PUBLIC_E2E === "1" (set by the CI e2e job, never
//      by the production deploy), so the block is dead-code-eliminated from prod
//      bundles entirely; and
//   2. runtime: only when the URL carries `?e2e`.
// Used by the Playwright tests to read state (e.g. steeringAngle) with no UI element.
if (process.env.NEXT_PUBLIC_E2E === "1" && typeof window !== "undefined") {
  try {
    if (new URLSearchParams(window.location.search).has("e2e")) {
      (window as unknown as { __drivingStore?: typeof useDrivingStore }).__drivingStore =
        useDrivingStore;
    }
  } catch {
    // location may be unavailable in some environments; ignore.
  }
}
