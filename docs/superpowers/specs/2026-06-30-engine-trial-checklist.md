# Engine-Trial Feature & Comparison Checklist

**Applies to:** branches `E1-babylon`, `E2-playcanvas`, `E3-cocos`  
**Base branch:** `engine-trial/foundation`  
**Status:** All items below are acceptance gates; a branch is not eligible for Phase C comparison until every item is checked.

---

## 1. Environment & Visual Quality

| # | Feature | Acceptance criterion |
|---|---|---|
| 1.1 | Poly Haven HDRI image-based lighting | HDRI loaded and driving the scene ambient; visible in reflections on car body |
| 1.2 | ACES tone mapping | Enabled and producing a physically-plausible highlight roll-off |
| 1.3 | sRGB output | Output color space set to sRGB (not linear) |
| 1.4 | Soft shadows | Real-time shadows from the key light; visibly soft |
| 1.5 | Hero-car PBR | CarConcept loaded with metallic-roughness PBR materials intact |
| 1.6 | Hero-car clearcoat | Clear coat layer on car paint visible (engine must support KHR_materials_clearcoat or a custom equivalent) |
| 1.7 | Hero-car glass transmission | Window glass uses KHR_materials_transmission or equivalent |
| 1.8 | Static hero-shot home screen | Home screen renders a static 3D hero-shot of the car (intentional change from the current live GarageScene) |

---

## 2. World Geometry

| # | Feature | Acceptance criterion |
|---|---|---|
| 2.1 | Road surface | Drivable road surface with correct collision bounds; Asphalt or similar PBR texture |
| 2.2 | Building shells | At minimum a few building volumes surrounding the road |
| 2.3 | Water/pool plane | Visible water plane in the pool area |
| 2.4 | Curbs and props | Curb geometry and at least one prop type present |
| 2.5 | Traffic actors | TrafficSystem equivalent present: cars, bicycles, pedestrians, crossing actors cycling correctly |
| 2.6 | Traffic lights | Traffic-light signal cycling (red/amber/green) functional; feeds scoring |
| 2.7 | Rearview mirror | Rearview mirror renders via a second camera pass (render-to-texture); frame cost counted in B12 |
| 2.8 | Off-track detection | Off-track condition detected and scored |

---

## 3. Vehicle Physics

| # | Feature | Acceptance criterion |
|---|---|---|
| 3.1 | Engine's own vehicle model | Uses the engine's built-in or official vehicle physics (not the Three.js `carPhysics.ts` ported as-is) |
| 3.2 | Throttle / brake / steer | All three inputs produce correct vehicle response |
| 3.3 | Reverse gear | Reverse gear functional; gear state P/D/R stored (used by webcam hand pose) |
| 3.4 | Keyboard pedal-mode fallback | Keyboard-based pedal input works when webcam unavailable |
| 3.5 | Coordinate system | World coordinate system and scale identical to the original course (verified by replay score check — see §8) |

---

## 4. Controls

| # | Feature | Acceptance criterion |
|---|---|---|
| 4.1 | Keyboard drive | Arrow keys / WASD drive the car |
| 4.2 | Camera follow | Camera follows car smoothly |
| 4.3 | Camera — hero-shot mode | Static hero-shot camera on home screen (no auto-rotation) |

---

## 5. Lessons & Checkpoints

| # | Feature | Acceptance criterion |
|---|---|---|
| 5.1 | Tutorial flow | Tutorial screen/scene present and navigable |
| 5.2 | Nine lessons | All nine lessons accessible and completable |
| 5.3 | Stop checkpoints | Stop checkpoints graded correctly |
| 5.4 | Mirror checkpoints | Mirror-check checkpoints graded correctly (requires rearview mirror — 2.7) |
| 5.5 | Free mode | Free driving mode accessible |
| 5.6 | Scoring parity | A known replay produces the same score as the original app (tolerance: 0 points difference on stop/mirror checks) |

---

## 6. HUD

| # | Feature | Acceptance criterion |
|---|---|---|
| 6.1 | Speed readout | Current speed displayed |
| 6.2 | Gear readout | Current gear P/D/R displayed |
| 6.3 | Throttle readout | Throttle/brake percentage displayed |
| 6.4 | Feedback/warning overlays | Warning overlays shown during graded events |
| 6.5 | Feedback / replay-review screen | End-of-lesson scoring display and replay review screen present |
| 6.6 | fps overlay | Engine's own fps stats overlay enabled during development/B12 measurement |

---

## 7. Internationalization

| # | Feature | Acceptance criterion |
|---|---|---|
| 7.1 | Japanese UI | All UI text (lessons, HUD labels, feedback, menus) renders correctly in Japanese |
| 7.2 | English UI | All UI text renders correctly in English |
| 7.3 | Language toggle | User can switch language at runtime |

