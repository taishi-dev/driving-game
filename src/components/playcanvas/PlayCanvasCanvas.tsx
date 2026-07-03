"use client";

import { useEffect, useRef, useState } from "react";
import {
  Application,
  Color,
  Entity,
  FILLMODE_FILL_WINDOW,
  RESOLUTION_AUTO,
} from "playcanvas";

/**
 * P1 scaffold: a client-only PlayCanvas canvas.
 *
 * Next.js 16 / React 19: PlayCanvas touches `window`/`document` and WebGL, none
 * of which exist during SSR. This component is `"use client"` AND is only ever
 * mounted behind `next/dynamic({ ssr: false })` (see the /showroom and /drive
 * routes), so the Application is constructed exclusively inside `useEffect` on
 * the client.
 *
 * Standalone (no-editor) init pattern per the installed `playcanvas@2.20.5`
 * package's own README ("Usage" example): `new Application(canvas)`,
 * `setCanvasFillMode`/`setCanvasResolution`, a window resize listener calling
 * `app.resizeCanvas()`, then `app.start()`. `Application` (not the newer
 * `AppBase` + async `createGraphicsDevice` split) is still the documented
 * synchronous engine-only entry point for this version — see
 * node_modules/playcanvas/build/playcanvas.d.ts around `declare class
 * Application extends AppBase`.
 *
 * Lifecycle contract (P1 acceptance): construct Application in useEffect,
 * `app.start()` runs its own internal render loop, `app.resizeCanvas()` on
 * window resize, and `app.destroy()` on unmount. React strict-mode double-
 * mounts this effect in dev; `app.destroy()` releases the WebGL context
 * synchronously (see `GraphicsDevice`/`WebglGraphicsDevice.loseContext()`) so
 * the second mount gets a clean canvas — no leaked RAF, no duplicate context.
 */
export default function PlayCanvasCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;

    const app = new Application(canvas, {
      graphicsDeviceOptions: { antialias: true },
    });

    app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
    app.setCanvasResolution(RESOLUTION_AUTO);

    // Static camera + clear color only; P2+ replaces this with the real scene
    // (HDRI showroom / drivable world). Clear color matches E1's studio dark.
    const camera = new Entity("camera");
    camera.addComponent("camera", {
      clearColor: new Color(0.055, 0.06, 0.07),
    });
    app.root.addChild(camera);

    app.start();

    const onResize = () => {
      if (disposed) return;
      app.resizeCanvas();
    };
    window.addEventListener("resize", onResize);

    // FPS readout — sampled on a timer so React re-renders ~2x/sec, not per
    // frame (mirrors E1's Babylon `engine.getFps()` polling).
    const fpsTimer = window.setInterval(() => {
      if (disposed) return;
      setFps(Math.round(app.stats.frame.fps));
    }, 500);

    return () => {
      disposed = true;
      window.clearInterval(fpsTimer);
      window.removeEventListener("resize", onResize);
      app.destroy();
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
        {fps} FPS
      </div>
    </div>
  );
}
