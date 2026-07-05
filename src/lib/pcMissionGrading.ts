import type { Vector3 } from "three";
// Explicit .ts extensions so `node --test` (native type-stripping, no bundler
// resolution) can execute this module directly; Next's resolver + tsconfig
// allowImportingTsExtensions both accept them. The frozen modules themselves use
// only type-only relative imports (erased), so they stay untouched and unread by
// the runtime resolver here.
import { checkMissionGoal, MISSION_CHECKPOINTS } from "./mission/missions.ts";
import { evaluateCheckpoint, type SafetyCheckState, type Language } from "./mission/checkpointEval.ts";
import type { LessonId } from "./store.ts";

/**
 * P7b — the engine-agnostic per-frame mission-progress reducer for the PlayCanvas
 * product (D1.a rewrite of the same contract E1 settled).
 *
 * This is the pure heart of the original R3F `useMission` (goal detection +
 * checkpoint clearing), lifted out of React/Three so both the PlayCanvas drive
 * scene (`productDriveScene.ts`) and `node --test` can drive it. It calls the
 * FROZEN pure mission modules (`checkMissionGoal`, `evaluateCheckpoint`,
 * `MISSION_CHECKPOINTS`) UNCHANGED, so a known run grades identically to the
 * original app — the whole point of the trial.
 *
 * The caller owns all side effects: it feeds one {@link GradingFrame} per rendered
 * frame while a mission is `active`, records replay frames, then applies the
 * returned result to the store (addClearedCheckpoint + driving-feedback toast +
 * the success transition). The reducer only mutates its own {@link GradingState}
 * (cleared set + safety latch), exactly as `useMission`'s refs did.
 *
 * SPEED UNIT CONTRACT (verified against the frozen modules + the original's
 * recording, NOT assumed):
 *   - The original stored physics `speed.current` where `display km/h = speed *
 *     100`, and evaluateCheckpoint's stop test is `Math.abs(speed) < 0.02` — i.e.
 *     the frozen module expects the km/h-DISPLAY value divided by 100, so a car
 *     under 2 km/h reads as stopped. (The original also recorded replay frames as
 *     `speed * 100` = km/h, which is what scoring.ts's km/h speed limits expect.)
 *   - The PlayCanvas vehicle reports real km/h (`getCurrentSpeedKmHour`), which IS
 *     the display scale. So {@link GradingFrame.speed} is the display km/h and the
 *     reducer feeds `speed / 100` to evaluateCheckpoint (see {@link STOP_SPEED_DISPLAY_DIVISOR}).
 *     The caller records replay frames at the raw display km/h (see productDriveScene).
 */

/** Display-km/h → frozen-checkpoint speed unit: `< 0.02` ⟺ `< 2 km/h` stopped. */
export const STOP_SPEED_DISPLAY_DIVISOR = 100;

export interface GradingState {
  /** Ids of checkpoints already cleared this run (skip re-evaluating). */
  cleared: Set<string>;
  /** Accumulated left/right-looked latch for safety-check checkpoints. */
  safety: SafetyCheckState;
}

export function createGradingState(): GradingState {
  return { cleared: new Set<string>(), safety: { lookedLeft: false, lookedRight: false } };
}

export interface GradingFrame {
  lesson: LessonId;
  /** Car's post-physics x/z position (world units matching course.ts/missions.ts). */
  position: { x: number; z: number };
  /** Head yaw (radians); 0 without a webcam (P11 feeds it live). */
  headYaw: number;
  /**
   * DISPLAY km/h (Math.abs of the vehicle's signed speed). The reducer converts
   * it to the frozen checkpointEval scale internally — see the SPEED UNIT CONTRACT.
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
  /** Checkpoints newly cleared this frame (already recorded into `state.cleared`). */
  cleared: ClearedCheckpoint[];
}

/**
 * Advance grading by one frame. Mutates `state` (adds cleared ids, threads the
 * safety latch) and returns what changed for the caller to apply. Order matches
 * `useMission` EXACTLY: goal is checked FIRST and short-circuits the checkpoint
 * loop; free-mode is never graded; only SCORED checkpoints (scored !== false) are
 * evaluated, over the single source of truth MISSION_CHECKPOINTS.
 */
export function stepMissionGrading(state: GradingState, frame: GradingFrame): GradingStep {
  if (frame.lesson === "free-mode") {
    return { goalReached: false, cleared: [] };
  }

  // Goal reached: return immediately (checkpoints are not evaluated this frame,
  // preserving useMission's early-return ordering). checkMissionGoal reads only
  // position.x / position.z, so the {x, z} shape is sufficient.
  if (checkMissionGoal(frame.lesson, frame.position as unknown as Vector3)) {
    return { goalReached: true, cleared: [] };
  }

  const scored = (MISSION_CHECKPOINTS[frame.lesson] ?? []).filter((c) => c.scored !== false);
  const cleared: ClearedCheckpoint[] = [];
  for (const cp of scored) {
    if (state.cleared.has(cp.id)) continue;

    const result = evaluateCheckpoint({
      checkpoint: cp,
      position: frame.position,
      headYaw: frame.headYaw,
      // Display km/h → frozen stop-test scale (< 0.02 ⟺ < 2 km/h).
      speed: frame.speed / STOP_SPEED_DISPLAY_DIVISOR,
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
