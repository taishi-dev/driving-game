"use client";

import dynamic from "next/dynamic";

// PlayCanvas touches WebGL/window at construction time, so the canvas must
// never be server-rendered. `ssr: false` keeps it client-only in Next.js 16 /
// React 19 (same convention as the E1-babylon branch's /drive route).
//
// P4/P5: /drive now mounts the dedicated DriveCanvas — it loads the Ammo
// physics world (gating the PlayCanvas Application start on it) and builds the
// vehicle-physics + drivable-world scene.
const DriveCanvas = dynamic(
  () => import("@/components/playcanvas/DriveCanvas"),
  { ssr: false },
);

export default function DrivePage() {
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        margin: 0,
        background: "#0b0d10",
      }}
    >
      <DriveCanvas />
    </main>
  );
}
