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

| # | Metric | Target |
|---|---|---|
| 10.1 | Frame rate | ≥ 60 fps steady at 1920×1200 on the target machine (Intel Core Ultra 7 255H + Intel Arc 140T) |
| 10.2 | Measured fps | Recorded figure from the measurement method below |
| 10.3 | Download size — models | Recorded figure from the measurement method below |
| 10.4 | Download size — decoders | Draco decoder + KTX2 decoder payload, recorded separately |
| 10.5 | Download size — MediaPipe | MediaPipe vision WASM + model files, recorded separately |
| 10.6 | Total to first interactive | Sum of all above; must be ≤ 50 MB |

---

## 11. Build Quality

| # | Feature | Acceptance criterion |
|---|---|---|
| 11.1 | type-check | `npm run type-check` passes with 0 errors |
| 11.2 | lint | `npm run lint` passes with 0 errors |
| 11.3 | Unit tests | The branch's equivalent of the seven `node --test` suites pass: scoring, checkpoint eval, replay interpolation, pedal decision, steering gear, foot-pedal recognition, car physics (re-authored per engine) |
| 11.4 | Smoke test | `npm run smoke` (or engine equivalent) passes |

---

## 12. Intentional Deviations from the Current App

These are deliberate behavior changes — not missing features:

| # | Change | Reason |
|---|---|---|
| 12.1 | Home screen: static hero shot instead of live GarageScene | Artistic direction for Phase B (plan §10.A) |
| 12.2 | Vehicle physics: engine's own model, not Three.js carPhysics.ts | Each engine uses its built-in vehicle controller for fair comparison (plan §9.B) |
| 12.3 | No shared cross-engine logic module | D1 resolution: full rewrite per engine (plan Revision 2) |

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
E<n>-<engine> B12 measurement sign-off:
  fps (steady, headed, target GPU): ___
  download — models (MB): ___
  download — decoders (MB): ___
  download — MediaPipe (MB): ___
  download — total to first interactive (MB): ___
  type-check: PASS
  lint: PASS
  unit tests: PASS (_/_ suites)
  smoke: PASS
```

---

## E3 · Cocos Creator — Trial Verdict: **EARLY-EXIT (code-first infeasible)**

**Date:** 2026-07-04 · **Gate:** C0 feasibility spike · **Full evidence:** `.superpowers/sdd/c0-feasibility-report.md`

Cocos Creator 3.8 **cannot** power our Next.js app code-first (no editor in the build loop). The C0 gate failed at criterion 1; the branch stops here as a valid, documented trial datum. It is **not eligible** for the Phase C comparison items above — none of §1–§11 were built. Two independent, primary-source-confirmed blockers:

| C0 criterion | Result | Evidence |
|---|---|---|
| 1. Engine embed (code-first) | **FAIL** | No runnable Cocos 3.8 web runtime on npm: `cc` = C++ linter, `cocos-js`/`@cocos-creator-3d/engine` 404, `@cocos/creator-types@3.8.7` = types-only (644 `.d.ts`, 0 engine `.js`). `cocos-engine` README: engine "designed to only be the essential runtime library and not to be used independently." Build guide: `settings.json` + bundle `config.json` + MD5 asset bundles are editor-generated; `game.init` requires them. |
| 2. Runtime GLB (Draco+WebP) | **FAIL** (independent) | Cocos has no runtime GLB/glTF loading — glTF is an edit-time editor import → native asset conversion. `assetManager.loadRemote` = native types only (texture/audio/text). Open request: `cocos-engine` Issue #16531. Our `public/models3d/*.glb` runtime pipeline is unsupported. |
| 3. PBR + IBL | NOT TESTED | Gated behind criterion 1 (engine never boots code-first). |
| 4. Bullet physics | NOT TESTED | Gated behind criterion 1. |
| 5. License (recorded) | RISK | Runtime engine open-source (MIT). Cocos User Service Agreement: free **for games**; non-game apps (a driving-school **training simulator** plausibly qualifies) need **written authorization + possible fees**. |

**What proceeding would require:** adopt an editor-in-the-loop build (breaks code-first parity with E1/E2), pre-import all models through the editor (abandon the shared runtime Draco+WebP GLB pipeline), plus custom clearcoat Surface Shader and hand-built Bullet raycast vehicle. Comparison basis: E1 (Babylon, COMPLETE) and E2 (PlayCanvas, COMPLETE) both embed code-first from npm and load GLBs at runtime; Cocos supports neither.
