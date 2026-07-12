# Design — Vision-layer improvements: QA, Architecture, Availability, UI

**Date:** 2026-07-10
**Status:** Approved (design) — pending implementation plans (one per PR)
**Origin:** grilling session prompted by the LiteRT.js announcement; root decision recorded in **ADR 0004**.

## Summary

The trigger (adopt LiteRT.js) was pressure-tested and **rejected for now** (ADR 0004):
LiteRT.js is a raw-tensor `.tflite` runtime with no vision-task pipelines, while our
vision layer is high-level MediaPipe Tasks (`FaceLandmarker`/`HandLandmarker`/
`PoseLandmarker`), and no custom-model need exists today. The real objective —
improving **quality assurance, architecture, availability, and UI** — is pursued
directly, without LiteRT.js. This spec defines that work.

All work is scoped to the live PlayCanvas product tree (`src/components/playcanvas/product/*`)
and the pure vision modules (`src/lib/vision/*`). The **frozen pure-core contract**
(store / scoring / checkpointEval / replay / steering / pedal decision) is not changed;
the one new pure module (`computeHeadPose`) is *additive* and head-pose is not part of
the scored/replayed core, so replay determinism is preserved.

## Delivery: 3 PRs

Build order: **PR-1 first** (trivial, de-risks the duplicate loader), then **PR-2 and
PR-3 in parallel**.

---

### PR-1 — Architecture: delete the unrouted R3F reference tree (preserve in git)

