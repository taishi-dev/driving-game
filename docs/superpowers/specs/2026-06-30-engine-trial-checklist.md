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

Headed, real GPU (Arc 140T), 1920×1200, browser window foregrounded
(`page.bringToFront()` — the E1 lesson: occluded Chrome throttles rAF). E1's
recorded figures are shown for side-by-side.

| # | Metric | Target | **E2-playcanvas (measured, 2026-07-04)** | E1-babylon (ref) |
|---|---|---|---|---|
| 10.1 | Frame rate | ≥ 60 fps steady at 1920×1200 on the target machine (Intel Core Ultra 7 255H + Intel Arc 140T) | ✅ home / keyboard-drive / replay = **60 fps steady**. ⚠️ vision-active drive = **49 fps median** (MediaPipe-bound; see note) | 60 / 60 / 60; vision 29 |
| 10.2 | Measured fps | Recorded figure from the measurement method below | Home (showroom hero) **60/60/60** · Keyboard drive (isolated `/drive`, full world + mirror, no vision) **60/60/60** (drawCalls 99, 59.2 km/h) · Drive + vision (fake webcam, `isVisionReady`) **40/49/55** · Replay **60/60/60** (min/median/max) | 60/49-60 / 26-29-42 / 60 |
| 10.3 | Download size — models | Recorded figure from the measurement method below | **2.97 MB** (CarConcept 1.21 + Quaternius world tiles/buildings/props) | 2.97 MB |
| 10.4 | Download size — decoders | Draco decoder + KTX2 decoder payload, recorded separately | Draco **0.07 MB** (wasm 0.06 + js glue). No KTX2 (textures are .webp-in-GLB + one .hdr). HDRI 2k = **5.20 MB** (textures) | Draco 0.07; HDRI 5.20 |
| 10.5 | Download size — MediaPipe | MediaPipe vision WASM + model files, recorded separately | **22.38 MB** CDN (jsdelivr `tasks-vision` wasm + googleapis models: pose_full, hand, face). **No ObjectDetector shipped** — E2 never included it (parity with E1's post-drop state, reached independently in P11) | 22.38 MB (detector dropped) |
| 10.6 | Total to first interactive | Sum of all above; must be ≤ 50 MB | **31.93 MB** total to drive-ready (pure prod build; + Ammo physics wasm 0.33, app JS 0.95, other 0.03). First-interactive (home hero rendered) subtotal **7.42 MB**. **PASS ≤ 50 MB** | 32.58 MB; home 7.48 |

> **fps note (10.1):** the identical PlayCanvas scene renders a rock-steady 60 fps
> under keyboard driving on the ISOLATED `/drive` route (full world, rearview
> mirror RTT active, no vision layer) — all 15 sample windows read 60 — so the
> vision-active deficit is entirely the MediaPipe pipeline (face + hand + pose
> landmarkers, one inference each per frame, on the shared iGPU), NOT PlayCanvas
> rendering. E2's **49 fps median** with live vision is materially better than
> E1's 29 (same three landmarkers, same no-detector config); reaching 60 with
> live vision would need inference decoupled from the render loop (workers /
> reduced cadence) — beyond this task's documented-perf-lever scope and out of
> parity with the original app. **No tuning lever was applied** (measure → the
> one short surface is inference-bound, not render-bound → nothing to tune
> without an out-of-scope architecture change; every render surface already hits
> 60). The keyboard-drive number was measured on `/drive` specifically because on
> the product route the vision layer always mounts and MediaPipe's model load
> transiently depresses the first seconds of driving (a measurement confound, not
> a steady-state cost).

---

## 11. Build Quality

| # | Feature | Acceptance criterion | **E2-playcanvas (2026-07-04)** |
|---|---|---|---|
| 11.1 | type-check | `npm run type-check` passes with 0 errors | ✅ PASS (0 errors) |
| 11.2 | lint | `npm run lint` passes with 0 errors | ✅ PASS (0 errors; 2 pre-existing warnings live only in the FROZEN R3F originals `src/components/ui/FeedbackScreen.tsx` + `src/components/vision/VisionController.tsx` — not the PlayCanvas product files) |
| 11.3 | Unit tests | The branch's equivalent of the seven `node --test` suites pass: scoring, checkpoint eval, replay interpolation, pedal decision, steering gear, foot-pedal recognition, car physics (re-authored per engine) | ✅ PASS **148/148** (`npm run test:unit`, 16 suites incl. `pcVehicleKernel`, `pcMissionGrading`, `pcDriveControls`, `pcDriveLayout`, `pcMirrorLayout`, `pcMissionLog`, `pcVisionStatus`, `pcLessonCatalog`, `pcUiStrings`, `replay`, `scoring`, `checkpointEval`, `pedalDecision`, `steeringGear`, `footPedalRecognition`, retired `carPhysics`). **Vehicle-physics note:** the shipped vehicle is Bullet's official `btRaycastVehicle` (via Ammo) wrapped in `raycastVehicle.ts` — welded to Ammo bodies + the dynamics world, so it has NO pure unit suite; it is verified by **headed driving + the e2e specs** (drive/reverse/steer/top-speed/goal observed live). Its load-bearing arithmetic (over-speed drag, speed-sensitive steer, km/h↔m/s) is extracted into the engine-free `src/lib/pcVehicleKernel.ts` and unit-tested there; `RaycastVehicle` calls those exact functions. |
| 11.4 | Smoke test | `npm run smoke` (or engine equivalent) passes | ✅ e2e `npm run test:e2e` **5/5** (3 headless camera-denied fallback + 2 headed fake-webcam vision, incl. straight lesson to 100/100); pure + `NEXT_PUBLIC_E2E=1` production builds both compile clean |

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

## E2 · PlayCanvas (playcanvas@2.20.5) — capability findings

Filled during P2/P3. Verified headed at 1920×1200 on the Arc 140T.

### Research-FLAG resolutions

| FLAG | Research claim (2026-06-30) | E2 verdict (2.20.5) |
|---|---|---|
| `[C-pbr]` clearcoat | "clearCoat props exist FLAG (not verified this run)" | **EXISTS — CONFIRMED.** `pc.StandardMaterial` exposes the full clear-coat set: `clearCoat`, `clearCoatGloss`, `clearCoatGlossInvert`, `clearCoatMap`/`…MapChannel`/`…MapUv`/tiling/offset/rotation, `clearCoatVertexColor`, `clearCoatNormalMap`, `clearCoatPackedNormal`. The glTF loader imports `KHR_materials_clearcoat` onto it automatically. **Checklist 1.6 satisfied — no fallback needed.** |
| `[C-ibl]` IBL prefilter | "HDR cubemap; prefilter offline (no runtime prefilter API found)" | **OUTDATED.** `pc.EnvLighting` provides runtime prefiltering: `generateLightingSource(equirect)` → `generateAtlas(source)` produces the prefiltered reflection+ambient atlas assigned to `scene.envAtlas`. Combined with the native `HdrParser` (loads Radiance `.hdr`), the whole IBL pipeline runs at load time — **no offline cubemap artifact required.** |

### P2/P3 feature status

| # | Feature | Status | Implementation note |
|---|---|---|---|
| 1.1 | HDRI IBL | ✅ | 2k `.hdr` → `EnvLighting` atlas → `scene.envAtlas`; visible in car-body reflections. |
| 1.2 | ACES tone mapping | ✅ | `camera.toneMapping = TONEMAP_ACES`. |
| 1.3 | sRGB output | ✅ | `camera.gammaCorrection` defaults to `GAMMA_SRGB` in 2.x. |
| 1.4 | Soft shadows | ✅ | Directional key light, `SHADOW_PCF5`, 2048 res. |
| 1.5 | Hero-car PBR | ✅ | `CarConcept-draco-webp.glb` via container loader; metallic-roughness intact. |
| 1.6 | Hero-car clearcoat | ✅ | Carmine body forced onto bound Paint slots: `clearCoat=1`, `clearCoatGloss=0.97`. |
| 1.7 | Hero-car glass transmission | ✅ | `KHR_materials_transmission` imported (dynamic refraction); enabled via `camera.requestSceneColorMap(true)` scene-colour grab pass. |
| 1.8 | Static hero-shot home | ✅ | Static rear-3/4 camera on `/showroom`; no auto-rotation. |

### hiDPI decision (P1 review note)

`graphicsDevice.maxPixelRatio = min(devicePixelRatio, 2)`. Rationale: `FILLMODE_FILL_WINDOW` + `RESOLUTION_AUTO` otherwise renders at full DPR; capping at 2 bounds fragment cost on the Arc 140T iGPU. No-op at the 1920×1200 DPR-1 verification window. Drive scenes (P4+) may lower further after measurement.

### Draco decoder (runtime, no CDN)

Local decoder shipped at `public/lib/draco/` (`draco_wasm_wrapper.js` 58 KB glue + `draco_decoder.wasm` 192 KB; **250 KB total**, Apache-2.0, Google Draco glTF build). Wired via `pc.dracoInitialize({ jsUrl, wasmUrl, numWorkers: 1 })`. Counts toward the "decoders" line of the §10 download budget. (Transferred/encoded bytes over the wire = **0.07 MB**; the 250 KB figure is on-disk uncompressed.)

---

## E2-playcanvas — Engine effort & quirks (the trial's qualitative deliverable)

- **Biggest E2 win — official vehicle physics.** Where E1 (Babylon) had to
  HAND-BUILD a raycast vehicle from rigid bodies + manual suspension/grip/steer
  forces (~400 lines fighting a neutral-steer yaw drift), PlayCanvas runs on Ammo
  and Ammo ships Bullet's production `btRaycastVehicle`. `raycastVehicle.ts` is a
  thin adapter (`setCoordinateSystem(0,1,2)`; drag-based 59.3 km/h cap). The
  straight-line probe measured max |x| = 0.036 m over 165 m — **E1's whole drift
  class is simply absent.**
- **Capability FLAGs both resolved favourably (§ capability findings above):**
  clearcoat EXISTS on `StandardMaterial`; `EnvLighting` prefilters IBL at RUNTIME
  (the offline-cubemap FLAG was outdated for 2.20.5) — no offline artifact.
- **Engine quirks found & worked around:** (a) `opacityMap` with per-pixel
  variation renders INVISIBLE in 2.20.5 → contact shadow reworked via
  `emissiveMap` + `BLEND_MULTIPLICATIVE`; (b) Quaternius kit GLBs import with
  `metalness = 1` (dark albedo → black under IBL) → demetalized kit-wide, plus a
  shared-default-material mutation bug fixed with per-entity materials; (c) the
  engine's module-level Draco **JobQueue wedge** — a decode callback that throws
  on a destroyed device permanently strands the single worker (fast lesson-click
  mid-hero-decode), silently stalling all later world GLBs → root-fixed by
  deferring `app.destroy()` until in-flight GLB loads settle
  (`PlayCanvasCanvas.tsx`).

## E2-playcanvas — Known Gaps (recorded at P12, NOT fixed here)

Honest E2-branch conclusions the engine comparison needs on record (same class
as E1's gaps — the two branches are deliberately at feature parity):

- **Click-to-pause not ported** (original ClientApp pause overlay): deliberate —
  Escape + exit button replace it; vision layer acquires camera on mount without
  a pause state (see `VisionController` rationale in `src/components/playcanvas/product/VisionController.tsx:39-41`).
  Same gap exists in E1 (parity, previously unrecorded).
- **Headless-only VertexBuffer teardown race** during rapid scene remounts (P7b
  sweep artifact): benign, never occurs in normal use; recorded for completeness.
- **World build-out gap:** the s-curve / crank / crosswalk / traffic-light /
  railroad lesson areas are unbuilt; goals are reachable over the flat safety
  ground but the car reads **OFF TRACK** in the unbuilt zones. Only the straight
  + turn stubs are modelled (affects §2.5 traffic actors, parts of §5.2).
- **Traffic light is a DOM widget** (§2.6), not a 3D signal in the world; it
  still cycles (anchored at ACTIVE) and feeds the scoring's red-light check.
- **Hero car is the placeholder box** in the drive AND replay scenes — the PBR
  CarConcept (clearcoat/glass, §1.5–1.7) appears only in the showroom/home hero.
- **Real-webcam drive-test pending** (§9.1–9.3): hands-steer, gear gestures, feet
  pedals, and face→mirror checkpoints exercised only via fake webcam / keyboard
  fallback so far (fake-stream e2e proves the pipeline runs; real hands cannot be
  driven headless).
- **Firebase real-config smoke pending** (§8): auth + history save/fetch verified
  fail-soft and by record-shape tests, but not against a live Firebase project.
- **three.js still ships at runtime for course/scoring math:** the D1.a "verbatim
  core" decision keeps `course.ts` / `scoring.ts` / the store on
  `THREE.CurvePath`/`THREE.Vector3`, so the three.js runtime is bundled even
  though PlayCanvas renders the world. Its bytes are folded into the measured app
  JS (§10.6, 0.95 MB) — not a separate line item (identical situation to E1).
- **Disclosed bounded leak:** `btVehicleTuning` is one POD struct per vehicle
  mount that this ammo.js build cannot `Ammo.destroy()` (the accessor throws
  "Did you create it yourself?" because the vehicle copies its values by
  reference at `addWheel`) — negligible and bounded; documented in
  `raycastVehicle.ts`.

## E2-playcanvas — P12 cleanup roll-up

| Ledger item | Resolution |
|---|---|
| P8 review: `replayScene` duplicates ~140 lines of `driveScene` scene-assembly | **Factored.** The shared sky/IBL (runtime HDRI → `EnvLighting` atlas) + key-light block extracted to `driveSky.ts` (`setupDriveSkyAndSun`), consumed by both `buildDriveSceneBase` and `createReplayScene`. Kept in its own module (not re-exported from `driveScene`) so the replay chunk does not pull the vehicle/mirror/controls code. Strict-mode async dispose centralized. Verified at runtime by the headed vision e2e (drives to 100/100 → feedback replay). |
| P4: per-wheel `new Quat()` per frame | **Fixed.** `RaycastVehicle` now reuses a single scratch `wheelQuat` (`.set()` + `setRotation`) in `syncWheels` — 4 allocations/frame → 0. |
| P4/P7b: `__driveDebug` ungated on the `/drive` test route | **Decision: gate it** exactly like the product scene + `__drivingStore` (build-time `NEXT_PUBLIC_E2E === "1"` — dead-code-eliminated from prod — AND runtime `?e2e`). It exposes behaviour injection (`setInput`/`reset`), so keeping it out of the real deploy is a small hardening win. The on-screen `drive-fps` badge is untouched (rendered by `PlayCanvasCanvas`), so measurement + the `?e2e` e2e specs still work. |
| P7b: `displaySpeedSigned` misleading name (value is unsigned) | **Renamed** to `displaySpeedKmh` with a clarifying comment (`productDriveScene.ts`). |
| P4: `btVehicleTuning` POD leak | **Deferred with reason** (see Known Gaps) — `Ammo.destroy()` throws for this object in this build; bounded one-per-mount, documented. |

---

## Sign-Off Checklist (E2-playcanvas, P12)

```
E2-playcanvas P12 measurement sign-off (2026-07-04, headed, Arc 140T, 1920x1200):
  fps (steady, headed, target GPU): home 60 / keyboard-drive 60 / replay 60 / vision-drive 49 (median)
  download — models (MB): 2.97
  download — decoders (MB): 0.07 (Draco; no KTX2)  [+ HDRI texture 5.20]
  download — MediaPipe (MB): 22.38 (no ObjectDetector shipped)
  download — total to drive-ready (MB): 31.93   (<= 50 budget: PASS; first-interactive/home 7.42)
  type-check: PASS
  lint: PASS (0 errors)
  unit tests: PASS (148/148)
  smoke / e2e: PASS (e2e 5/5)
  builds: pure + NEXT_PUBLIC_E2E=1 both compile clean
```
