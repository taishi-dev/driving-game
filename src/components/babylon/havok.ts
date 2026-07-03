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
 *
 * We cache the WASM MODULE (expensive, instantiated once) but return a FRESH
 * HavokPlugin per call. A plugin owns a Havok world that is released when its
 * scene is disposed; caching the plugin itself meant a second drive scene
 * (e.g. exit driving -> re-enter, or lesson -> home -> free-mode in B7b) reused
 * a torn-down world and threw "Cannot read properties of undefined (reading
 * 'floatingOrigin')". A new plugin from the shared module gives each scene its
 * own live world; multiple worlds off one module are supported by Havok.
 */

const HAVOK_WASM_URL = "/havok/HavokPhysics.wasm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modulePromise: Promise<any> | null = null;

/**
 * Initialize the Havok WASM module (once) and return a ready HavokPlugin.
 * Safe to call repeatedly: the WASM module is instantiated a single time and
 * reused, but each call yields a fresh plugin/world for the calling scene.
 */
export function getHavokPlugin(): Promise<HavokPlugin> {
  if (!modulePromise) {
    modulePromise = HavokPhysics({
      locateFile: (file: string) =>
        file.endsWith(".wasm") ? HAVOK_WASM_URL : file,
    });
  }
  return modulePromise.then((havok) => new HavokPlugin(true, havok));
}
