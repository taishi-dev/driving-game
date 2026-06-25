import * as THREE from "three";
import type {
  ReplayFrame,
  SignalStateLog,
  MissionCheckpoint,
  FeedbackEvent,
  LessonId,
} from "./store";

/**
 * Everything {@link calculateMissionScore} needs to grade a run. All of it is
 * plain data plus a course path, so scoring can be unit-tested without the
 * store, React, or a live MediaPipe session. The impure inputs the store used
 * to read inline — the wall clock and the lesson's checkpoint table — are
 * passed in (`now`, `lessonCheckpoints`) so the calculation stays deterministic.
 */
export interface MissionScoreInput {
  lesson: LessonId;
  frames: ReplayFrame[];
  /** The ideal racing line; only `getPointAt` is needed. */
  coursePath: { getPointAt(t: number): THREE.Vector3 };
  signalStateLogs: SignalStateLog[];
  /**
   * The lesson's checkpoint table (MISSION_CHECKPOINTS[lesson]). Drives BOTH the
   * signal-violation check (visual:'traffic-light' entries) and the missed-checkpoint
   * penalty (entries with scored !== false, excluding the traffic-light signal).
   */
  lessonCheckpoints: MissionCheckpoint[];
  clearedCheckpointIds: string[];
  language: "ja" | "en";
  /** Timestamp stamped onto generated feedback logs (Date.now() in the store). */
  now: number;
}

export interface MissionScoreResult {
  /** Penalty to add to the store's running deviationPenalty. */
  addedDeviationPenalty: number;
  /** KAIZEN feedback entries to append to the store's feedbackLogs. */
  newFeedbackLogs: FeedbackEvent[];
}

const PATH_RESOLUTION = 100;
const PENALTY_DIST = 2.5;
const STRAIGHT_SPEED_LIMIT = 60;
const DEFAULT_SPEED_LIMIT = 20;
const SPEED_LIMIT_TOLERANCE = 5;
const SPEEDING_FRAME_THRESHOLD = 30;
const STOP_SPEED_THRESHOLD = 5; // km/h
const DEFAULT_STOP_MIN_DURATION = 1000; // ms
const SIGNAL_VIOLATION_PENALTY = 10;
const MISSED_CHECKPOINT_PENALTY = 20;

/**
 * Grade a completed run. Pure: returns the penalty delta and the feedback logs
 * to append; the caller applies them to the store. free-mode is never scored.
 */
export function calculateMissionScore(input: MissionScoreInput): MissionScoreResult {
  if (input.lesson === "free-mode") {
    return { addedDeviationPenalty: 0, newFeedbackLogs: [] };
  }

  const { frames, coursePath, language, now } = input;
  const speedLimit = input.lesson === "straight" ? STRAIGHT_SPEED_LIMIT : DEFAULT_SPEED_LIMIT;

  // --- Path deviation + speeding ---
  const pathPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= PATH_RESOLUTION; i++) {
    pathPoints.push(coursePath.getPointAt(i / PATH_RESOLUTION));
  }

  let deviationPenalty = 0;
  let speedViolations = 0;
  for (const frame of frames) {
    const pos = new THREE.Vector3(frame.position[0], frame.position[1], frame.position[2]);

    let minDist = 1000;
    for (const p of pathPoints) {
      const d = p.distanceTo(pos);
      if (d < minDist) minDist = d;
    }

    if (minDist > PENALTY_DIST) {
      deviationPenalty += 1.0 + (minDist - PENALTY_DIST) * 0.2;
    }

    if (frame.speed && frame.speed > speedLimit + SPEED_LIMIT_TOLERANCE) {
      speedViolations++;
    }
  }

  // --- Traffic-signal stop check before/at the stop line ---
  let signalViolations = 0;
  try {
    for (const cp of input.lessonCheckpoints) {
      if (cp.type !== "stop" || cp.visual !== "traffic-light") continue;

      const crossingIndex = frames.findIndex((frame) => {
        const pos = new THREE.Vector3(frame.position[0], frame.position[1], frame.position[2]);
        const cpPos = new THREE.Vector3(cp.position[0], cp.position[1], cp.position[2]);
        return pos.distanceTo(cpPos) < cp.radius;
      });

      if (crossingIndex === -1) continue;

      const hitTime = frames[crossingIndex].timestamp;
      const logsForCp = input.signalStateLogs.filter(
        (l) => l.checkpointId === cp.id && l.time <= hitTime,
      );
      const stateAtHit = logsForCp.length ? logsForCp[logsForCp.length - 1].state : "green";

      // How long the vehicle was stopped immediately before crossing.
      const minDur = cp.minDuration ?? DEFAULT_STOP_MIN_DURATION;
      let stoppedDuration = 0;
      let j = crossingIndex;
      while (j > 0) {
        const dt = frames[j].timestamp - frames[j - 1].timestamp;
        if ((frames[j].speed || 0) <= STOP_SPEED_THRESHOLD) {
          stoppedDuration += dt;
          j--;
        } else {
          break;
        }
      }

      if (stateAtHit === "red" && stoppedDuration < minDur) {
        signalViolations++;
      }
    }
  } catch (e) {
    // Be defensive - do not break scoring if anything goes wrong.
    console.error("Signal violation check failed", e);
  }

  // --- Uncleared (missed) checkpoints ---
  // Scored entries only (scored !== false), excluding the traffic-light signal —
  // its scoring is owned by the signal-violation path above, so counting it here
  // too would double-penalize.
  const missedCheckpoints = input.lessonCheckpoints.filter(
    (cp) =>
      cp.scored !== false &&
      cp.visual !== "traffic-light" &&
      !input.clearedCheckpointIds.includes(cp.id),
  );

  // --- Build feedback logs ---
  const newFeedbackLogs: FeedbackEvent[] = [];

  if (speedViolations > SPEEDING_FRAME_THRESHOLD) {
    newFeedbackLogs.push({
      time: now,
      type: "KAIZEN",
      message:
        language === "en"
          ? `Speeding detected (limit: ${speedLimit} km/h)`
          : `速度超過がありました (最大制限: ${speedLimit}km/h)`,
    });
  }

  if (signalViolations > 0) {
    newFeedbackLogs.push({
      time: now,
      type: "KAIZEN",
      message:
        language === "en"
          ? `Failed to stop at a red light ${signalViolations} time(s)`
          : `赤信号で停止しなかったチェックが ${signalViolations} 回ありました`,
      meta: { penalty: SIGNAL_VIOLATION_PENALTY * signalViolations, signalViolations },
    });
  }

  // English mode uses type-based wording; Japanese mode keeps the specific
  // checkpoint label (which is the JA-mode display text).
  for (const cp of missedCheckpoints) {
    let msg = "";
    if (cp.type === "stop") {
      msg = language === "en" ? "You ignored a required stop" : `${cp.label || "一時停止"}を無視しました`;
    } else if (cp.type === "safety-check") {
      msg = language === "en" ? "You skipped a safety check" : `${cp.label || "安全確認"}を行いませんでした`;
    }
    if (msg) {
      newFeedbackLogs.push({ time: now, type: "KAIZEN", message: msg });
    }
  }

  const missedPenalty = missedCheckpoints.length * MISSED_CHECKPOINT_PENALTY;

  return {
    addedDeviationPenalty: deviationPenalty + missedPenalty,
    newFeedbackLogs,
  };
}
