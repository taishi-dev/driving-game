/**
 * B6 — pure keyboard-input + gear logic for the Babylon drive scene.
 *
 * Free of any @babylonjs / browser imports so the gear state machine and
 * input→force mapping are exercised by `node --test` without the 3D engine
 * (D1.a). `DriveCanvas.tsx` is the sole caller today; B11's webcam layer will
 * feed the vehicle through the same `driveInputFromKeys`-shaped contract
 * (throttle/brake/steer + gear), just sourced from hand tracking instead of a
 * key-state record.
 *
 * Contract (from the original `KeyboardControls.tsx` + store, ported per
 * D1.a — match the CONTRACT, not the code):
 *   - W/ArrowUp = gas (0/1), S/ArrowDown = brake (0/1).
 *   - A/ArrowLeft = steer left, D/ArrowRight = steer right, both at partial
 *     magnitude STEER_MAGNITUDE (physics applies its own curve on top).
 *   - Single-character keys are normalized to lowercase so Caps Lock/Shift
 *     WASD still works; named keys (e.g. "ArrowUp") are compared as-is.
 *
 * Gear is new for this branch (the original only ever had "D"/"R", driven by
 * webcam gestures — see `src/lib/vision/steeringGear.ts`). This branch adds a
 * keyboard gear input so B6 is drive-testable without the webcam:
 *   - Gear ∈ {"P", "D", "R"}, default "D".
 *   - D = forward drive force, R = drive force reversed, P = no drive force
 *     (the car holds/rolls to a stop under brake/rolling resistance).
 *   - Steering input is NOT gear-dependent: the steer signal (left/right/straight)
 *     is the same in D and R. However, the resulting yaw direction FLIPS because
 *     velocity sign flips in reverse (yaw rate ∝ velocity × steer angle), so the
 *     car yaws opposite ways in D vs R for the same steer input.
 *   - Gear-select keys are "1"/"2"/"3" (P/D/R). The scene's existing "R" key
 *     resets the car (test-scene debug feature, predates B6); reusing "r" for
 *     Reverse would collide with that binding, and "d" is already steer-right,
 *     so number keys sidestep every existing binding instead of relocating
 *     "reset" for a project-driving mnemonic that would only apply to one of
 *     the three gears anyway.
 */

export type Gear = "P" | "D" | "R";

/** Matches the original app's default gear (`steeringGear.ts` never emits "P"). */
export const DEFAULT_GEAR: Gear = "D";

/** Partial steer magnitude for a keyboard press (matches original `STEER_AMOUNT`). */
export const STEER_MAGNITUDE = 0.6;

/** Keyboard gear-select mapping: 1 = Park, 2 = Drive, 3 = Reverse. */
export const GEAR_KEY_MAP: Record<string, Gear> = { "1": "P", "2": "D", "3": "R" };

/** A snapshot of which keys are currently held, keyed by normalized key name. */
export type KeyState = Readonly<Record<string, boolean | undefined>>;

/** Single-character keys normalize to lowercase; named keys (e.g. "ArrowUp") pass through. */
export function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

/** Resolve a (normalized) keypress to the gear it selects, or undefined if it isn't a gear key. */
export function gearForKey(key: string): Gear | undefined {
  return GEAR_KEY_MAP[normalizeKey(key)];
}

/** The gear after processing `key`: switches gear if `key` is a gear-select key, else unchanged. */
export function nextGear(current: Gear, key: string): Gear {
  return gearForKey(key) ?? current;
}

export function isGasPressed(keys: KeyState): boolean {
  return !!(keys["w"] || keys["ArrowUp"]);
}

export function isBrakePressed(keys: KeyState): boolean {
  return !!(keys["s"] || keys["ArrowDown"]);
}

export function isLeftPressed(keys: KeyState): boolean {
  return !!(keys["a"] || keys["ArrowLeft"]);
}

export function isRightPressed(keys: KeyState): boolean {
  return !!(keys["d"] || keys["ArrowRight"]);
}

/** ±STEER_MAGNITUDE from a/d or arrow keys; 0 when neither or both are held. */
export function computeSteer(keys: KeyState, magnitude: number = STEER_MAGNITUDE): number {
  const left = isLeftPressed(keys);
  const right = isRightPressed(keys);
  if (right && !left) return magnitude;
  if (left && !right) return -magnitude;
  return 0;
}

/**
 * Apply gear to a raw (0..1) gas-pedal reading to get the SIGNED drive
 * throttle the vehicle should apply this frame: D passes it through, R
 * negates it (drive force reversed), P always yields 0 (no drive force,
 * regardless of the gas key).
 */
export function driveThrottleForGear(gear: Gear, rawThrottle: number): number {
  if (gear === "P") return 0;
  // `|| 0` avoids returning -0 for a zero input (negating 0 yields -0, which
  // is a footgun for callers/tests doing strict/Object.is equality).
  return gear === "R" ? -rawThrottle || 0 : rawThrottle;
}

export interface DriveInput {
  /** Signed drive throttle: positive = forward request, negative = reverse request, 0 = none. */
  throttle: number;
  /** 0..1 brake, independent of gear (braking always opposes current motion). */
  brake: number;
  /** -magnitude..magnitude steer, independent of gear (not inverted in reverse). */
  steer: number;
}

/** Full per-frame input pipeline: key state + current gear -> vehicle input. */
export function driveInputFromKeys(keys: KeyState, gear: Gear): DriveInput {
  const rawThrottle = isGasPressed(keys) ? 1 : 0;
  const brake = isBrakePressed(keys) ? 1 : 0;
  return {
    throttle: driveThrottleForGear(gear, rawThrottle),
    brake,
    steer: computeSteer(keys),
  };
}
