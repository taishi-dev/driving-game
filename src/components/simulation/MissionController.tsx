"use client";

import { useMemo } from "react";
import { useDrivingStore } from "@/lib/store";
import { getCoursePath } from "@/lib/course";
import { useMission } from "@/hooks/useMission";

/**
 * The mission grader. Owns goal detection, checkpoint clearing, and the scoring
 * trigger (via useMission) — logic that used to live in Car.tsx. Renders nothing;
 * it reads the car's per-frame transform from the CarTransform singleton. MUST be
 * mounted immediately AFTER <Car> in Scene so its useFrame runs after Car's
 * physics + transform write in the same tick (see useMission).
 *
 * The mission data (MISSION_GOALS, MISSION_CHECKPOINTS, checkMissionGoal, the
 * MissionCheckpoint type) now lives in the pure module @/lib/mission/missions.
 */
export function MissionController() {
  const currentLesson = useDrivingStore((s) => s.currentLesson);
  const coursePath = useMemo(() => getCoursePath(currentLesson), [currentLesson]);
  useMission(coursePath);
  return null;
}
