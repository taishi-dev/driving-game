"use client";

import PlayCanvasCanvas from "./PlayCanvasCanvas";
import { createShowroomScene } from "./showroomScene";

/**
 * The /showroom canvas: the generic PlayCanvas mount (device lifecycle, resize,
 * fps, strict-mode-safe destroy) driven by the P2 showroom scene builder.
 *
 * `createShowroomScene` is a module-level function, so the reference is stable
 * across renders and safe as the effect dependency in PlayCanvasCanvas.
 */
export default function ShowroomCanvas() {
  return <PlayCanvasCanvas buildScene={createShowroomScene} />;
}
