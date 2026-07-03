"use client";

import { useEffect, useRef } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { createShowroomScene } from "../showroomScene";

/**
 * B7b — the Babylon showroom scene reused as the Home screen's static hero
 * background. Same scene builder as the /showroom test route, but with no FPS
 * badge or debug chrome (this is product background, not a test harness) and no
 * auto-rotation (the showroom camera has inputs unattached — a static hero shot).
 *
 * Client-only (Babylon touches WebGL/window) and always mounted behind
 * `next/dynamic({ ssr:false })`. Owns the Engine lifecycle with the branch's
 * strict-mode-safe teardown: a `disposed` guard so a scene that resolves after
 * an aborted first mount is disposed instead of leaking / rendering.
 */
export default function HomeHeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });

    let scene: import("@babylonjs/core/scene").Scene | null = null;
    let disposed = false;

    const renderLoop = () => {
      if (scene && scene.activeCamera) scene.render();
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
        // Strict-mode first-mount teardown rejects the in-flight async build with
        // "Scene has been disposed" — expected noise, not a real failure. Only
        // surface errors from the live mount.
        if (disposed) return;
        console.error("[HomeHeroCanvas] scene init failed:", err);
      });

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      engine.stopRenderLoop();
      if (scene) scene.dispose();
      engine.dispose();
    };
  }, []);

  return (
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
  );
}
