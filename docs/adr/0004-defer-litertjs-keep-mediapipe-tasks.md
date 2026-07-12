# ADR 0004 — Defer LiteRT.js; keep MediaPipe Tasks for the vision pipeline

**Status:** Accepted
**Date:** 2026-07-09
**Author:** taishi
**Context source:** grilling session on the LiteRT.js announcement
(https://developers.googleblog.com/litertjs-googles-high-performance-web-ai-inference/)

---

## Context

LiteRT.js (`@litertjs/core`) is Google's new JavaScript binding of the native
LiteRT (formerly TFLite) runtime for in-browser inference, with `wasm` (XNNPACK
CPU), `webgpu` (ML Drift), and experimental `webnn` (NPU) backends. It was raised
as a possible lever to improve the app's **quality assurance, UI, architecture,
and availability**.

Two facts from the docs + our codebase decide the question:

1. **LiteRT.js is raw-tensor-only.** Its entire API surface is
   `loadLiteRt()` → `loadAndCompile(model.tflite, {accelerator})` →
   `model.run(tensor) → tensor` (plus manual `.data()`/`.delete()` tensor
   management and an optional `@litertjs/tfjs-interop`). It ships **no** vision
   task pipelines — no hand/pose/face/object detection.

2. **Our vision layer is entirely high-level MediaPipe Tasks.**
   `src/components/playcanvas/product/VisionController.tsx` uses
   `FaceLandmarker`, `HandLandmarker`, and `PoseLandmarker` (GPU delegate, VIDEO
   running mode, staggered inference, CDN-loaded `.task` models). MediaPipe Tasks
   already runs **on top of** the LiteRT/TFLite runtime, bundling the model graph
   plus image pre-processing and tensor→landmark post-processing.

MediaPipe Tasks is therefore a *higher-level* consumer of the same runtime, not a
peer LiteRT.js could replace like-for-like. Swapping to LiteRT.js would mean
re-implementing MediaPipe's landmark pipelines by hand (resize/normalize, anchor
decode, NMS, landmark extraction) — a large effort and a QA *risk*.

Separately, nearly all of the app's decision logic is already **pure heuristics**
on landmarks (`steeringGear.ts`, `footPedalRecognition.ts`, `pedalDecision.ts`,
`scoring.ts`, `checkpointEval.ts`), not learned models. No concrete custom-model
capability is needed today that these heuristics + MediaPipe landmarks don't cover.

## Decision

**Keep MediaPipe Tasks for all existing hand/pose/face detection. Do not adopt
LiteRT.js at this time.** LiteRT.js is deferred to a documented future option,
reserved for the case where a genuine **custom `.tflite` model** need arises that
cannot be met by MediaPipe landmarks + heuristics (candidate example: a trained
driving-quality/smoothness classifier — which would first require training data we
do not have).

If that need arises, LiteRT.js would **coexist** with MediaPipe (custom model on
LiteRT.js, landmarks still from MediaPipe Tasks), not replace it.

## Consequences

- The four improvement goals (QA / UI / architecture / availability) are pursued
  by other means, tracked separately from this ADR.
- **Revisit triggers:** (a) a concrete custom-model feature with training data;
  (b) MediaPipe Tasks becoming a maintenance/availability liability (e.g. the
  jsDelivr WASM CDN or the `storage.googleapis.com` `.task` model URLs becoming a
  reliability problem — note this is already an *availability* concern worth
  addressing independently of LiteRT.js).
- Adoption cost when triggered: LiteRT.js requires serving its own WASM files and
  likely COOP/COEP headers for multi-threaded/SharedArrayBuffer execution — to be
  designed at that time.
