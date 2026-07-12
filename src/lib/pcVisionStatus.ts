import type { PedalState } from "./footPedalRecognition.ts";
import type { CalibrationStage } from "./vision/pedalDecision.ts";

/**
 * P11 — pure, localized presentation of the vision status panel + camera-error
 * overlay for the PlayCanvas product shell. Extracted from the original
 * VisionController's inline (English-only) `getStatusDisplay` / `getUserMedia`
 * error strings so the product can render the same status in BOTH languages.
 * Pure + `node --test`-covered; the product `VisionController` maps the returned
 * `tone` to colors and applies the text. No store / DOM / clock. (Mirrors the
 * E1 `visionStatus.ts` contract so the two engine ports stay comparable.)
 */

export type Language = "ja" | "en";

/** Semantic status the panel is in; the component maps this to a color scheme. */
export type VisionStatusTone = "info" | "calibrating" | "brake" | "accel" | "idle";

export interface VisionStatusView {
  title: string;
  message: string;
  tone: VisionStatusTone;
}

export interface VisionStatusInput {
  calibrationStage: CalibrationStage;
  pedalState: PedalState;
  /** footCalibration?.isCalibrated — pedal readouts only show once truly calibrated. */
  footCalibrated: boolean;
  /** Store debugInfo; shown verbatim in the pre-calibration "starting" state and
   *  parsed for the calibration progress percent. */
  debugInfo: string;
}

/** Parse the first "NN%" out of a debug string (calibration progress); 0 if none. */
export function progressPercentFromDebugInfo(debugInfo: string): number {
  const match = debugInfo.match(/(\d+)%/);
  return match ? parseInt(match[1], 10) : 0;
}

const STATUS_STRINGS = {
  ja: {
    startingTitle: "📷 カメラを起動中",
    calibratingTitle: "⚠️ 足を固定中...",
    calibratingMessage: (p: number) => `5秒間、足を動かさずに待ってください (${p}%)`,
    brakeTitle: "🔴 ブレーキ",
    brakeMessage: (pct: number) => `ブレーキ力: ${pct}%`,
    accelTitle: "🟢 アクセル",
    accelMessage: (pct: number) => `アクセル: ${pct}%`,
    idleTitle: "⚪ アイドル",
    idleMessage: "ペダル入力なし",
  },
  en: {
    startingTitle: "📷 Starting camera",
    calibratingTitle: "⚠️ Holding foot still...",
    calibratingMessage: (p: number) => `Please keep your foot still for 5 seconds (${p}%)`,
    brakeTitle: "🔴 Brake",
    brakeMessage: (pct: number) => `Braking force: ${pct}%`,
    accelTitle: "🟢 Accelerator",
    accelMessage: (pct: number) => `Throttle: ${pct}%`,
    idleTitle: "⚪ Idle",
    idleMessage: "No pedal input",
  },
} as const;

/**
 * Localized status view, mirroring the original getStatusDisplay branching:
 *   - waiting_for_brake  -> calibration progress
 *   - calibrated + calibrated flag -> brake / accel / idle by pedalState
 *   - otherwise           -> "starting camera" with the raw debugInfo message.
 */
export function getVisionStatusDisplay(input: VisionStatusInput, lang: Language): VisionStatusView {
  const s = STATUS_STRINGS[lang];
  const { calibrationStage, pedalState, footCalibrated, debugInfo } = input;

  if (calibrationStage === "waiting_for_brake") {
    return {
      title: s.calibratingTitle,
      message: s.calibratingMessage(progressPercentFromDebugInfo(debugInfo)),
      tone: "calibrating",
    };
  }

  if (calibrationStage === "calibrated" && footCalibrated) {
    if (pedalState.isBrakePressed) {
      return { title: s.brakeTitle, message: s.brakeMessage(Math.round(pedalState.brake * 100)), tone: "brake" };
    }
    if (pedalState.isAccelPressed) {
      return { title: s.accelTitle, message: s.accelMessage(Math.round(pedalState.throttle * 100)), tone: "accel" };
    }
    return { title: s.idleTitle, message: s.idleMessage, tone: "idle" };
  }

  return { title: s.startingTitle, message: debugInfo, tone: "info" };
}

export type CameraErrorKind = "unsupported" | "denied" | "error";

const CAMERA_ERROR_STRINGS = {
  ja: {
    title: "📷 カメラを利用できません",
    unsupported: "このブラウザはカメラに対応していません。キーボードで運転できます（矢印キーでハンドル操作）。",
    denied: "カメラへのアクセスが拒否されました。ブラウザ設定で許可するか、キーボードで運転してください（矢印キーでハンドル操作）。",
    error: "カメラを起動できませんでした。キーボードでも運転できます（矢印キーでハンドル操作）。",
  },
  en: {
    title: "📷 Camera unavailable",
    unsupported: "This browser does not support the camera. You can drive with the keyboard (use the arrow keys to steer).",
    denied: "Camera access was denied. Allow it in your browser settings, or drive with the keyboard (use the arrow keys to steer).",
    error: "The camera could not be started. You can also drive with the keyboard (use the arrow keys to steer).",
  },
} as const;

/** Localized camera-error overlay copy (title + body) for each failure kind. */
export function cameraErrorMessage(kind: CameraErrorKind, lang: Language): { title: string; body: string } {
  const s = CAMERA_ERROR_STRINGS[lang];
  return { title: s.title, body: s[kind] };
}

const MODEL_ERROR_STRINGS = {
  ja: {
    title: "🤖 AIモデルを読み込めません",
    body: "AIモデルの読み込みに失敗しました。通信環境を確認して再試行するか、キーボードで運転してください（矢印キーでハンドル操作）。",
  },
  en: {
    title: "🤖 Could not load AI models",
    body: "The AI models failed to load. Check your connection and retry, or drive with the keyboard (use the arrow keys to steer).",
  },
} as const;

/** Localized model-load-error overlay copy (title + body). */
export function modelErrorMessage(lang: Language): { title: string; body: string } {
  return MODEL_ERROR_STRINGS[lang];
}
