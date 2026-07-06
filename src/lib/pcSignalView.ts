import type { SignalStateLog } from "./store";

/**
 * Pure view logic for the 3D traffic signal (replaces the DOM widget).
 *
 * The signal CLOCK stays where it always was: the driving screen's cycle
 * effect writes `signalStateLogs` to the frozen store (scoring's red-light
 * check replays those logs). The 3D signal is a pure DERIVATION of that log —
 * the scene reads the last entry each frame and lights the matching lamp, so
 * no frozen module changes and the lit lamp can never disagree with what
 * scoring sees.
 */

export type SignalState = SignalStateLog["state"];

/** The lit lamp is whatever the LAST log entry says; null = no cycle running. */
export function currentSignalState(logs: readonly SignalStateLog[]): SignalState | null {
  return logs.length > 0 ? logs[logs.length - 1].state : null;
}

/**
 * Emissive intensity for one lamp given the current state. Mirrors the DOM
 * widget's contrast exactly (active opacity 1, inactive 0.15) so the red-vs-idle
 * reading stays unambiguous at driving distance.
 */
export function signalLampIntensity(current: SignalState | null, lamp: SignalState): number {
  return current === lamp ? 1 : 0.15;
}

/** Housing layout: Japanese horizontal signal, green-yellow-red left to right. */
export const SIGNAL_LAMP_ORDER: readonly SignalState[] = ["green", "yellow", "red"] as const;

/**
 * Where the post stands: at the frozen `signal-1` stop line (z = -18, see
 * MISSION_CHECKPOINTS["traffic-light"]), on the right curb from the approaching
 * car's point of view (the car drives x=0 toward -Z, so its right is +X),
 * laterally outside the checkpoint's 4 m trigger radius. The head hangs back
 * over the road from an arm so it reads above the stop line.
 */
export const SIGNAL_POST_POSITION = { x: 4.5, z: -18 } as const;
