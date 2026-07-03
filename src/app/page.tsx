"use client";

import dynamic from "next/dynamic";

// B7b: `/` IS the Babylon product now. The shell reads/writes the engine-agnostic
// zustand store and renders one screen at a time (language / home / driving /
// feedback / tutorial / auth / history). Babylon touches WebGL/window at
// construction, so the whole shell is client-only (`ssr: false`) in Next 16.
const BabylonApp = dynamic(
  () => import("@/components/babylon/product/BabylonApp"),
  { ssr: false },
);

export default function Home() {
  return <BabylonApp />;
}
