"use client";

import { useEffect, useRef, useState } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { createDriveScene, type DriveSceneHandle } from "./driveScene";
import {
  DEFAULT_GEAR,
  normalizeKey,
  nextGear,
  driveInputFromKeys,
  type Gear,
} from "@/lib/driveControls";

/**
 * B4/B6 test-drive canvas. Client-only (Babylon needs WebGL/window), mounted
 * behind `next/dynamic({ ssr: false })` from the /drive route. Owns the Engine
 * lifecycle (construct in useEffect, render loop, resize, dispose) and wires
 * keyboard controls + gear to the raycast vehicle via the pure
 * `src/lib/driveControls.ts` module (B11's webcam layer will feed the vehicle
 * through the same throttle/brake/steer + gear contract).
 *
 * Control mapping (see `src/lib/driveControls.ts` for the rationale):
 *   W / ArrowUp   = gas
 *   S / ArrowDown = brake
 *   A / ArrowLeft = steer left
 *   D / ArrowRight= steer right
 *   1 / 2 / 3     = gear Park / Drive / Reverse (default Drive)
 *   R             = reset chassis (debug; predates B6, kept off "1/2/3")
 */
export default function DriveCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fps, setFps] = useState(0);
  const [ready, setReady] = useState(false);
  const [gearDisplay, setGearDisplay] = useState<Gear>(DEFAULT_GEAR);

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

    // Keyboard state -> vehicle input, applied every frame.
    const keys: Record<string, boolean> = {};
    let gear: Gear = DEFAULT_GEAR;
    const onKeyDown = (e: KeyboardEvent) => {
      const key = normalizeKey(e.key);
      keys[key] = true;
      if (key === "r" && handle) {
        handle.reset();
        return;
      }
      const updated = nextGear(gear, key);
      if (updated !== gear) {
        gear = updated;
        setGearDisplay(updated);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[normalizeKey(e.key)] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Headless verification override: when set (via __driveDebug.setInput) it
    // takes precedence over the keyboard so a scripted drive isn't clobbered by
    // the per-frame keyboard read. null = use the keyboard. Note this bypasses
    // gear entirely (callers pass the already-signed throttle they want); use
    // real key dispatch (page.keyboard) instead to exercise gear end-to-end.
    let debugOverride: { throttle: number; brake: number; steer: number } | null =
      null;

    const computeInput = () => {
      if (debugOverride) return debugOverride;
      return driveInputFromKeys(keys, gear);
    };

    createDriveScene(engine)
      .then((h) => {
        if (disposed) {
          h.scene.dispose();
          return;
        }
        handle = h;
        setReady(true);

        // Debug hook for headless verification: read live car state. Exposed
        // unconditionally on this test route (it carries no user data).
        (
          window as unknown as { __driveDebug?: unknown }
        ).__driveDebug = {
          getState: () => {
            const p = h.vehicle.getChassisPosition();
            return {
              x: p.x,
              y: p.y,
              z: p.z,
              gear,
              grounded: h.vehicle.isGrounded(),
              offTrack: h.isOffTrack(),
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
          handle?.setInput(computeInput());
          if (h.scene.activeCamera) h.scene.render();
        });
      })
      .catch((err) => {
        // Under React strict-mode the first mount is torn down while its async
        // scene build (GLB loads) is still in flight; that build then rejects
        // with "Scene has been disposed". That is expected teardown noise for an
        // aborted mount, not a real failure — only surface errors from the live
        // mount so the console stays clean.
        if (disposed) return;
        console.error("[DriveCanvas] scene init failed:", err);
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
      <div
        style={{
          position: "absolute",
          top: 12,
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
        {fps} FPS · Gear {gearDisplay} {ready ? "" : "· loading physics…"}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          padding: "6px 12px",
          borderRadius: 6,
          font: "500 12px/1.4 ui-sans-serif, system-ui, sans-serif",
          color: "#cfe0ff",
          background: "rgba(0,0,0,0.4)",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        W/↑ gas · S/↓ brake · A/D/←→ steer · 1 Park · 2 Drive · 3 Reverse · R reset
      </div>
    </div>
  );
}
