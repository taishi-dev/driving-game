import { Vector3 } from "three";
import type { LessonId } from "../store";

// Mission goal definitions (position, size, rotation Y). Moved verbatim out of
// MissionController so this is a pure lib module (no React / component import
// cycle through the store).
export const MISSION_GOALS: Record<
  string,
  { position: [number, number, number]; size: [number, number, number]; rotation: number }
> = {
  straight: {
    position: [0, 0, -150],
    size: [10, 5, 5],
    rotation: 0,
  },

  "left-turn": {
    // getCoursePath(): the exit keeps z=-38 while x goes -8 → -60, so -30 is OK
    position: [-30, 0, -38],
    size: [10, 5, 5],
    rotation: Math.PI / 2,
  },

  "right-turn": {
    // getCoursePath(): the exit keeps z=-38 while x goes 8 → 60, so 30 is OK
    position: [30, 0, -38],
    size: [10, 5, 5],
    rotation: -Math.PI / 2,
  },

  "s-curve": {
    position: [0, 0, -100],
    size: [10, 5, 5],
    rotation: 0,
  },

  crank: {
    // getCoursePath(): ends with a straight at xL=-8, with ( -8,0,-100 ) as the endpoint
    position: [-8, 0, -100],
    size: [10, 5, 5],
    rotation: 0,
  },

  "traffic-light": {
    position: [0, 0, -100],
    size: [10, 5, 5],
    rotation: 0,
  },

  "crosswalk": {
    position: [0, 0, -80],
    size: [10, 5, 5],
    rotation: 0,
  },

  "railroad-crossing": {
    position: [0, 0, -100],
    size: [10, 5, 5],
    rotation: 0,
  },
};

export type CheckpointType = "stop" | "mirror" | "speed-limit" | "safety-check";

/**
 * Canonical checkpoint type — the single merge of the former store `MissionCheckpoint`
 * and MissionController `Checkpoint`. `orientation` and `yawTolerance` are load-bearing
 * (RoadProps reads `orientation`; mirror grading uses `targetYaw`); `visual` is the
 * tighter "traffic-light" literal.
 */
export interface MissionCheckpoint {
  id: string;
  type: CheckpointType;
  position: [number, number, number];
  radius: number;
  visual?: "traffic-light";
  orientation?: "z" | "x";
  // For stop signs:
  minDuration?: number; // How long to stop
  // For mirrors:
  targetYaw?: number; // Expected look direction (radians)
  yawTolerance?: number;
  // Label used for feedback display
  label?: string;
  /**
   * Whether this checkpoint is graded/penalized (default true when omitted).
   * false = render-only visual: e.g. the turn-lesson stop/mirror (currently
   * unenforced), and the traffic-light signal whose scoring is owned by the
   * separate signal-violation path (so it must not also be counted as missed).
   */
  scored?: boolean;
}

// Single source of truth for BOTH the rendered props (RoadProps) AND grading/
// scoring (useMission + scoring.ts). The `scored` flags below preserve today's
// behavior exactly: turn stop/mirror and the traffic-light signal are render-only
// (scored:false); the crosswalk safety-check and railroad stop are the scored
// checkpoints (previously registered dynamically by the roadside objects, now the
// objects are pure decoration).
export const MISSION_CHECKPOINTS: Partial<Record<LessonId, MissionCheckpoint[]>> = {
  "left-turn": [
    // Enforced: stop at the line, then a mirror/safety check before turning.
    { id: "stop-1", type: "stop", position: [0, 0, -25], radius: 4, minDuration: 1000, label: "一時停止", scored: true },
    { id: "mirror-1", type: "mirror", position: [0, 0, -28], radius: 6, targetYaw: -0.5, yawTolerance: 0.5, label: "安全確認", scored: true },
  ],
  "right-turn": [
    { id: "stop-1", type: "stop", position: [0, 0, -25], radius: 4, label: "一時停止", scored: true },
    { id: "mirror-1", type: "mirror", position: [0, 0, -28], radius: 6, targetYaw: 0.5, yawTolerance: 0.5, label: "安全確認", scored: true },
  ],
  "traffic-light": [
    // Rendered (signal-cycling light + signal logs) and scored via the signal-violation
    // path, NOT the missed-checkpoint path — hence scored:false.
    { id: "signal-1", type: "stop", position: [0, 0, -18], radius: 4, minDuration: 1200, visual: "traffic-light", orientation: "z", label: "赤信号停止", scored: false },
  ],
  "crosswalk": [
    // Scored: left-right safety check (formerly registered by the Crosswalk object
    // at z=-30 r6). The crosswalk stripes are still drawn by that object (decoration).
    { id: "cw-safety-1", type: "safety-check", position: [0, 0, -30], radius: 6, label: "Crosswalk Safety Check", scored: true },
  ],
  "railroad-crossing": [
    // Scored: stop before the crossing (formerly registered by the RailroadCrossing
    // object, on-path at z=-60). RoadProps now draws the stop line here too.
    { id: "rr-stop-1", type: "stop", position: [0, 0, -60], radius: 5, label: "Railroad Crossing Stop", scored: true },
  ],
};

export function checkMissionGoal(lesson: string, position: Vector3) {
  const goal = MISSION_GOALS[lesson];
  if (!goal) return false;

  const dx = position.x - goal.position[0];
  const dz = position.z - goal.position[2];
  const dist = Math.sqrt(dx * dx + dz * dz);

  // Within 4 units of the center
  if (dist < 4) {
    return true;
  }

  return false;
}
