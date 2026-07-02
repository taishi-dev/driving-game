"use client";

import dynamic from "next/dynamic";

// Babylon touches WebGL/window at construction time, so the canvas must never be
// server-rendered. `ssr: false` keeps it client-only in Next.js 16 / React 19.
const ShowroomCanvas = dynamic(
  () => import("@/components/babylon/ShowroomCanvas"),
  { ssr: false },
);

export default function ShowroomPage() {
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
      <ShowroomCanvas />
    </main>
  );
}
