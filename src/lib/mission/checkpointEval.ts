import type { MissionCheckpoint } from "../store";

export type Language = "ja" | "en";

export interface SafetyCheckState {
  lookedLeft: boolean;
  lookedRight: boolean;
}

export interface CheckpointEvalInput {
  checkpoint: MissionCheckpoint;
  /** Car's post-physics x/z position. */
  position: { x: number; z: number };
  /** Head yaw (radians). */
  headYaw: number;
  /** Signed speed (speed.current); the stop check uses Math.abs. */
  speed: number;
  language: Language;
  /** Accumulated left/right-looked state for safety-check checkpoints. */
  safety: SafetyCheckState;
}

export interface CheckpointEvalResult {
  /** True iff this checkpoint should be marked cleared this frame. */
  cleared: boolean;
  /** Driving-feedback string to show (caller shows it for 2s), or null. */
  feedback: string | null;
  /** Updated safety state (accumulated/reset for safety-check; unchanged otherwise). */
  safety: SafetyCheckState;
}

const RESET_SAFETY: SafetyCheckState = { lookedLeft: false, lookedRight: false };

/**
 * Pure per-checkpoint clear decision, lifted verbatim from Car's checkpoint loop.
 * The caller skips already-cleared checkpoints, applies the result (mark cleared +
 * addClearedCheckpoint + feedback timer), and threads `safety` across frames.
 */
export function evaluateCheckpoint(input: CheckpointEvalInput): CheckpointEvalResult {
  const { checkpoint: cp, position, headYaw, speed, language, safety } = input;

  const dx = position.x - cp.position[0];
  const dz = position.z - cp.position[2];
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist < cp.radius) {
    // [A] Stop
    if (cp.type === "stop") {
      if (Math.abs(speed) < 0.02) {
        return {
          cleared: true,
          feedback: language === "en" ? "🛑 Stop OK!" : `🛑 ${cp.label || "一時停止"} OK!`,
          safety,
        };
      }
    } else if (cp.type === "mirror" || cp.type === "safety-check") {
      // [B] Mirror / left-right safety check
      if (cp.type === "safety-check") {
        // Count it as looked once yaw exceeds 0.3 rad (~17 deg); flags latch until reset.
        const next: SafetyCheckState = {
          lookedLeft: safety.lookedLeft || headYaw > 0.3,
          lookedRight: safety.lookedRight || headYaw < -0.3,
        };
        if (next.lookedLeft && next.lookedRight) {
          return {
            cleared: true,
            feedback: language === "en" ? "👀 Left-Right Check OK!" : `👀 ${cp.label || "安全確認"} OK!`,
            safety: { ...RESET_SAFETY },
          };
        }
        return { cleared: false, feedback: null, safety: next };
      }
      // Conventional mirror logic (literal feedback, no i18n, fixed 0.5 tolerance).
      const needed = cp.targetYaw || 0;
      const tolerance = 0.5;
      if (Math.abs(headYaw - needed) < tolerance) {
        return { cleared: true, feedback: "👀 Check OK!", safety };
      }
    }
    return { cleared: false, feedback: null, safety };
  }

  // Outside the zone: reset safety once the car has passed a safety-check area.
  if (cp.type === "safety-check" && dist > cp.radius + 2) {
    return { cleared: false, feedback: null, safety: { ...RESET_SAFETY } };
  }

  return { cleared: false, feedback: null, safety };
}