---

## 8. Firebase

| # | Feature | Acceptance criterion |
|---|---|---|
| 8.1 | Auth | Firebase auth (email/password or Google) functional; guest fall-soft |
| 8.2 | History | Drive history saved to Firestore; readable on history screen |
| 8.3 | Firestore rules | Rules from the main branch applied (owner-isolation) |

---

## 9. Webcam Control & Replay

| # | Feature | Acceptance criterion |
|---|---|---|
| 9.1 | Foot pedal recognition | MediaPipe foot detection drives throttle/brake |
| 9.2 | Hand pose — gear | Hand pose input sets gear P/D/R |
| 9.3 | Steering recognition | Steering wheel / hand position drives steering |
| 9.4 | Replay recording | A completed drive is recorded (timestamp-interpolated, not frame-rate-dependent) |
| 9.5 | Ghost playback | Replay plays back at correct speed and position regardless of recording fps |
| 9.6 | Replay-review screen | Replay can be reviewed post-lesson |

---

## 10. Performance Gate

| # | Metric | Target | **E1-babylon (measured, 2026-07-03)** |
|---|---|---|---|
| 10.1 | Frame rate | ≥ 60 fps steady at 1920×1200 on the target machine (Intel Core Ultra 7 255H + Intel Arc 140T) | ✅ home / keyboard-drive / replay = 60 fps. ⚠️ vision-active drive = **29 fps median** (MediaPipe-bound; see note) |
| 10.2 | Measured fps | Recorded figure from the measurement method below | Home (showroom hero) 60/60/60 · Drive keyboard 49/60/60 · Drive + vision (fake webcam) **26/29/42** · Replay 60/60/60 (min/median/max, headed real GPU) |
| 10.3 | Download size — models | Recorded figure | **2.97 MB** (CarConcept 1.21 + Quaternius world tiles/buildings/props) |
| 10.4 | Download size — decoders | Draco decoder + KTX2 decoder payload, recorded separately | Draco **0.07 MB** (wasm+js). No KTX2 (textures are .webp-in-GLB + one .hdr). HDRI 2k = **5.20 MB** (textures) |
| 10.5 | Download size — MediaPipe | MediaPipe vision WASM + model files, recorded separately | **22.38 MB** CDN (jsdelivr wasm 2.32 + googleapis models: pose_full 8.96, hand 7.46, face 3.59). Object detector (efficientdet, 6.92 MB) **dropped** in B12 — see §12.4 |
| 10.6 | Total to first interactive | Sum of all above; must be ≤ 50 MB | **32.58 MB** total to drive-ready (was 39.50 before the detector drop). First-interactive (home rendered) subtotal 7.48 MB. **PASS ≤ 50 MB** |

> **fps note (10.1):** the identical Babylon scene renders at a steady 60 fps under keyboard
> driving, so the vision-active deficit is entirely the MediaPipe pipeline (face + hand + pose
> landmarkers, one inference each per frame, synchronous on the shared iGPU), NOT Babylon
> rendering — an engine-independent cost. B12 dropped the debug-only object detector
> (16–18 fps dev → 20 fps prod baseline → **29 fps** after the drop). Reaching 60 with live
> vision would need inference decoupled from the render loop (workers / reduced cadence),
> beyond this task's documented-perf-lever scope and out of parity with the original app.

---

## 11. Build Quality

| # | Feature | Acceptance criterion | **E1-babylon (2026-07-03)** |
|---|---|---|---|
| 11.1 | type-check | `npm run type-check` passes with 0 errors | ✅ PASS (0 errors) |
| 11.2 | lint | `npm run lint` passes with 0 errors | ✅ PASS (0 errors; 2 pre-existing warnings live only in the FROZEN R3F originals `src/components/ui/FeedbackScreen.tsx` + `src/components/vision/VisionController.tsx`) |
| 11.3 | Unit tests | The branch's equivalent of the seven `node --test` suites pass: scoring, checkpoint eval, replay interpolation, pedal decision, steering gear, foot-pedal recognition, car physics (re-authored per engine) | ✅ PASS **151/151** (`npm run test:unit`) |
| 11.4 | Smoke test | `npm run smoke` (or engine equivalent) passes | ✅ e2e `npm run test:e2e` **5/5** (3 headless fallback + 2 headed vision); pure + E2E-flag production builds both compile clean |

---

## 12. Intentional Deviations from the Current App

These are deliberate behavior changes — not missing features:

