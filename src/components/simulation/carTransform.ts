import { Vector3 } from "three";
import type { ReplayFrame } from "@/lib/store";

/**
 * The car's post-physics state, published once per frame by Car and read by the
 * mission grader (useMission). Plain mutable object — no store writes, no
 * re-renders — the same class of per-frame mutation as Car's module scratch vectors.
 *
 * MODULE-LEVEL SINGLETON, and safe as one: only ONE driving <Scene> is mounted at
 * a time, so only one Car writes it and one MissionController reads it. The only
 * place two Cars coexist is the feedback screen's player+ghost replay Scenes, and
 * there neither touches this: Car returns early while replaying (never writes) and
 * useMission bails on isReplaying (never reads). The `valid` flag + those replay
 * guards are the load-bearing invariant; do not grade while replaying.
 */
export interface CarTransform {
  /** Post-physics world position of the player car. */
  position: Vector3;
  headYaw: number;
  headPitch: number;
  /** Signed speed (speed.current); grading uses Math.abs for the stop check. */
  speed: number;
  /** False until Car has written a real driving frame this run (false in free-mode / while replaying). */
  valid: boolean;
  /** Points at Car's live recordedFrames buffer, re-pointed each frame (Car reassigns it on reset). */
  frames: ReplayFrame[];
}

export const carTransform: CarTransform = {
  position: new Vector3(),
  headYaw: 0,
  headPitch: 0,
  speed: 0,
  valid: false,
  frames: [],
};
