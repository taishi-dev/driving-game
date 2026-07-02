# E1 · Babylon.js Full Port — Implementation Sub-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. This expands Phase B (B1..B12 + the Revision-2 additions) of `docs/superpowers/plans/2026-06-30-realistic-3d-engine-trial.md` for the Babylon.js branch. Parent plan and `docs/superpowers/research/2026-06-30-engine-trial-research.md` carry the cited sources; API citations here point to that research's `[B-*]` keys and Babylon doc URLs.

**Goal:** Rebuild the entire driving product in Babylon.js on branch `E1-babylon/feature/full-port` (worktree `.worktrees/E1-babylon`, cut from the foundation), with a showroom-grade hero car, a realistic drivable world from the Quaternius kit, and full feature parity, at 60 fps on the Arc 140T at 1920x1200.

**Architecture:** Babylon.js replaces Three.js/React Three Fiber as the renderer inside the existing Next.js app. Per decision D1.a, ALL logic is rewritten in this branch (no shared core); pure logic gets its own equivalent `node --test` suites. Physics uses Babylon's own engine (Havok); since Babylon has no official vehicle controller [B-veh], B4 hand-builds a raycast vehicle on Havok.

**Tech stack (verified, cited in research):** `@babylonjs/core`, `@babylonjs/loaders` (glTF + Draco), `@babylonjs/havok` (Apache-2.0 engine, MIT Havok WASM) [B-lic]. WebGL2 default [B-webgl2].

## Global Constraints

- 60 fps at 1920x1200 on Arc 140T (headed, real-GPU measurement — not headless).
- <= ~50 MB to first interactive, counting the car+world (~20 MB), the Draco decoder, and the MediaPipe WASM/model files. Record the measured total at B12.
- Hero-car realism: PBRMaterial + clearcoat + HDR IBL + ACES tone mapping (technique stack, research section 1; Babylon clearcoat [B-cc], IBL [B-ibl]).
- Home screen is a SELF-BUILT showroom (ground + backdrop + HDRI reflections + static camera, no auto-rotation), NOT the city kit.
- Feel: Babylon Havok vehicle (hand-built raycast vehicle), tuned on this branch; feel may differ from other engines by design (9.B).
- Coordinate/scoring contract: the world must preserve the same coordinate system, scale, and checkpoint positions as the current `course.ts`/`scoring.ts` so a known replay reproduces the same score (QA-critical).
- Test discipline (D1.a): rewritten pure logic (scoring, checkpoint eval, replay, pedal decision, steering gear, foot-pedal recognition, vehicle-feel invariants) must ship with equivalent `node --test` suites, green at B12.
- Assets: use only the foundation's license-verified assets under `public/models3d/` and `assets/source/`. No `public/models/*` legacy assets.

## Cited Babylon APIs used (from research `[B-*]`)

- Engine/React: `new Engine(canvas)`, `runRenderLoop`, `engine.resize()`, `engine.dispose()` in `useEffect` [B-react].
- IBL: `.env` (preconvolved) or `.hdr` to `scene.environmentTexture`; PBR picks it up [B-ibl].
- Car paint: `PBRMaterial` + `material.clearCoat.isEnabled/intensity/roughness` [B-cc].
- glTF + compression: `import "@babylonjs/loaders/glTF"`, `SceneLoader.AppendAsync`, `DracoDecoder`, `@babylonjs/ktx2decoder` [B-gltf][B-ktx2] (our GLBs are Draco + WebP; WebP decodes natively in-browser).
- Physics: Havok V2 rigid bodies [B-phys]; NO official vehicle → hand-built raycast vehicle (wheel raycasts + spring/damper suspension) [B-veh].
- Perf: `SceneOptimizer`, `HardwareScalingOptimization`, `mesh.createInstance()` / `thinInstance*` for the 153 modular world pieces, `material.freeze()`, `mesh.freezeWorldMatrix()`, `scene.freezeActiveMeshes()` [B-opt].

---

## Tasks

Each task is a reviewable deliverable ending in a commit. Within-task code is authored during execution against the cited docs. Order is dependency-driven.