The app root (`src/app/page.tsx`) mounts `playcanvas/product/ProductApp`. The
Three.js-era tree is **unrouted** but was **intentionally retained** as a
flow-semantics reference (`page.tsx`: *"The original R3F ClientApp stays in-tree as
the flow-semantics reference but is no longer routed"*), and live product comments
cite it (*"original ClientApp semantics," "original Dashboard,"* `pcLessonCatalog.ts`
*MISSION_INFO "from the original ClientApp.tsx"*). It also carries a **second,
drifting copy** of the MediaPipe CDN loader.

**Reference-check result (transitive dead set — all reachable only from `ClientApp`
or within these dirs; every live-code reference is a comment, not an import):**
- `src/components/ClientApp.tsx`
- `src/components/vision/` (only `VisionController.tsx`)
- `src/components/ui/` (all 9: `Dashboard`, `FeedbackScreen`, `HistoryScreen`,
  `HomeScreen`, `LanguageScreen`, `PauseMenu`, `TutorialIndicators`,
  `TutorialPlainScene`, `TutorialScreen`)
- `src/hooks/useDrivingFeedback.ts`

**NOT dead (do not touch):** `src/components/simulation/*` and the `/debug` route,
which still legitimately use `@react-three/fiber`.

**Plan (delete + preserve reference in git):**
1. Tag the pre-deletion commit `r3f-reference-pre-delete` (a commit that still
   contains the tree) so the side-by-side reference stays discoverable.
2. Update the comments that name **file paths** in the old tree to point at the tag
   instead (`page.tsx`, `pcLessonCatalog.ts`, product `VisionController.tsx`,
   product `TutorialScreen.tsx`). Purely conceptual "original …-semantics" comments
   may stay (they describe intent, not a file to open).
3. Delete the dead set above.
4. Verify: `npm run lint`, `npm run type-check`, full `node --test`, and `next build`
   all green; app still mounts and runs.

**Rationale:** removes runtime dead weight + the duplicate external-CDN loader before
PR-2 touches the live loader, without losing the validated reference.

---

### PR-2 — Architecture seams + Availability + QA (the vision-resilience PR)

**Architecture (extraction):**
- `src/lib/vision/headPose.ts` — new **pure** module
  `computeHeadPose(faceLandmarks) → { yaw, gaze }`, moving the inline face math
  (currently `VisionController.tsx:349-369`) out of the per-frame loop. Matches the
  existing `steeringGear.ts` / `pedalDecision.ts` pattern. Controller calls it and
  applies `setHeadRotation` / `setGaze` (store contract unchanged).
- `src/lib/vision/modelSources.ts` — new config module holding **all** WASM + `.task`
  paths and loader options (delegates, confidences, `numHands`/`numPoses`, etc.). The
  single availability seam. Paths are **same-origin relative** (e.g. `/mediapipe/wasm`,
  `/models/hand_landmarker.task`).

**Availability (self-hosting):**
- Add `@mediapipe/tasks-vision` as a **pinned** npm dependency (exact version, currently
  `0.10.3`).
- Build-time fetch script (`scripts/fetch-vision-assets.mjs`, run in `predev`/`prebuild`):
  copies `node_modules/@mediapipe/tasks-vision/wasm/` → `public/mediapipe/wasm/` and
  downloads the pinned `.task` model URLs → `public/models/`, verifying a **checksum**
  per file. `public/mediapipe/` and `public/models/` are **gitignored** (repo stays lean;
  Vercel origin serves them). Models stay **lazy-loaded / camera-gated** exactly as today.
- `FilesetResolver.forVisionTasks` and every `modelAssetPath` read from
  `modelSources.ts` → same-origin. No `cdn.jsdelivr.net` / `storage.googleapis.com` at
  runtime.

**Availability (resilient loading):**
- Loader tries `delegate: "GPU"`; on failure, **retry once with `delegate: "CPU"`**
  (covers GPU-less / broken-driver devices).
- If CPU also fails, surface a **user-facing error overlay + Retry**, mirroring the
  existing `cameraError` pattern (`retryRef` + overlay). Add a `modelError` state (or
  extend the existing error enum). **Never hang silently at "Loading AI Models…".**

**QA (tests):**
- `tests/headPose.test.ts` — thorough unit tests for yaw + gaze math (style/rigor of
  `steeringGear.test.ts`): neutral, left/right yaw sign, gaze ratio extremes, missing
  landmarks → null/neutral.
- `tests/visionModelSources.test.ts` — **regression guard**: asserts every path is
  same-origin/relative and matches no external-host pattern (`https?://`), so a CDN
  dependency can never silently return.
- Failure-path test: inject a failing loader (GPU throws) and assert the sequence
  GPU→CPU→(both fail)→error+Retry. Prefer testing this against the extracted loader
  logic rather than the full React component.
- Human real-webcam drive-test remains tracked separately (see the pending drive-test
  memory); not part of this automated QA.

---

### PR-3 — UI: accessibility + responsiveness (parallel with PR-2)

Scope is the 8 product screens; the visual aesthetic is preserved (already deliberate).

**Accessibility (target WCAG 2.1 AA):**
- Color contrast to AA across text/controls (the `slate-400/600` on dark, accent links).
- Keyboard navigation with **visible focus states** on all interactive controls.
- ARIA roles/labels for icon-only and non-semantic controls; meaningful alt/labels.
- `prefers-reduced-motion`: gate `animate-pulse` and other motion.

**Responsiveness — target laptop + tablet landscape (~768px → large desktop):**
- Fluid type/spacing + a small set of breakpoints; replace desktop-only fixed
  `p-8`/`text-5xl` where they clip/overflow.
- **Not** chasing phone-portrait: the driving flow needs the camera to frame
  hands + feet + head, which portrait can't do.

**Verification:**
- `eslint-plugin-jsx-a11y` (static, in CI lint).
- `axe-core` scan via Playwright over the key screens (runtime, in e2e).
- Manual keyboard-only walkthrough of the primary flow.

---

## Explicitly out of scope

- LiteRT.js adoption (ADR 0004; revisit triggers listed there).
- Any change to the frozen pure scoring/replay core.
- Model-variant downsizing (`pose_full→lite`) — a detection-feel tradeoff deferred to
  after the pending drive-test verdict.
- Phone-portrait layouts.

## Open items for the per-PR plans

- Exact list of files transitively dead with the old tree (resolve during PR-1
  reference-check).
- Whether `modelError` is a new state or an extension of the existing camera-error enum.
- Checksum source/pinning for the model fetch (record the pinned URLs + hashes in the
  fetch script).
