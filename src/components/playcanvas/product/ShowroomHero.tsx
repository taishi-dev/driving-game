"use client";

import PlayCanvasCanvas from "../PlayCanvasCanvas";
import { createShowroomScene } from "../showroomScene";

/**
 * P7a — the Home hero background: the P2/P3 showroom scene (HDRI-lit hero car,
 * STATIC camera, no rotation), without the FPS badge so the overlay chrome owns
 * the corners. Module-level builder reference keeps the canvas effect stable.
 */
export default function ShowroomHero() {
  return <PlayCanvasCanvas buildScene={createShowroomScene} showFps={false} />;
}
