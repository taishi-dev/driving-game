import { WasmModule, type Application } from "playcanvas";

/**
 * P4 — Ammo.js (Bullet) physics loader for the PlayCanvas drive scene.
 *
 * ── How PlayCanvas consumes Ammo [C-phys] ────────────────────────────────────
 * PlayCanvas' `RigidBodyComponentSystem` is only functional once the global
 * `Ammo` symbol is defined. The engine loads it through its `WasmModule` helper:
 *
 *   pc.WasmModule.setConfig('Ammo', { glueUrl, wasmUrl });
 *   pc.WasmModule.getInstance('Ammo', (instance) => { ... });
 *
 * We ship the Ammo artifacts LOCALLY under `public/lib/ammo/` (no runtime CDN),
 * exactly like the Draco decoder — see `public/lib/ammo/AMMO.license` and the
 * size table in `assets/CREDITS.md`.
 *
 * ── The global-assignment gotcha (verified against playcanvas@2.20.5) ─────────
 * `WasmModule` loads the glue `<script>` (which defines `window.Ammo` = the
 * emscripten factory), then does `const m = window.Ammo; window.Ammo = void 0;
 * m({locateFile}).then(instance => ...)`. So AFTER loading, `window.Ammo` is
 * `undefined` — but the engine's rigidbody system checks the BARE global
 * `typeof Ammo !== "undefined"`. We must therefore re-assign the resolved
 * instance back onto the global ourselves (this is what the official engine-only
 * examples do); otherwise the physics world is never created. `loadAmmo` does
 * this in the getInstance callback.
 *
 * ── Lifecycle verdict (E1's fatal cached-world bug — the analog check) ────────
 * E1 (Babylon/Havok) hit a fatal bug where a physics world cached at MODULE
 * scope survived a scene destroy and crashed re-entry under React strict-mode's
 * double-mount. PlayCanvas has NO analogous hazard, and this is provable from
 * the engine source:
 *   - The `Ammo` WASM MODULE (heap + factory) is a process-global singleton,
 *     loaded exactly once and cached by `WasmModule` (`module.instance`).
 *     Repeated `getInstance('Ammo')` calls return the SAME cached instance
 *     immediately — it is DESIGNED to be reused, never re-instantiated.
 *   - The physics WORLD (`btDiscreteDynamicsWorld` + solver/dispatcher/etc.) is
 *     owned per-`Application`, created in `RigidBodyComponentSystem.onLibraryLoaded()`
 *     (fired from `app.start()` when the global `Ammo` is present) and FULLY
 *     freed in `RigidBodyComponentSystem.destroy()` (called by `app.destroy()`),
 *     which `Ammo.destroy()`s the world, solver, dispatcher, broadphase,
 *     collision-config, ray temps, and the shared static `RigidBodyComponent`
 *     temps. Nothing is cached across Application instances.
 *   - Strict-mode double-mount is strictly SEQUENTIAL (mount → cleanup →
 *     mount), so app#1 is fully destroyed (world + statics freed) before app#2
 *     is created and re-runs `onLibraryLoaded()` to rebuild them. No overlap,
 *     no dangling pointers, no reused world.
 * Because `app.start()` only creates the world if the global `Ammo` is ALREADY
 * defined, `loadAmmo()` MUST resolve before the canvas' `Application` is started
 * — which is why `DriveCanvas` gates the canvas mount on this promise. The
 * straight-line probe (`__driveDebug`) then runs on the LIVE (second) strict-
 * mode mount, empirically confirming physics is healthy after a destroy/recreate.
 */

const AMMO_GLUE_URL = "/lib/ammo/ammo.wasm.js";
const AMMO_WASM_URL = "/lib/ammo/ammo.wasm.wasm";

let ammoPromise: Promise<void> | null = null;

/**
 * Ensure Ammo is loaded and the global `Ammo` symbol is populated. Idempotent:
 * the underlying `WasmModule` caches the instance, and we memoise the promise so
 * concurrent/strict-mode callers share one load. Resolves once `globalThis.Ammo`
 * is a usable Bullet namespace (`Ammo.btRaycastVehicle` etc. available).
 */
export function loadAmmo(): Promise<void> {
  if (ammoPromise) return ammoPromise;

  ammoPromise = new Promise<void>((resolve, reject) => {
    try {
      WasmModule.setConfig("Ammo", {
        glueUrl: AMMO_GLUE_URL,
        wasmUrl: AMMO_WASM_URL,
        // Only ONE worker's worth of module is used; Ammo runs on the main
        // thread here (the rigidbody system steps it synchronously).
        numWorkers: 1,
      });
      WasmModule.getInstance("Ammo", (instance: unknown) => {
        // Re-publish the resolved instance onto the global the engine checks
        // (WasmModule nulls window.Ammo during load — see the module doc).
        (globalThis as unknown as { Ammo?: unknown }).Ammo = instance;
        resolve();
      });
    } catch (err) {
      ammoPromise = null; // allow a later retry
      reject(err);
    }
  });

  return ammoPromise;
}

/** True once the global Ammo namespace is available. */
export function isAmmoLoaded(): boolean {
  return typeof (globalThis as unknown as { Ammo?: unknown }).Ammo !== "undefined";
}

/**
 * Ensure the PlayCanvas rigidbody physics WORLD exists on `app` RIGHT NOW.
 *
 * Why this is needed: `PlayCanvasCanvas` runs the scene builder BEFORE
 * `app.start()`. Normally the physics world is created inside `app.start()` (via
 * `onLibrariesLoaded → rigidbody.onLibraryLoaded`), but a scene builder that adds
 * a `rigidbody` component (whose body is created eagerly on `addChild → onEnable
 * → createBody`) runs first — and `createBody` dereferences the static Ammo
 * transform temps that `onLibraryLoaded` allocates. Without the world, those
 * temps are undefined and `createBody` throws `undefined.setValue`.
 *
 * So a physics scene calls this at the TOP of its builder. It invokes the
 * engine's own `onLibrariesLoaded()` (which creates the world + solver +
 * static temps AND sets `_librariesLoaded`, so the later `app.start()` skips a
 * duplicate init — verified against playcanvas@2.20.5). Idempotent: no-op once a
 * `dynamicsWorld` exists. Requires {@link loadAmmo} to have resolved first.
 */
export function ensurePhysicsWorld(app: Application): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyApp = app as any;
  const rb = anyApp.systems?.rigidbody;
  if (!rb) return;
  if (!rb.dynamicsWorld) {
    if (!isAmmoLoaded()) {
      throw new Error(
        "[ammoPhysics] ensurePhysicsWorld() called before Ammo loaded — await loadAmmo() first.",
      );
    }
    anyApp.onLibrariesLoaded();
  }
}

/**
 * The raw Ammo (Bullet) namespace, for direct use of classes PlayCanvas does
 * not wrap — notably `btRaycastVehicle`, which is the whole point of the
 * official raycast-vehicle pattern [C-veh]. Throws if called before
 * {@link loadAmmo} has resolved.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAmmo(): any {
  const ammo = (globalThis as unknown as { Ammo?: unknown }).Ammo;
  if (typeof ammo === "undefined") {
    throw new Error("[ammoPhysics] Ammo is not loaded — call loadAmmo() first.");
  }
  return ammo;
}
