"use client";

import { useEffect, useRef, useState } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { createShowroomScene } from "./showroomScene";

/**
 * B1 scaffold: a client-only Babylon.js canvas.
 *
 * Next.js 16 / React 19: Babylon touches `window`/`document` and WebGL, none of
 * which exist during SSR. This component is `"use client"` AND is only ever
 * mounted behind `next/dynamic({ ssr: false })` (see the /showroom route), so the
 * Engine is constructed exclusively inside `useEffect` on the client.
 *
 * Lifecycle contract (B1 acceptance): construct Engine in useEffect, run a render
 * loop, `engine.resize()` on window resize, and `engine.dispose()` on unmount.
 */
export default function ShowroomCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // antialias on; WebGL2 is the Babylon default since v3.
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      // Cap devicePixelRatio work on hiDPI panels; 60 fps is the pass line.
      adaptToDeviceRatio: true,
    });

    // createShowroomScene is async (it loads an HDRI + the glTF car). Guard the
    // teardown against a scene that resolves after the component has unmounted.
    let scene: import("@babylonjs/core/scene").Scene | null = null;
    let disposed = false;

    const renderLoop = () => {
      if (scene && scene.activeCamera) {
        scene.render();
      }
    };

    createShowroomScene(engine)
      .then((s) => {
        if (disposed) {
          s.dispose();
          return;
        }
        scene = s;
        engine.runRenderLoop(renderLoop);
      })
      .catch((err) => {
        // Don't touch anything if we've already unmounted (StrictMode double
        // mount / fast route change): the engine may be disposed by now. Every
        // other canvas guards its .catch the same way.
        if (disposed) return;
        // Surface asset/loader failures instead of a silent black canvas.
        console.error("[ShowroomCanvas] scene init failed:", err);
      });

    // FPS readout — sampled on a timer so React re-renders ~2x/sec, not per frame.
    const fpsTimer = window.setInterval(() => {
      setFps(Math.round(engine.getFps()));
    }, 500);

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.clearInterval(fpsTimer);
      window.removeEventListener("resize", onResize);
      engine.stopRenderLoop();
      if (scene) scene.dispose();
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
        {fps} FPS
      </div>
    </div>
  );
}