- [ ] **B1 Scaffold.** Add Babylon deps; a client component mounts an Engine on a canvas with render loop, resize, dispose (useEffect) [B-react]; add an fps readout. Route the driving screen to the Babylon canvas. Acceptance: canvas renders a clear color at 60 fps, no leaks on unmount; build/type-check/lint clean.
- [ ] **B2 Environment + showroom + camera.** Convert the foundation HDRI to `.env`; set `scene.environmentTexture`; ACES tone mapping + sRGB; soft shadows. Build the self-built showroom home (ground + curved backdrop) and a static hero camera (no auto-rotation). Driving camera is a follow camera. Acceptance: home shows a lit reflective showroom, static; screenshot on real GPU.
- [ ] **B3 Hero car material.** Load `public/models3d/CarConcept-draco-webp.glb` via glTF+Draco loader; apply PBRMaterial clearcoat car paint + transmission glass to reach the showroom bar [B-cc]. Acceptance: car reads as showroom-grade under the HDRI.
- [ ] **B4 Vehicle physics (hand-built raycast vehicle on Havok).** Stand up Havok [B-phys]; implement a raycast-vehicle model (per-wheel downward raycast, spring/damper suspension force, drive/steer/brake forces, lateral grip) since there is no official controller [B-veh]; tune to a good driving feel. Acceptance: the car drives, turns, brakes, and settles on suspension; feel notes recorded.
- [ ] **B5 Drivable world (Quaternius) + coordinate contract.** Assemble the world from `public/models3d/world/quaternius/*.glb` using instancing/thin instances for repeated pieces [B-opt]; roads, buildings, water/pool, curbs, props; collision surfaces; off-track detection. Preserve the course coordinate system, scale, and checkpoint positions. Acceptance: a scripted known drive reproduces the same score as the current app (coordinate-contract check).
- [ ] **B5b Rearview mirror.** RenderTargetTexture with a rear-facing camera onto a mirror-plane material; count its per-frame cost in B12. Acceptance: mirror shows the scene behind; graded mirror checkpoints work.
- [ ] **B6 Controls + reverse gear.** Keyboard drive (throttle/brake/steer), reverse gear (P/D/R), and the follow camera. Acceptance: all inputs move the car correctly incl. reverse.
- [ ] **B7 Lessons + checkpoints + tutorial + free mode.** Port all nine lessons, briefings, stop/mirror checkpoints, the tutorial flow, and free mode. Acceptance: each lesson is completable and graded; tutorial runs.
- [ ] **B8 HUD + feedback/replay-review screens.** Speed/gear/throttle HUD, off-track/feedback overlays, and the feedback / replay-review screen with scoring display. Acceptance: HUD reads live state; review screen plays a recorded run.
- [ ] **B9 Internationalization.** Japanese/English parity across all UI (rewritten in this branch per D1.a). Acceptance: language toggle switches all strings.
- [ ] **B10 Firebase.** Auth + history, fail-soft to guest (missing config must not crash at import). Acceptance: guest mode works with no config; history persists when configured.
- [ ] **B11 Webcam control + replay + pedal fallback.** MediaPipe foot/hand input feeding throttle/brake/steer/gear; keyboard pedal-mode fallback; replay/ghost recording and timestamp-interpolated playback. Acceptance: webcam drives the car; keyboard fallback works; replay reproduces a run.
- [ ] **B12 Performance pass + measurement + tests.** Tune to 60 fps at 1920x1200 (SceneOptimizer/HardwareScaling, instancing, freezes) [B-opt]; record measured fps and the true download size (car+world+Draco decoder+MediaPipe). Ensure the rewritten pure-logic `node --test` suites are green (D1.a). Acceptance: 60 fps on the Arc 140T, size recorded against the A4 checklist, all tests green, build/type-check/lint clean.

## Verification (branch complete)

- The A4 checklist (`docs/superpowers/specs/2026-06-30-engine-trial-checklist.md`) fully met.
- 60 fps at 1920x1200 on the target machine (headed); download size recorded.
- Rewritten pure-logic test suites green; build, type-check, lint clean.
- Coordinate-contract check passes (known replay reproduces score).
- A driven smoke test of at least one lesson and the free mode.

## Notes

The single largest risk on this branch is B4 (hand-built raycast vehicle on Havok), because Babylon has no official vehicle controller [B-veh]; budget the most iteration there. B5's instancing of 153 modular pieces is the main perf lever for B12 [B-opt]. Each task will be dispatched to a fresh implementer with a task-scoped brief when executed.