| # | Change | Reason |
|---|---|---|
| 12.1 | Home screen: static hero shot instead of live GarageScene | Artistic direction for Phase B (plan §10.A) |
| 12.2 | Vehicle physics: engine's own model, not Three.js carPhysics.ts | Each engine uses its built-in vehicle controller for fair comparison (plan §9.B) |
| 12.3 | No shared cross-engine logic module | D1 resolution: full rewrite per engine (plan Revision 2) |
| 12.4 | **MediaPipe ObjectDetector dropped (E1, B12)** | Its output was used ONLY to append a debug-string suffix (`steeringGear.ts` never reads it for gear/steering/pedals). Dropping it removed 6.92 MB of download and ~+45 % vision fps (20→29). Driving behavior is byte-identical; the only observable change is the debug status panel losing the developer-only "Obj:" text. |

---

## Measurement Method

### fps — On-Screen Stats Overlay

Use each engine's own built-in profiling tool. Do NOT use headless rendering (SwiftShader renders no shadows; results are not representative of the real GPU).

| Engine | Stats tool |
|---|---|
| Babylon.js (E1) | `scene.debugLayer.show()` → Performance tab, or `EngineInstrumentation` / `SceneInstrumentation`. Also: `SceneOptimizer` diagnostics. |
| PlayCanvas (E2) | `pc.MiniStats` overlay enabled in the app. |
| Cocos Creator (E3) | Built-in profiler panel (`cc.profiler.setDisplayStats(true)` or checkbox in editor preview). |

**Measurement conditions:**
1. Run in a **headed Chromium browser** (not headless) on the target machine.
2. Navigate to the lesson select screen (not the home hero shot) so the full drivable world is loaded.
3. Drive one lap of the course to warm up, then record the fps shown by the overlay during a second lap.
4. Record the **minimum steady fps** (not peak) observed during normal driving with traffic, HUD, and mirror active.
5. Record GPU time per frame if the engine exposes it.

### Download Size — Built Asset Bytes to First Interactive

**Definition of "first interactive":** the moment the lesson-select screen renders and the user can click on a lesson (Firebase auth checked, WebGL scene rendered, webcam UI ready).

**Measurement method:**
1. Run `npm run build` (or the engine's production build command).
2. Open Chrome DevTools → Network tab → check "Disable cache" → hard-reload.
3. Filter by size: record bytes for:
   - glTF/GLB assets (models)
   - Texture files (WebP/KTX2/PNG)
   - Engine JS bundle
   - Draco decoder WASM/JS
   - KTX2 decoder WASM/JS (if used)
   - MediaPipe WASM and model files
4. Sum all bytes **transferred** (not uncompressed) until the "first interactive" moment.
5. Record the figure in `assets/CREDITS.md` (or the engine branch's equivalent) with a timestamp.

**Script:** a one-liner can capture this from the HAR export:
```
# After exporting a Chrome DevTools HAR file as network.har:
node -e "const h=JSON.parse(require('fs').readFileSync('network.har','utf8')); \
  const bytes=h.log.entries.reduce((s,e)=>s+(e.response._transferSize||0),0); \
  console.log((bytes/1024/1024).toFixed(2)+' MB transferred')"
```

---

## Sign-Off Checklist (B12 commit message must include)

```
E1-babylon B12 measurement sign-off (2026-07-03, headed, Arc 140T, 1920x1200):
  fps (steady, headed, target GPU): home 60 / keyboard-drive 60 / replay 60 / vision-drive 29 (median)
  download — models (MB): 2.97
  download — decoders (MB): 0.07 (Draco; no KTX2)  [+ HDRI texture 5.20]
  download — MediaPipe (MB): 22.38 (object detector dropped, -6.92)
  download — total to drive-ready (MB): 32.58   (<= 50 budget: PASS; first-interactive/home 7.48)
  type-check: PASS
  lint: PASS
  unit tests: PASS (151/151)
  smoke / e2e: PASS (e2e 5/5)
```

---

## E1-babylon — Known Gaps (recorded at B12, NOT fixed here)

These are honest E1-branch conclusions the engine comparison needs on record:

- **World build-out gap:** s-curve / crank / crosswalk / traffic-light / railroad lesson
  areas are unbuilt. Their goals are reachable over the flat safety ground, but the car
  reads **OFF TRACK** in the unbuilt zones. Only the straight + turn stubs are modelled
  (affects §2.5 traffic actors, parts of §5.2 nine-lesson fidelity).
- **Traffic light is a DOM widget** (§2.6), not a 3D signal in the world; it still cycles
  and feeds the scoring's red-light check.
- **Hero car is still the placeholder box** in the drive and replay scenes (§1.5–1.7 PBR
  CarConcept is present only in the showroom/home hero).
- **Real-webcam drive-test pending** (§9.1–9.3): hands-steer, gear gestures, feet pedals,
  and face→mirror checkpoints exercised only via fake webcam / keyboard fallback so far.
- **Firebase real-config smoke pending** (§8): auth + history save/fetch verified fail-soft
  and by record-shape tests, but not against a live Firebase project.
