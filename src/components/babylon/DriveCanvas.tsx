"use client";

import { useEffect, useRef, useState } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { createDriveScene, type DriveSceneHandle } from "./driveScene";

/**
 * B4 test-drive canvas. Client-only (Babylon needs WebGL/window), mounted behind
 * `next/dynamic({ ssr: false })` from the /drive route. Owns the Engine lifecycle
 * (construct in useEffect, render loop, resize, dispose) and wires keyboard
 * controls to the raycast vehicle.
 *
 * Control mapping matches the existing app (KeyboardControls.tsx):
 *   W / ArrowUp   = throttle
 *   S / ArrowDown = brake
 *   A / ArrowLeft = steer left
 *   D / ArrowRight= steer right
 *   R             = reset chassis (debug)
 */
export default function DriveCanvas() {
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

    // Keyboard state -> vehicle input, applied every frame.
    const keys: Record<string, boolean> = {};
    const normalize = (k: string) => (k.length === 1 ? k.toLowerCase() : k);
    const onKeyDown = (e: KeyboardEvent) => {
      keys[normalize(e.key)] = true;
      if (normalize(e.key) === "r" && handle) handle.reset();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[normalize(e.key)] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Headless verification override: when set (via __driveDebug.setInput) it
    // takes precedence over the keyboard so a scripted drive isn't clobbered by
    // the per-frame keyboard read. null = use the keyboard.
    let debugOverride: { throttle: number; brake: number; steer: number } | null =
      null;

    const computeInput = () => {
      if (debugOverride) return debugOverride;
      const throttle = keys["w"] || keys["ArrowUp"] ? 1 : 0;
      const brake = keys["s"] || keys["ArrowDown"] ? 1 : 0;
      const left = keys["a"] || keys["ArrowLeft"];
      const right = keys["d"] || keys["ArrowRight"];
      const steer = right ? 1 : left ? -1 : 0;
      return { throttle, brake, steer };
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
              grounded: h.vehicle.isGrounded(),
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
        {fps} FPS {ready ? "" : "· loading physics…"}
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
        W/↑ gas · S/↓ brake · A/D/←→ steer · R reset
      </div>
    </div>
  );
}
