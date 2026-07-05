/**
 * P6 — pure keyboard drive-controls contract for the PlayCanvas branch.
 *
 * Rewritten for E2 (D1.a: engine-coupled logic is rebuilt per branch, NOT copied
 * from E1's `driveControls.ts`) but it implements the SAME fixed contract, so the
 * two branches feel identical and the Playwright drivers stay comparable:
 *
 *   • Gears P / D / R, default D; number-row keys "1"/"2"/"3" select P/D/R.
 *   • Throttle: W or ArrowUp = full gas (0/1). S or ArrowDown = full brake (0/1).
 *   • Steering: A/ArrowLeft and D/ArrowRight steer at ±{@link KEYBOARD_STEER_MAGNITUDE}
 *     (0.6). Both (or neither) held → 0.
 *   • {@link signedThrottle}(gear, gas): P → 0, D → +gas, R → −gas.
 *
 * Two-source steering convention (document, do NOT unify): the store's steering
 * axis is the FULL ±1.0 range. The keyboard here deliberately writes only a
 * PARTIAL ±0.6 lock so the fallback turns less sharply and stays controllable;
 * the WEBCAM layer (P11) is the source that writes the full ±1.0. Both feed the
 * one `steeringAngle` store field.
 *
 * Sign conventions (everything downstream of this module obeys them):
 *   • steer > 0 = RIGHT, steer < 0 = LEFT (matches VehicleInput.steer, which +1
 *     turns right).
 *   • The steer SIGNAL is GEAR-INVARIANT: a right input is +0.6 in D and in R.
 *     In reverse the car's yaw naturally flips for that same signal — that is the
 *     physics (the rear axle leads), not an inversion this layer applies.
 *
 * Pure: no `window`/DOM references. The React driving screen forwards
 * `KeyboardEvent.key` strings; the /drive test scene forwards the same. Single-
 * char keys are lowercase-normalised so Shift/CapsLock ("W") behaves like ("w").
 */

export type Gear = "P" | "D" | "R";

/** The gear a fresh session / control instance starts in. */
export const DEFAULT_GEAR: Gear = "D";

/**
 * Keyboard partial-steer magnitude. The store steering axis is the full ±1.0
 * (written at full lock by the webcam layer, P11); the keyboard writes this
 * partial value on purpose so it stays controllable.
 */
export const KEYBOARD_STEER_MAGNITUDE = 0.6;

/** Number-row keys → gear. */
export const GEAR_KEYS: Readonly<Record<string, Gear>> = {
  "1": "P",
  "2": "D",
  "3": "R",
};

const GAS_KEYS: ReadonlySet<string> = new Set(["w", "ArrowUp"]);
const BRAKE_KEYS: ReadonlySet<string> = new Set(["s", "ArrowDown"]);
const LEFT_KEYS: ReadonlySet<string> = new Set(["a", "ArrowLeft"]);
const RIGHT_KEYS: ReadonlySet<string> = new Set(["d", "ArrowRight"]);

/**
 * Normalise a `KeyboardEvent.key`: single-character keys are lowercased (so an
 * uppercase "W" from Shift/CapsLock matches "w"); multi-character named keys
 * ("ArrowUp") are returned unchanged.
 */
export function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

/** If `key` selects a gear, return that gear; otherwise return `current` unchanged. */
export function gearForKey(key: string, current: Gear): Gear {
  return GEAR_KEYS[normalizeKey(key)] ?? current;
}

/**
 * Signed drive throttle from the gear + unsigned gas (0..1): P → 0, D → +gas,
 * R → −gas. Guards against negative zero (R with no gas returns +0, not −0) so
 * downstream sign checks and telemetry never see a spurious `-0`.
 */
export function signedThrottle(gear: Gear, gas: number): number {
  if (gear === "P" || gas === 0) return 0;
  return gear === "R" ? -gas : gas;
}

export interface DriveInput {
  /** Unsigned gas 0..1 (W / ArrowUp). Gear signing is {@link signedThrottle}'s job. */
  gas: number;
  /** Brake 0..1 (S / ArrowDown) — gear-independent, always opposes motion. */
  brake: number;
  /** Keyboard steer in [−0.6, +0.6] (+ = right). */
  steer: number;
}

function anyHeld(held: ReadonlySet<string>, keys: ReadonlySet<string>): boolean {
  for (const k of keys) if (held.has(k)) return true;
  return false;
}

/**
 * Compute the drive input from the set of currently-held, already-normalised
 * keys. Both-or-neither steer keys held → 0.
 */
export function computeDriveInput(held: ReadonlySet<string>): DriveInput {
  const gas = anyHeld(held, GAS_KEYS) ? 1 : 0;
  const brake = anyHeld(held, BRAKE_KEYS) ? 1 : 0;
  const left = anyHeld(held, LEFT_KEYS);
  const right = anyHeld(held, RIGHT_KEYS);
  const steer =
    right && !left
      ? KEYBOARD_STEER_MAGNITUDE
      : left && !right
        ? -KEYBOARD_STEER_MAGNITUDE
        : 0;
  return { gas, brake, steer };
}

/**
 * Stateful keyboard controller: tracks held keys + the current gear from raw key
 * strings (normalised internally). Pure w.r.t. the DOM — the caller feeds it
 * `KeyboardEvent.key` values and reads back input/gear. Reused by both the
 * product driving screen and the /drive test scene.
 */
export interface DriveControls {
  keyDown(key: string): void;
  keyUp(key: string): void;
  /** Current unsigned drive input (gas / brake / steer). */
  getInput(): DriveInput;
  getGear(): Gear;
  setGear(gear: Gear): void;
  /** Release all held keys (e.g. on window blur) so nothing sticks down. */
  reset(): void;
}

export function createDriveControls(initialGear: Gear = DEFAULT_GEAR): DriveControls {
  const held = new Set<string>();
  let gear: Gear = initialGear;
  return {
    keyDown(key) {
      const k = normalizeKey(key);
      held.add(k);
      gear = gearForKey(k, gear);
    },
    keyUp(key) {
      held.delete(normalizeKey(key));
    },
    getInput() {
      return computeDriveInput(held);
    },
    getGear() {
      return gear;
    },
    setGear(g) {
      gear = g;
    },
    reset() {
      held.clear();
    },
  };
}
