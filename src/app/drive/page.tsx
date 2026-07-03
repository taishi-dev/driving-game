"use client";

import dynamic from "next/dynamic";

// PlayCanvas touches WebGL/window at construction time, so the canvas must
// never be server-rendered. `ssr: false` keeps it client-only in Next.js 16 /
// React 19 (same convention as the E1-babylon branch's /drive route).
//
// P1 scaffold note: this mounts the same generic clear-color canvas as
// /showroom. P4/P5 give /drive its own scene (vehicle physics + drivable
// world) at which point this will dynamic-import a dedicated DriveCanvas,
// mirroring E1's B1 -> B4 split.
const PlayCanvasCanvas = dynamic(
  () => import("@/components/playcanvas/PlayCanvasCanvas"),
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
      <PlayCanvasCanvas />
    </main>
  );
}
