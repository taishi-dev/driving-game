import { LessonId } from "@/lib/store";
import { Vector3 } from "three";

export function MissionController() {
  // Logic is currently handled in Car.tsx due to access requirements
  return null;
}

// Goal Definitions (Position, Rotation Y, Size)
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
    // getCoursePath(): exit は z=-38 のまま x=-8 → -60 なので -30 はOK
    position: [-30, 0, -38],
    size: [10, 5, 5],
    rotation: Math.PI / 2,
  },

  "right-turn": {
    // getCoursePath(): exit は z=-38 のまま x=8 → 60 なので 30 はOK
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
    // getCoursePath(): 最後は xL=-8 の直進で ( -8,0,-100 ) が終点
    position: [-8, 0, -100],
    size: [10, 5, 5],
    rotation: 0,
  },

  "traffic-light": {
    position: [0, 0, -100],
    size: [10, 5, 5],
    rotation: 0,
  },

  // ✅ 追加: 横断歩道レベルのゴール
  "crosswalk": {
    position: [0, 0, -80],
    size: [10, 5, 5],
    rotation: 0,
  },
  // ✅ 追加: レベル8 ゴール
  "railroad-crossing": {
    position: [0, 0, -100], 
    size: [10, 5, 5],
    rotation: 0,
  },
};

// Checkpoints (Stop Signs, Mirrors)
export type CheckpointType = 'stop' | 'mirror' | 'speed-limit' | 'safety-check';

export interface Checkpoint {
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
    // ✅ 追加: フィードバック表示用のラベル
    label?: string;
}

export const MISSION_CHECKPOINTS: Partial<Record<LessonId, Checkpoint[]>> = {
    'left-turn': [
        // Stop line before intersection
        { id: 'stop-1', type: 'stop', position: [0, 0, -25], radius: 4, minDuration: 1000, label: '一時停止' },
        // Curve Mirror check (Look Right/Forward-Right to check traffic)
        { id: 'mirror-1', type: 'mirror', position: [0, 0, -28], radius: 6, targetYaw: -0.5, yawTolerance: 0.5, label: '安全確認' }
    ],
    'right-turn': [
        { id: 'stop-1', type: 'stop', position: [0, 0, -25], radius: 4, label: '一時停止' },
        // Mirror on Left Corner. Look Left.
        { id: 'mirror-1', type: 'mirror', position: [0, 0, -28], radius: 6, targetYaw: 0.5, yawTolerance: 0.5, label: '安全確認' }
    ],
    "traffic-light": [
        // 進入前の信号停止（直進のみ）
        { id: "signal-1", type: "stop", position: [0, 0, -18], radius: 4, minDuration: 1200, visual: "traffic-light", orientation: "z", label: '赤信号停止' },
    ],
    // ✅ 追加: 横断歩道レベルのチェックポイント
    "crosswalk": [
        // 横断歩道の手前で一時停止
        { id: 'cw-stop-1', type: 'stop', position: [0, 0, -25], radius: 5, minDuration: 1000, label: '横断歩道前停止' }
    ],
    // ✅ 追加: レベル8 チェックポイント
    "railroad-crossing": [
        // 踏切の手前で一時停止
        { id: 'rr-stop-1', type: 'stop', position: [0, 0, -50], radius: 5, minDuration: 2000, label: '踏切前一時停止' }
    ]
};

export function checkMissionGoal(lesson: string, position: Vector3) {
    const goal = MISSION_GOALS[lesson];
    if (!goal) return false;

    const dx = position.x - goal.position[0];
    const dz = position.z - goal.position[2];
    const dist = Math.sqrt(dx*dx + dz*dz);

    // Within 4 units of the center
    if (dist < 4) {
        return true;
    }

    return false;
}