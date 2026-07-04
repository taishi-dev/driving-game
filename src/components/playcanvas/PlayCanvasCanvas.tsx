"use client";

import { useEffect, useRef, useState } from "react";
import {
  Application,
  Color,
  Entity,
  FILLMODE_FILL_WINDOW,
  RESOLUTION_AUTO,
} from "playcanvas";
import type { SceneHandle } from "./showroomScene";

/**
 * Builds a scene onto the live Application. Receives an `isDisposed` probe so
 * async asset callbacks landing after a strict-mode unmount are safely dropped.
 * Returns a handle whose `dispose()` releases everything the builder created,
 * run just before `app.destroy()`.
 */
export type SceneBuilder = (
  app: Application,
  isDisposed: () => boolean,
) => SceneHandle;

interface PlayCanvasCanvasProps {
  /**
   * Optional scene builder. When provided, the builder owns the camera and all
   * scene content. When omitted, the P1 fallback (dark clear-colour + a bare
   * camera) is used — this keeps the /drive scaffold route rendering until P4/P5
   * give it its own scene.
   */
  buildScene?: SceneBuilder;
  /**
   * Show the FPS badge (default true — the scaffold/test routes keep it). The
   * product Home hero passes false so the badge doesn't sit under the title;
   * the product driving screen keeps it (E1 parity: `drive-fps` testid).
   */
  showFps?: boolean;
}

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
export default function PlayCanvasCanvas({
  buildScene,
  showFps = true,
}: PlayCanvasCanvasProps = {}) {
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

    // hiDPI decision (P1 review note): cap the backbuffer at 2x CSS pixels.
    // FILLMODE_FILL_WINDOW + RESOLUTION_AUTO otherwise renders at the full
    // devicePixelRatio, which on a 4K/hiDPI panel would quadruple the fragment
    // load and blow the 60fps budget on the Arc 140T iGPU. The showroom is a
    // cheap static scene so 2x is safe here; drive scenes (P4+) may lower this
    // further after measurement. At the 1920x1200 DPR-1 verification window
    // this is a no-op (ratio resolves to 1).
    app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    let sceneHandle: SceneHandle | null = null;
    if (buildScene) {
      sceneHandle = buildScene(app, () => disposed);
    } else {
      // P1 fallback: a bare static camera + dark clear colour. Kept so the
      // /drive scaffold route still renders before it gets its own scene.
      const camera = new Entity("camera");
      camera.addComponent("camera", {
        clearColor: new Color(0.055, 0.06, 0.07),
      });
      app.root.addChild(camera);
    }

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
      sceneHandle?.dispose();
      app.destroy();
    };
  }, [buildScene]);

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
      {showFps && (
        <div
          data-testid="drive-fps"
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
      )}
    </div>
  );
}
