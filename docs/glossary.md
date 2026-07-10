# Glossary — Virtual Driving School

Shared vocabulary for the project. Add terms as they earn a precise, non-obvious meaning.

## Vision / ML

- **MediaPipe Tasks (`@mediapipe/tasks-vision`)** — The high-level vision library the app
  uses for detection. Provides ready-made *task* APIs (`FaceLandmarker`, `HandLandmarker`,
  `PoseLandmarker`) that take a video frame and return finished **landmarks**. Bundles the
  model graph plus image pre-processing and tensor→landmark post-processing. Runs on top of
  the LiteRT/TFLite runtime. This is what `VisionController.tsx` consumes.

- **LiteRT / TFLite runtime** — Google's native on-device inference engine (LiteRT is the
  rebranded TensorFlow Lite). It executes a compiled `.tflite` model. MediaPipe Tasks is a
  consumer of this runtime.

- **LiteRT.js (`@litertjs/core`)** — The JavaScript/WASM binding of the LiteRT runtime for
  the browser. **Raw-tensor only**: `loadLiteRt()` → `loadAndCompile(model.tflite,
  {accelerator})` → `model.run(tensor) → tensor`. Ships **no** vision tasks — you supply
  pre/post-processing yourself. Backends: `wasm` (XNNPACK CPU), `webgpu` (ML Drift GPU),
  `webnn` (experimental NPU). **Deferred** for this project — see ADR 0004.

- **Landmark** — A normalized 2D/3D point returned by a MediaPipe landmarker (e.g. hand
  point 0 = wrist, 9 = middle-finger MCP; face point 1 = nose). Coordinates are 0..1 in
  image space. The app's pure modules turn landmarks into steering/pedals/gaze.

- **Delegate** — Which backend a MediaPipe task runs on: `"GPU"` (default here) or `"CPU"`.
  GPU can fail to initialize on some devices/drivers; the resilient loader falls back
  GPU→CPU (see the vision-resilience design).

- **Pure-core contract / frozen core** — The set of engine-agnostic pure modules whose
  behavior must stay identical across changes so scoring and replay remain deterministic:
  store, course, scoring, missions, `checkpointEval`, replay, and the pure vision-decision
  modules (`steeringGear`, `pedalDecision`, `footPedalRecognition`). Not edited by
  feature/engine work.

- **Vision seam / `modelSources`** — The single config module that holds all model + WASM
  paths and loader options, so asset hosting (CDN vs self-hosted) and tuning live in one
  place instead of inline in the controller.

## Rendering / world

- **PlayCanvas product tree** — The live app under `src/components/playcanvas/product/*`,
  mounted by `src/app/page.tsx` via `ProductApp`. Superseded the Three.js/R3F `ClientApp`
  tree (ADR 0003, PR #30).

- **Off-track predicate (`isOnRoad`)** — Pure layout math in `pcDriveLayout.ts` deciding
  whether a world point is on the drivable surface; also the basis for the **track boundary
  walls** (invisible perimeter colliders derived from the same predicate).
