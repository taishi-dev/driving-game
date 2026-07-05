"use client";

import { useEffect, useState } from "react";
import PlayCanvasCanvas, { type SceneBuilder } from "./PlayCanvasCanvas";
import { createDriveScene } from "./driveScene";
import { loadAmmo } from "./ammoPhysics";
import { useDrivingStore } from "@/lib/store";
import { SHELL_STRINGS } from "./product/productStrings";

/**
 * P4 — /drive canvas host.
 *
 * The drive scene needs the Ammo physics world, and PlayCanvas only creates that
 * world in `app.start()` IF the global `Ammo` is ALREADY defined (see the
 * lifecycle note in `ammoPhysics.ts`). So this wrapper GATES the canvas mount on
 * `loadAmmo()` resolving — the underlying `PlayCanvasCanvas` starts the
 * Application synchronously, so Ammo must be present before it ever mounts.
 *
 * Strict-mode safe: `loadAmmo()` memoises its promise and `WasmModule` caches
 * the instance, so the dev double-mount just re-resolves instantly; a `disposed`
 * guard drops the async `setReady` if we unmounted first.
 *
 * P7a: `buildScene` selects the scene — default is the /drive TEST scene; the
 * product driving screen passes `createProductDriveScene` (store-wired).
 */
export default function DriveCanvas({
  buildScene = createDriveScene,
  showFps = true,
  fit = "window",
}: {
  buildScene?: SceneBuilder;
  showFps?: boolean;
  /** Canvas sizing (see PlayCanvasCanvas) — the panel-embedded replay passes "container". */
  fit?: "window" | "container";
} = {}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // P9: this gate is user-visible on every drive/replay screen entry (it flashes
  // until the Ammo WASM module resolves), so — like the rest of the driving
  // screen — it must localize instead of being English-only in both languages.
  const language = useDrivingStore((s) => s.language);
  const t = SHELL_STRINGS[language];

  useEffect(() => {
    let disposed = false;
    loadAmmo()
      .then(() => {
        if (!disposed) setReady(true);
      })
      .catch((e: unknown) => {
        if (!disposed) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      disposed = true;
    };
  }, []);

  if (error) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          color: "#ffb4b4",
          font: "600 14px/1.4 ui-monospace, monospace",
          padding: 24,
          textAlign: "center",
        }}
      >
        {t.physicsFailedPrefix}
        {error}
      </div>
    );
  }

  if (!ready) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          color: "#9fb2c8",
          font: "600 14px/1.4 ui-monospace, monospace",
        }}
      >
        {t.physicsLoading}
      </div>
    );
  }

  return <PlayCanvasCanvas buildScene={buildScene} showFps={showFps} fit={fit} />;
}
