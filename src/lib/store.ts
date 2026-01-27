import { create } from "zustand";
import { FootCalibration, PedalState } from "./footPedalRecognition";
import * as THREE from "three";
import { User } from "firebase/auth";

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
}

export type LessonId =
  | "free-mode"
  | "straight"
  | "s-curve"
  | "crank"
  | "left-turn"
  | "right-turn";

export type ScreenId = "home" | "driving" | "feedback" | "auth" | "history" | "tutorial";
export type MissionState = "idle" | "briefing" | "active" | "success" | "failed";

// ✅ 追加: チェックポイントの型定義
export type MissionCheckpoint = {
  id: string;
  position: [number, number, number];
  radius: number;
  type: 'stop' | 'speed-limit' | 'mirror' | 'safety-check';
  label?: string;
  targetYaw?: number; 
};

export interface DrivingState {
  // Screen Management
  screen: ScreenId;
  isPaused: boolean;

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
  setGaze: (gaze: { x: number; y: number }) => void;
  addFeedbackLog: (log: FeedbackEvent) => void;
  clearFeedbackLogs: () => void;
  setRecordedVideo: (url: string | null) => void;

  // ✅ 追加: チェックポイント管理用のアクション
  activeCheckpoints: MissionCheckpoint[];
  registerCheckpoint: (cp: MissionCheckpoint) => void;
  unregisterCheckpoint: (id: string) => void;

  // ✅ 追加: クリア済みチェックポイント管理
  clearedCheckpointIds: string[];
  addClearedCheckpoint: (id: string) => void;
  resetClearedCheckpoints: () => void;
}

export const useDrivingStore = create<DrivingState>((set) => ({
  screen: "home",
  isPaused: false,

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
    if (st.currentLesson === "free-mode") return;

    const frames = st.replayData;
    const currentLesson = st.currentLesson;

    let deviationPenalty = 0;
    let speedViolations = 0;

    const pathResolution = 100;
    const PENALTY_DIST = 2.5;
    const SPEED_LIMIT = currentLesson === "straight" ? 60 : 20;

    const pathPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= pathResolution; i++) {
      pathPoints.push(coursePath.getPointAt(i / pathResolution));
    }

    frames.forEach((frame) => {
      const pos = new THREE.Vector3(frame.position[0], frame.position[1], frame.position[2]);

      let minDist = 1000;
      for (const p of pathPoints) {
        const d = p.distanceTo(pos);
        if (d < minDist) minDist = d;
      }

      if (minDist > PENALTY_DIST) {
        deviationPenalty += 1.0 + (minDist - PENALTY_DIST) * 0.2;
      }

      if (frame.speed && frame.speed > SPEED_LIMIT + 5) {
        speedViolations++;
      }
    });

    // ▼▼▼ 追加: 未クリアのチェックポイント判定 ▼▼▼
    const newLogs = [...st.feedbackLogs];
    
    // 未クリア（activeにはあるが、clearedにはないID）を抽出
    const missedCheckpoints = st.activeCheckpoints.filter(
      cp => !st.clearedCheckpointIds.includes(cp.id)
    );

    missedCheckpoints.forEach(cp => {
      let msg = "";
      if (cp.type === 'stop') msg = `${cp.label || '一時停止'}を無視しました`;
      else if (cp.type === 'safety-check') msg = `${cp.label || '安全確認'}を行いませんでした`;
      
      if (msg) {
        newLogs.push({
          time: Date.now(),
          type: "KAIZEN",
          message: msg
        });
      }
    });
    // ▲▲▲ 追加終わり ▲▲▲

    set((s) => {
      // 既存の速度違反ログ
      if (speedViolations > 30) {
        newLogs.push({
          time: Date.now(),
          type: "KAIZEN",
          message: `速度超過がありました (最大制限: ${SPEED_LIMIT}km/h)`,
        });
      }

      // 未クリア数に応じたペナルティ加算 (例: 1つにつき20点)
      const missedPenalty = missedCheckpoints.length * 20;

      return {
        deviationPenalty: s.deviationPenalty + deviationPenalty + missedPenalty,
        feedbackLogs: newLogs,
      };
    });
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
  setGaze: (gaze) => set({ gaze }),
  addFeedbackLog: (log) => set((state) => ({ feedbackLogs: [...state.feedbackLogs, log] })),
  clearFeedbackLogs: () => set({ feedbackLogs: [] }),
  setRecordedVideo: (url) => set({ recordedVideo: url }),

  // ✅ 追加: チェックポイント管理の実装
  activeCheckpoints: [],
  registerCheckpoint: (cp) => set((state) => ({ 
    activeCheckpoints: [...state.activeCheckpoints, cp] 
  })),
  unregisterCheckpoint: (id) => set((state) => ({ 
    activeCheckpoints: state.activeCheckpoints.filter((c) => c.id !== id) 
  })),

  // ✅ 追加: クリア済み管理の実装
  clearedCheckpointIds: [],
  addClearedCheckpoint: (id) => set((state) => ({
    clearedCheckpointIds: [...state.clearedCheckpointIds, id]
  })),
  resetClearedCheckpoints: () => set({ clearedCheckpointIds: [] }),
}));