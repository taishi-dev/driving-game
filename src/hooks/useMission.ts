"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useDrivingStore } from "@/lib/store";
import { checkMissionGoal } from "@/lib/mission/missions";
import { carTransform } from "@/components/simulation/carTransform";
import { evaluateCheckpoint, type SafetyCheckState } from "@/lib/mission/checkpointEval";

/**
 * Mission grading, relocated out of Car.tsx. Reads the car's post-physics
 * transform from the per-Scene CarTransform ref (published by Car) and everything
 * else via getState(); writes mission/checkpoint/feedback results to the store.
 *
 * Runs at DEFAULT useFrame priority and relies on MOUNT ORDER: MissionController
 * is mounted immediately AFTER Car in Scene, so within one rAF tick R3F runs Car's
 * physics + transform write first, then this callback reads it. Do NOT pass a
 * non-zero renderPriority — that disables R3F's automatic render.
 */
export function useMission(coursePath: THREE.CurvePath<THREE.Vector3>) {
  const currentLesson = useDrivingStore((s) => s.currentLesson);
  const missionState = useDrivingStore((s) => s.missionState);

  // Local grading state (moved verbatim from Car).
  const clearedCheckpoints = useRef<Set<string>>(new Set());
  const safetyCheckState = useRef<SafetyCheckState>({ lookedLeft: false, lookedRight: false });
  const feedbackTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Reset on lesson change.
  useEffect(() => {
    clearedCheckpoints.current.clear();
    useDrivingStore.getState().resetClearedCheckpoints();
    safetyCheckState.current = { lookedLeft: false, lookedRight: false };
  }, [currentLesson]);

  // Reset on a fresh run start (covers same-lesson retry, where currentLesson is
  // unchanged; the store side of clearedCheckpointIds is reset in setMissionState).
  useEffect(() => {
    if (missionState === "active") {
      clearedCheckpoints.current.clear();
      safetyCheckState.current = { lookedLeft: false, lookedRight: false };
    }
  }, [missionState]);

  // Cancel pending feedback timers on unmount (e.g. navigating away from driving).
  useEffect(() => () => {
    feedbackTimeouts.current.forEach(clearTimeout);
    feedbackTimeouts.current = [];
  }, []);

  useFrame(() => {
    const ct = carTransform;
    const store = useDrivingStore.getState();
    // Mirror Car's guards: skip when paused, replaying, free-mode, or before Car
    // has published a real post-physics transform this run.
    if (store.isPaused || store.isReplaying || currentLesson === "free-mode" || !ct.valid) return;

    const position = ct.position;

    // Goal reached: snapshot the replay BEFORE scoring (scoring reads replayData),
    // then score, transition to success, and show feedback — order preserved.
    if (checkMissionGoal(currentLesson, position)) {
      useDrivingStore.setState({ replayData: ct.frames });
      store.calculateMissionResult(coursePath);
      store.setMissionState("success");
      store.setScreen("feedback");
      return;
    }

    // Checkpoint clearing over the dynamic activeCheckpoints list.
    const language = store.language;
    for (const cp of store.activeCheckpoints) {
      if (clearedCheckpoints.current.has(cp.id)) continue;

      const result = evaluateCheckpoint({
        checkpoint: cp,
        position: { x: position.x, z: position.z },
        headYaw: ct.headYaw,
        speed: ct.speed,
        language,
        safety: safetyCheckState.current,
      });
      safetyCheckState.current = result.safety;

      if (result.cleared) {
        clearedCheckpoints.current.add(cp.id);
        store.addClearedCheckpoint(cp.id);
        if (result.feedback) {
          store.setDrivingFeedback(result.feedback);
          feedbackTimeouts.current.push(
            setTimeout(() => useDrivingStore.getState().setDrivingFeedback(null), 2000),
          );
        }
      }
    }
  });
}
