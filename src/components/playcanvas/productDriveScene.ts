import { Application, Vec3 } from "playcanvas";
import type { SceneHandle } from "./showroomScene";
import { VEHICLE_TUNING, type VehicleInput } from "./raycastVehicle";
import { buildDriveSceneBase, type DriveDebugApi } from "./driveScene";
import { createTrafficSignal } from "./trafficSignal";
import { currentSignalState } from "@/lib/pcSignalView";
import { signedThrottle } from "@/lib/pcDriveControls";
import { useDrivingStore, type ReplayFrame } from "@/lib/store";
import { getCoursePath } from "@/lib/course";
import {
  createGradingState,
  stepMissionGrading,
  type GradingState,
} from "@/lib/pcMissionGrading";

const DEG2RAD = Math.PI / 180;

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

  // 3D traffic signal at the frozen signal-1 stop line (traffic-light lesson
  // only). Pure view: the lit lamp derives from the store's signalStateLogs
  // (the driving screen's cycle effect stays the clock scoring replays).
  const signal = createTrafficSignal(app);

  // Hold the car still until the mission is active (briefing overlay up).
  const HOLD_INPUT: VehicleInput = { steer: 0, throttle: 0, brake: 1 };

  // Script-forced input (e2e probes). null = the store drives.
  let forced: VehicleInput | null = null;

  // Write-on-change guards (original Car.tsx convention).
  let lastDisplaySpeed = -1;
  let lastOffTrack: boolean | null = null;

  // --- P7b mission grading runtime -----------------------------------------
  // The engine-agnostic reducer (pcMissionGrading) is the pure heart of the
  // original useMission; this block is the PlayCanvas wiring (the counterpart of
  // MissionController/useMission). While the mission is "active" (not paused /
  // replaying / free-mode) it records a ReplayFrame and advances the reducer,
  // dispatching the results to the frozen store: cleared checkpoints →
  // addClearedCheckpoint + a 2s driving-feedback toast; goal reached → snapshot
  // replayData BEFORE scoring (calculateMissionResult reads it), then
  // success + feedback screen — the original useMission order, preserved.
  let grading: GradingState = createGradingState();
  let frames: ReplayFrame[] = [];
  let wasActive = false;
  const feedbackTimers: ReturnType<typeof setTimeout>[] = [];

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

    // Traffic signal: visible only on its lesson; lamp = last signal log.
    // Both handle calls are change-guarded internally, so per-frame is cheap.
    const isTrafficLesson = st.currentLesson === "traffic-light";
    signal.setVisible(isTrafficLesson);
    signal.setState(isTrafficLesson ? currentSignalState(st.signalStateLogs) : null);

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

    // --- Mission grading (after physics/telemetry, mirroring useMission) -----
    if (st.missionState !== "active") {
      // A fresh run re-initialises local grading + recording on its first active
      // frame (below); the store side (clearedCheckpointIds / feedbackLogs /
      // deviationPenalty) is reset in setMissionState("active").
      wasActive = false;
    } else {
      if (!wasActive) {
        wasActive = true;
        grading = createGradingState();
        frames = [];
      }
      // Original useMission guards: no grading while paused / replaying / free-mode.
      if (!st.isPaused && !st.isReplaying && st.currentLesson !== "free-mode") {
        const chassisEuler = base.vehicle.chassis.getEulerAngles();
        // Unsigned display speed in km/h — the frozen replay/scoring contract
        // records the magnitude (reverse still counts as speed).
        const displaySpeedKmh = Math.abs(s.speedKmh);

        // Record the replay frame (original Car.tsx contract: speed in km/h; head
        // snapshot; rotation is the chassis euler in radians — scoring reads only
        // position/speed/timestamp, P8 replays the rotation).
        frames.push({
          timestamp: Date.now(),
          position: [s.x, s.y, s.z],
          rotation: [chassisEuler.x * DEG2RAD, chassisEuler.y * DEG2RAD, chassisEuler.z * DEG2RAD],
          steering: st.steeringAngle,
          speed: displaySpeedKmh,
          headRotation: { ...st.headRotation },
        });

        const result = stepMissionGrading(grading, {
          lesson: st.currentLesson,
          position: { x: s.x, z: s.z },
          headYaw: st.headRotation.yaw,
          speed: displaySpeedKmh,
          language: st.language,
        });

        for (const c of result.cleared) {
          st.addClearedCheckpoint(c.id);
          if (c.feedback) {
            st.setDrivingFeedback(c.feedback);
            feedbackTimers.push(
              setTimeout(() => useDrivingStore.getState().setDrivingFeedback(null), 2000),
            );
          }
        }

        if (result.goalReached) {
          // Order preserved from useMission: snapshot replay BEFORE scoring (the
          // store's calculateMissionResult reads replayData), then score, then the
          // success transition, then the feedback screen.
          useDrivingStore.setState({ replayData: frames });
          st.calculateMissionResult(getCoursePath(st.currentLesson));
          st.setMissionState("success");
          st.setScreen("feedback");
          wasActive = false;
        }
      }
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
          // P7b goal-sweep aid: zero-velocity placement (resetTo zeroes momentum),
          // so a teleport into a stop zone reads as stopped for the grader.
          teleport: (x, z, yawDegrees = 180) =>
            base.vehicle.resetTo(new Vec3(x, VEHICLE_TUNING.spawnHeight, z), yawDegrees),
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
      // Cancel pending driving-feedback toast timers (original useMission unmount).
      feedbackTimers.forEach(clearTimeout);
      feedbackTimers.length = 0;
      if (debugApi && globalThis.__driveDebug === debugApi) {
        globalThis.__driveDebug = undefined;
      }
      signal.dispose();
      base.dispose();
    },
  };
}
