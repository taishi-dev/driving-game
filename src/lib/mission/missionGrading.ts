import type { Vector3 } from "three";
// Explicit .ts extensions so `node --test` (native type-stripping, no bundler
// resolution) can execute this module directly; tsconfig allowImportingTsExtensions
// and Next's resolver both accept them. The frozen modules themselves only use
// type-only relative imports, which are erased, so they stay untouched.
import { checkMissionGoal, MISSION_CHECKPOINTS } from "./missions.ts";
import { evaluateCheckpoint, type SafetyCheckState, type Language } from "./checkpointEval.ts";
import type { LessonId } from "../store.ts";

/**
 * B7c — the engine-agnostic per-frame mission-progress reducer.
 *
 * This is the pure heart of the original R3F `useMission` (goal detection +
 * checkpoint clearing), lifted out of React/Three so both the Babylon drive
 * canvas and `node --test` can drive it. It calls the FROZEN pure mission modules
 * (`checkMissionGoal`, `evaluateCheckpoint`, `MISSION_CHECKPOINTS`) unchanged, so a
 * known replay grades identically to the original app.
 *
 * The caller owns all side effects: it feeds one {@link GradingFrame} per rendered
 * frame while a mission is `active`, then applies the returned result to the store
 * (addClearedCheckpoint + driving-feedback toast + the success transition). The
 * reducer only mutates its own {@link GradingState} (cleared set + safety latch),
 * exactly as `useMission`'s refs did.
 */
export interface GradingState {
  /** Ids of checkpoints already cleared this run (skip re-evaluating). */
  cleared: Set<string>;
  /** Accumulated left/right-looked latch for safety-check checkpoints. */
  safety: SafetyCheckState;
}

export function createGradingState(): GradingState {
  return { cleared: new Set<string>(), safety: { lookedLeft: false, lookedRight: false } };
}

/**
 * Convert a physics forward velocity (m/s, signed) into the ORIGINAL app's
 * speed unit, preserving the frozen checkpoint contract: the original stored
 * `speed.current` where `display km/h = speed * 100`, and evaluateCheckpoint's
 * stop test is `Math.abs(speed) < 0.02` (i.e. < 2 km/h ≈ 0.556 m/s).
 */
export function gradingSpeedFromMetersPerSec(mps: number): number {
  return (mps * 3.6) / 100;
}

export interface GradingFrame {
  lesson: LessonId;
  /** Car's post-physics x/z position (world units matching course.ts). */
  position: { x: number; z: number };
  /** Head yaw (radians); 0 without a webcam (B11 feeds it). */
  headYaw: number;
  /**
   * Signed speed for the stop-checkpoint near-zero test. Same semantics as the
   * original `carTransform.speed` (evaluateCheckpoint uses Math.abs(speed) < 0.02).
   */
  speed: number;
  language: Language;
}

export interface ClearedCheckpoint {
  id: string;
  /** Driving-feedback string to flash (caller shows it ~2s), or null. */
  feedback: string | null;
}

export interface GradingStep {
  /** True the first frame the car sits within the lesson goal. */
  goalReached: boolean;
  /** Checkpoints newly cleared this frame (already recorded into state). */
  cleared: ClearedCheckpoint[];
}

/**
 * Advance grading by one frame. Mutates `state` (adds cleared ids, threads the
 * safety latch) and returns what changed for the caller to apply. Order matches
 * `useMission` exactly: goal is checked FIRST and short-circuits the checkpoint
 * loop; free-mode is never graded.
 */
export function stepMissionGrading(state: GradingState, frame: GradingFrame): GradingStep {
  if (frame.lesson === "free-mode") {
    return { goalReached: false, cleared: [] };
  }

  // Goal reached: return immediately (checkpoints are not evaluated this frame,
  // preserving useMission's early-return ordering).
  if (checkMissionGoal(frame.lesson, frame.position as unknown as Vector3)) {
    return { goalReached: true, cleared: [] };
  }

  // Clear over the lesson's SCORED checkpoints only (scored !== false); the
  // render-only entries (turn stop/mirror, traffic-light signal) are skipped.
  const scored = (MISSION_CHECKPOINTS[frame.lesson] ?? []).filter((c) => c.scored !== false);
  const cleared: ClearedCheckpoint[] = [];
  for (const cp of scored) {
    if (state.cleared.has(cp.id)) continue;

    const result = evaluateCheckpoint({
      checkpoint: cp,
      position: frame.position,
      headYaw: frame.headYaw,
      speed: frame.speed,
      language: frame.language,
      safety: state.safety,
    });
    state.safety = result.safety;

    if (result.cleared) {
      state.cleared.add(cp.id);
      cleared.push({ id: cp.id, feedback: result.feedback });
    }
  }

  return { goalReached: false, cleared };
}
