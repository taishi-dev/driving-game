import { Application } from "playcanvas";
import type { SceneHandle } from "./showroomScene";
import type { VehicleInput } from "./raycastVehicle";
import { buildDriveSceneBase, type DriveDebugApi } from "./driveScene";
import { signedThrottle } from "@/lib/pcDriveControls";
import { useDrivingStore } from "@/lib/store";

/**
 * P7a — the PRODUCT drive scene: the shared drive-world base (driveScene.ts)
 * wired to the frozen zustand store instead of local listeners.
 *
 * Input path (per frame): the React driving screen writes keyboard state into
 * the store (setPedals / setSteering / setGear via the pure pcDriveControls
 * contract — and later the webcam layer, P11, writes the same fields); this
 * scene reads `steeringAngle` / `throttle` / `brake` / `gear` back out of the
 * store each frame and feeds the vehicle, applying the gear sign via the P6
 * signed-throttle helper. The car only responds while the mission is ACTIVE and
 * not paused — during the briefing overlay (missionState "briefing") it is held
 * on full brake so it can't creep before the learner presses Start.
 *
 * Telemetry path (per frame, write-on-change like the original Car.tsx): the
 * rounded |speed| goes to `setSpeed`, the pure-layout off-track predicate to
 * `setOffTrack`. Rounding + change-guards keep store notifications ~one per
 * km/h step instead of per frame.
 *
 * `window.__driveDebug` is DOUBLE-gated exactly like store.ts' `__drivingStore`
 * hook (build-time NEXT_PUBLIC_E2E === "1" so prod bundles drop the block, and
 * runtime `?e2e` in the URL) — the product scene ships no ungated hooks.
 */
export function createProductDriveScene(
  app: Application,
  isDisposed: () => boolean,
): SceneHandle {
  const base = buildDriveSceneBase(app, isDisposed);

  // Hold the car still until the mission is active (briefing overlay up).
  const HOLD_INPUT: VehicleInput = { steer: 0, throttle: 0, brake: 1 };

  // Script-forced input (e2e probes). null = the store drives.
  let forced: VehicleInput | null = null;

  // Write-on-change guards (original Car.tsx convention).
  let lastDisplaySpeed = -1;
  let lastOffTrack: boolean | null = null;

  const onUpdate = (dt: number) => {
    if (isDisposed()) return;
    const st = useDrivingStore.getState();

    const driving = st.missionState === "active" && !st.isPaused;
    const input: VehicleInput =
      forced ??
      (driving
        ? {
            steer: st.steeringAngle,
            throttle: signedThrottle(st.gear, st.throttle),
            brake: st.brake,
          }
        : HOLD_INPUT);
    base.vehicle.setInput(input);
    base.vehicle.update(dt);
    base.updateCamera(dt);

    // Telemetry write-back (rounded / on-change only).
    const s = base.vehicle.getState();
    const displaySpeed = Math.round(Math.abs(s.speedKmh));
    if (displaySpeed !== lastDisplaySpeed) {
      lastDisplaySpeed = displaySpeed;
      st.setSpeed(displaySpeed);
    }
    const offTrack = base.world.isOffTrack(s.x, s.z);
    if (offTrack !== lastOffTrack) {
      lastOffTrack = offTrack;
      st.setOffTrack(offTrack);
    }
  };
  app.on("update", onUpdate);

  // --- Debug hook, double-gated like __drivingStore (store.ts) -------------
  let debugApi: DriveDebugApi | undefined;
  if (process.env.NEXT_PUBLIC_E2E === "1" && typeof window !== "undefined") {
    try {
      if (new URLSearchParams(window.location.search).has("e2e")) {
        debugApi = {
          getState: () => {
            const s = base.vehicle.getState();
            return {
              ...s,
              gear: useDrivingStore.getState().gear,
              offTrack: base.world.isOffTrack(s.x, s.z),
              drawCalls: base.drawCalls(),
            };
          },
          setInput: (steer, throttle, brake) => {
            forced = { steer, throttle, brake };
          },
          releaseInput: () => {
            forced = null;
          },
          reset: () => base.resetToSpawn(),
          setMirrorActive: (a) => base.mirror.setActive(a),
          isMirrorActive: () => base.mirror.isActive(),
        };
        globalThis.__driveDebug = debugApi;
      }
    } catch {
      // location may be unavailable in some environments; ignore.
    }
  }

  return {
    dispose() {
      app.off("update", onUpdate);
      if (debugApi && globalThis.__driveDebug === debugApi) {
        globalThis.__driveDebug = undefined;
      }
      base.dispose();
    },
  };
}
