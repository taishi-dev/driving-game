"use client";

import dynamic from "next/dynamic";

// P7a: the root route now mounts the PlayCanvas product shell (store-driven
// screens over the frozen zustand store). The original R3F ClientApp tree was
// removed (2026-07); it lives at git tag `r3f-reference-pre-delete` as the
// flow-semantics reference.
//
// ssr:false — the shell reads localStorage at store-init time and every screen
// eventually touches WebGL, so the whole app is client-only (same convention as
// the original ClientApp mount and the E1 branch).
const ProductApp = dynamic(
  () => import("@/components/playcanvas/product/ProductApp"),
  { ssr: false },
);

export default function Home() {
  return <ProductApp />;
}
