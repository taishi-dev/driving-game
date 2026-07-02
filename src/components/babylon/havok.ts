import HavokPhysics from "@babylonjs/havok";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";

/**
 * B4 — Havok physics plugin initialization.
 *
 * `@babylonjs/havok` ships an Emscripten WASM module. The default export is a
 * factory that instantiates the module asynchronously; it must resolve BEFORE we
 * construct the `HavokPlugin` and before `scene.enablePhysics`.
 *
 * WASM location under Next.js: bundlers do not reliably co-locate the .wasm next
 * to the emitted JS chunk, so the module's default `locateFile` (which looks for
 * "HavokPhysics.wasm" beside the script) can 404. We serve the binary ourselves
 * from `public/havok/HavokPhysics.wasm` and point Emscripten's `locateFile` at
 * that stable public URL. This keeps init robust regardless of chunk hashing.
 *
 * The plugin is created with `useDeltaForWorldStep = true` (first ctor arg) so
 * Havok steps by the real frame delta — matching our frame-rate-independent
 * physics discipline.
 */

const HAVOK_WASM_URL = "/havok/HavokPhysics.wasm";

let cached: Promise<HavokPlugin> | null = null;

/**
 * Initialize (once) and return a ready HavokPlugin. Safe to call repeatedly;
 * the underlying WASM module is instantiated a single time and reused.
 */
export function getHavokPlugin(): Promise<HavokPlugin> {
  if (cached) return cached;
  cached = HavokPhysics({
    locateFile: (file: string) =>
      file.endsWith(".wasm") ? HAVOK_WASM_URL : file,
  }).then((havok) => new HavokPlugin(true, havok));
  return cached;
}
