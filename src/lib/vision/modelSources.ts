/**
 * Single source of truth for WHERE the MediaPipe vision assets load from, plus
 * the delegate-fallback helper. Extracted from VisionController so asset hosting
 * and loader resilience live in one testable place.
 *
 * AVAILABILITY: all paths are SAME-ORIGIN (served from `public/` on our own
 * origin), not external CDNs. `scripts/fetch-vision-assets.mjs` populates them at
 * build time (WASM copied from the installed `@mediapipe/tasks-vision`, `.task`
 * models downloaded + checksum-verified). This also fixes a latent version skew:
 * the code previously loaded WASM from `cdn.jsdelivr.net/.../@0.10.3` while the
 * installed package is a different version — self-hosting uses the matching WASM.
 *
 * The `tests/visionModelSources.test.ts` guard asserts none of these is an
 * external URL, so a CDN dependency can never silently return.
 */

/** Directory the MediaPipe WASM runtime is served from (FilesetResolver input). */
export const VISION_WASM_PATH = "/mediapipe/wasm";

/** Per-task `.task` model paths (served from public/models/). */
export const VISION_MODEL_PATHS = {
  face: "/models/face_landmarker.task",
  hand: "/models/hand_landmarker.task",
  pose: "/models/pose_landmarker_full.task",
} as const;

/** Every runtime-loaded vision asset path — the no-external-host guard reads this. */
export const VISION_ASSET_PATHS: readonly string[] = [
  VISION_WASM_PATH,
  ...Object.values(VISION_MODEL_PATHS),
];

export type VisionDelegate = "GPU" | "CPU";

/**
 * Create a MediaPipe task with GPU→CPU delegate fallback. Tries `make("GPU")`;
 * if it rejects (unsupported/broken driver), calls `onFallback` and retries on
 * CPU. If CPU also rejects, the rejection propagates so the caller can surface a
 * user-facing error instead of hanging forever on "Loading AI Models…".
 */
export async function withDelegateFallback<T>(
  make: (delegate: VisionDelegate) => Promise<T>,
  onFallback?: (err: unknown) => void,
): Promise<T> {
  try {
    return await make("GPU");
  } catch (err) {
    onFallback?.(err);
    return await make("CPU");
  }
}
