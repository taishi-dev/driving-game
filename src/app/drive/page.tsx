"use client";

import dynamic from "next/dynamic";

// B4 test-drive route: hand-built raycast vehicle on Havok, on a temporary test
// ground (the real Quaternius world is B5). Babylon + Havok WASM touch WebGL and
// `window`, so the canvas is client-only (`ssr: false`) in Next.js 16 / React 19.
const DriveCanvas = dynamic(() => import("@/components/babylon/DriveCanvas"), {
  ssr: false,
});

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
