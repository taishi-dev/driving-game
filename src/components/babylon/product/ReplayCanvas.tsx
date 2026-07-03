"use client";

import { useEffect, useRef, useState } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { createReplayScene, type ReplaySceneHandle } from "../replayScene";
import { useDrivingStore } from "@/lib/store";
import { sampleReplay, replayDurationMs } from "@/lib/replay";

// B9: user-visible loading placeholder — must localize like the rest of the
// feedback screen.
const LOADING_TEXT = { ja: "リプレイを読み込み中…", en: "Loading replay…" } as const;

/**
 * B8 — the feedback screen's replay-review canvas.
 *
 * Owns a Babylon engine + {@link createReplayScene} and, each frame, samples the
 * store's recorded `replayData` at the real elapsed time since playback started
 * (timestamp-interpolated via the frozen `replay.ts`), driving the scene's
 * kinematic car through the world. Playback LOOPS once it reaches the end of the
 * recording — matching the original R3F FeedbackScreen/Car semantics. The
 * store's `replayViewMode` selects the chase / driver camera live.
 *
 * Strict-mode safe: a `disposed` guard tears the async scene down if the effect
 * re-runs before the scene resolves. A fresh Havok plugin per scene is created
 * inside `createReplayScene` (needed only for the world's static colliders).
 */
export default function ReplayCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const language = useDrivingStore((s) => s.language);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });

    let handle: ReplaySceneHandle | null = null;
    let disposed = false;
    let lastViewMode = useDrivingStore.getState().replayViewMode;
    let elapsedMs = 0;
    let lastTime = performance.now();

    createReplayScene(engine)
      .then((h) => {
        if (disposed) {
          h.dispose();
          return;
        }
        handle = h;
        h.setViewMode(lastViewMode);
        setReady(true);

        // Debug hook for headless/e2e verification: replay playback telemetry
        // (no user data) — car position, elapsed time, loop count, camera mode.
        let loops = 0;
        (window as unknown as { __replayDebug?: unknown }).__replayDebug = {
          getState: () => {
            const p = h.getCarPosition();
            return {
              x: p.x,
              y: p.y,
              z: p.z,
              elapsedMs: Math.round(elapsedMs),
              durationMs: Math.round(replayDurationMs(useDrivingStore.getState().replayData)),
              loops,
              viewMode: useDrivingStore.getState().replayViewMode,
              frameCount: useDrivingStore.getState().replayData.length,
              fps: Math.round(engine.getFps()),
            };
          },
        };

        lastTime = performance.now();
        engine.runRenderLoop(() => {
          const st = useDrivingStore.getState();
          const frames = st.replayData;

          // Live chase/driver toggle.
          if (st.replayViewMode !== lastViewMode) {
            lastViewMode = st.replayViewMode;
            h.setViewMode(lastViewMode);
          }

          // Advance by REAL elapsed time (not a 60fps step) so the recording
          // plays in the wall-clock duration it was recorded in.
          const now = performance.now();
          elapsedMs += now - lastTime;
          lastTime = now;

          if (frames.length > 0) {
            const sample = sampleReplay(frames, elapsedMs);
            if (sample) {
              h.setCarTransform(sample.position, sample.rotation);
              if (sample.done) {
                // Loop the replay from the top (original semantics).
                elapsedMs = 0;
                loops += 1;
              }
            }
          }

          if (h.scene.activeCamera) h.scene.render();
        });
      })
      .catch((err) => {
        if (disposed) return;
        console.error("[ReplayCanvas] scene init failed:", err);
      });

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      delete (window as unknown as { __replayDebug?: unknown }).__replayDebug;
      engine.stopRenderLoop();
      if (handle) handle.dispose();
      engine.dispose();
    };
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden", background: "#0b0d10" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", outline: "none", touchAction: "none" }}
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
          {LOADING_TEXT[language]}
        </div>
      )}
    </div>
  );
}
