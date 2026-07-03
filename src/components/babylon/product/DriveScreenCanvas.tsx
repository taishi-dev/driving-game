"use client";

import { useEffect, useRef, useState } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { createDriveScene, type DriveSceneHandle } from "../driveScene";
import { useDrivingStore } from "@/lib/store";
import {
  DEFAULT_GEAR,
  normalizeKey,
  nextGear,
  computeSteer,
  isGasPressed,
  isBrakePressed,
  driveThrottleForGear,
} from "@/lib/driveControls";

/**
 * B7b — the PRODUCT driving canvas: the Babylon drive scene wired to the
 * zustand store instead of local input state (that's the /drive test route,
 * `DriveCanvas.tsx`, which keeps its own local input for standalone testing).
 *
 * Store contract (per the B7 brief):
 *   - Keyboard writes to the store: WASD/arrows -> setPedals(gas, brake) +
 *     setSteering(steer); number keys 1/2/3 -> setGear(P/D/R). The pure
 *     `driveControls.ts` helpers do the key math (shared with the test route).
 *   - Each frame the scene READS the store (throttle/brake/steeringAngle/gear),
 *     applies the gear sign via driveThrottleForGear, and feeds the vehicle.
 *   - Each frame it WRITES back the rounded display speed (only on change) and
 *     the off-track flag (only on change).
 *
 * Owns the Engine lifecycle with the branch's strict-mode-safe `disposed`-guard
 * teardown. The B5b rearview mirror + Havok side-effect import live inside
 * `createDriveScene`, so they are preserved unchanged.
 */
export default function DriveScreenCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fps, setFps] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });

    let handle: DriveSceneHandle | null = null;
    let disposed = false;

    const store = useDrivingStore.getState();
    // Each fresh drive session starts in Drive: gear is global store state that
    // otherwise persists across scene re-entry (e.g. a prior reverse leaving "R").
    store.setGear(DEFAULT_GEAR);

    // --- Keyboard -> store (the store is the single source of truth). ---
    const keys: Record<string, boolean> = {};
    const applyToStore = () => {
      const st = useDrivingStore.getState();
      st.setPedals(isGasPressed(keys) ? 1 : 0, isBrakePressed(keys) ? 1 : 0);
      st.setSteering(computeSteer(keys));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const key = normalizeKey(e.key);
      keys[key] = true;
      if (key === "r" && handle) {
        handle.reset();
        return;
      }
      const st = useDrivingStore.getState();
      const updated = nextGear(st.gear, key);
      if (updated !== st.gear) st.setGear(updated);
      applyToStore();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[normalizeKey(e.key)] = false;
      applyToStore();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Cache last-written values so we only push store updates on change.
    let lastSpeed = -1;
    let lastOffTrack: boolean | null = null;

    createDriveScene(engine)
      .then((h) => {
        if (disposed) {
          h.scene.dispose();
          return;
        }
        handle = h;
        setReady(true);

        // Debug hook for headless/e2e verification: live car telemetry (no user
        // data). Mirrors the /drive route's contract so the same shot scripts read
        // it. `setInput`/`clearInput` let a scripted drive bypass the store.
        let debugOverride:
          | { throttle: number; brake: number; steer: number }
          | null = null;
        (window as unknown as { __driveDebug?: unknown }).__driveDebug = {
          getState: () => {
            const p = h.vehicle.getChassisPosition();
            return {
              x: p.x,
              y: p.y,
              z: p.z,
              gear: useDrivingStore.getState().gear,
              grounded: h.vehicle.isGrounded(),
              offTrack: h.isOffTrack(),
              speed: useDrivingStore.getState().speed,
              fps: Math.round(engine.getFps()),
              debug: { ...h.vehicle.debug },
            };
          },
          setInput: (i: { throttle: number; brake: number; steer: number }) => {
            debugOverride = i;
          },
          clearInput: () => {
            debugOverride = null;
          },
          reset: () => h.reset(),
        };

        engine.runRenderLoop(() => {
          const st = useDrivingStore.getState();

          // READ store -> vehicle input (apply gear sign to the raw gas pedal).
          if (debugOverride) {
            h.setInput(debugOverride);
          } else {
            h.setInput({
              throttle: driveThrottleForGear(st.gear, st.throttle),
              brake: st.brake,
              steer: st.steeringAngle,
            });
          }

          // WRITE back telemetry (only on change to avoid churning the store).
          const speed = Math.round(Math.abs(h.vehicle.debug.forwardVel) * 3.6);
          if (speed !== lastSpeed) {
            lastSpeed = speed;
            st.setSpeed(speed);
          }
          const off = h.isOffTrack();
          if (off !== lastOffTrack) {
            lastOffTrack = off;
            st.setOffTrack(off);
          }

          if (h.scene.activeCamera) h.scene.render();
        });
      })
      .catch((err) => {
        if (disposed) return;
        console.error("[DriveScreenCanvas] scene init failed:", err);
      });

    const fpsTimer = window.setInterval(() => {
      setFps(Math.round(engine.getFps()));
    }, 500);
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.clearInterval(fpsTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      delete (window as unknown as { __driveDebug?: unknown }).__driveDebug;
      engine.stopRenderLoop();
      if (handle) handle.scene.dispose();
      engine.dispose();
      // Reset transient input so a re-entry doesn't inherit a stuck pedal/steer.
      store.setPedals(0, 0);
      store.setSteering(0);
      store.setSpeed(0);
    };
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#0b0d10",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          outline: "none",
          touchAction: "none",
        }}
      />
      {!ready && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#cfe0ff",
            font: "500 14px/1.4 ui-sans-serif, system-ui, sans-serif",
            pointerEvents: "none",
          }}
        >
          Loading 3D scene…
        </div>
      )}
      <div
        data-testid="drive-fps"
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          padding: "4px 10px",
          borderRadius: 6,
          font: "600 13px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace",
          color: "#e6f0ff",
          background: "rgba(0,0,0,0.45)",
          border: "1px solid rgba(255,255,255,0.12)",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {fps} FPS
      </div>
    </div>
  );
}
