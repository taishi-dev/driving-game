import { Scene } from "@babylonjs/core/scene";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { Engine } from "@babylonjs/core/Engines/engine";

/**
 * B1 scaffold scene: a static camera over a clear color.
 *
 * B2 will add the HDRI environment, tone mapping, the self-built showroom
 * (ground + backdrop) and soft shadows. B3 loads the hero car. Kept async from
 * the start so the caller's teardown path (dispose-after-await) is exercised now.
 */
export async function createShowroomScene(engine: Engine): Promise<Scene> {
  const scene = new Scene(engine);
  // Neutral studio grey so a black canvas reads as "failed", not "empty".
  scene.clearColor = new Color4(0.055, 0.06, 0.07, 1);

  // Static hero camera (no auto-rotation). ArcRotateCamera positioned by hand;
  // inputs are NOT attached, so it does not move on its own or on drag.
  const camera = new ArcRotateCamera(
    "hero",
    Math.PI * 0.62, // alpha — three-quarter front view
    Math.PI * 0.46, // beta — slightly above eye level
    9.5, // radius
    new Vector3(0, 0.6, 0),
    scene,
  );
  camera.fov = 0.6;
  scene.activeCamera = camera;

  return scene;
}
