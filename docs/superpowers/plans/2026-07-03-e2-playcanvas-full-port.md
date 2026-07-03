# E2 · PlayCanvas Full Port — Implementation Sub-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. This expands Phase B of `docs/superpowers/plans/2026-06-30-realistic-3d-engine-trial.md` for the PlayCanvas branch, mirroring the E1-babylon sub-plan's task structure (P-numbers ≙ E1's B-numbers) so the two branches stay comparable. Parent plan and `docs/superpowers/research/2026-06-30-engine-trial-research.md` carry the cited sources; API citations here point to that research's `[C-*]` keys.

**Goal:** Rebuild the entire driving product in PlayCanvas on branch `E2-playcanvas/feature/full-port` (worktree `.worktrees/E2-playcanvas`, cut from the foundation at 5aeffac), with a showroom-grade hero car, the Quaternius drivable world, and full feature parity, at 60 fps on the Arc 140T at 1920x1200.

**Architecture:** PlayCanvas engine (npm `playcanvas`, code-first standalone [C-standalone]) replaces Three.js/R3F inside the existing Next.js app, mounted via the same client-component + effect pattern E1 used (NOT `@playcanvas/react` — plain engine keeps the mount pattern comparable across branches and avoids a wrapper variable). Physics = Ammo.js (Bullet) loaded per [C-phys], vehicle = the OFFICIAL `btRaycastVehicle` pattern [C-veh] — expected to be materially less effort than E1's hand-built vehicle; record actual effort for the comparison. Per D1.a, engine-coupled logic is rewritten for this branch with its own `node --test` suites; the engine-agnostic pure core in-tree (course.ts, scoring.ts, missions.ts, checkpointEval.ts, replay.ts, store.ts, lib/vision/*, firebase.ts) is FROZEN and reused verbatim (same adjudication as E1 — recorded in the E1 ledger; guarantees the QA-critical identical-scoring contract).

**Tech stack (verified, cited):** `playcanvas` (MIT [C-lic]); Ammo WASM via the engine's physics loading [C-phys]; glTF Draco [C-draco] (our GLBs are Draco + WebP — WebP decodes natively; meshopt is NOT supported [C-meshopt], we don't use it); HDR IBL prefiltered OFFLINE [C-ibl].

## Global Constraints (identical to E1 — the comparison depends on it)

- 60 fps at 1920x1200 on Arc 140T (headed, real-GPU measurement — never headless/SwiftShader).
- ≤ ~50 MB to first interactive (car+world ~20 MB + Draco decoder + Ammo WASM + MediaPipe). Record measured totals at P12 in the A4 checklist beside E1's numbers.
- Hero-car realism: PBR + clearcoat + HDR IBL + tone mapping. **P3 opens by VERIFYING clearcoat exists on StandardMaterial (research FLAG [C-pbr]); if absent, document the best achievable fallback (e.g. dual-layer material trick) as an E2 capability gap in the checklist — do not silently ship flat paint.**
- Home = SELF-BUILT showroom (ground + backdrop + HDRI reflections + static camera, no auto-rotation).
- Coordinate/scoring contract: X=right, −Z=forward, Y=up, surface Y=0; same course.ts coordinates, checkpoint positions, and scoring so a known replay reproduces the same score (QA-critical). Frozen modules are never edited; engine-side layout math gets its own pure module + tests (E1 precedent: driveLayout.ts).
- Test discipline (D1.a): rewritten engine-coupled pure logic ships `node --test` suites; keep the same data-testids as E1 so the Playwright e2e drivers stay comparable (porting/adapting the e2e SPEC files is allowed — they are harness, not product).
- Assets: only license-verified `public/models3d/**` and `assets/source/**`. No legacy `public/models/*`.

## Hard-won E1 lessons that BIND this branch's execution (controller enforces in every brief)

- Headless GPU = SwiftShader: renders differently and runs MediaPipe at ~1 fps — ALL visual/perf verification headed at 1920x1200; e2e real-time drives are headed-only (CI-gate them), teleport-aided variants for headless CI.
- React strict-mode double-mounts every effect: every scene/camera/listener/stream needs a `disposed`-guard teardown; physics worlds must be created fresh per scene mount (E1's Havok bug — verify Ammo has no analogous global-world reuse pitfall EARLY, in P4).
- Never foreground-Bash >115s in subagents; poll background output files; never end a turn waiting.
- Turbopack PostCSS worker 0xc0000142 panic: delete `.next` and restart.
- `next dev` children orphan port 3000 — kill by PID.
- NEXT_PUBLIC_E2E=1 must be set at BUILD time for `__drivingStore`; debug hooks gated by that flag + `?e2e` param (E1 convention).
- The physics dt-clamp (min(dt,1/30)) makes low-FPS sims run slower than wall clock — scoring must stay wall-clock-based (it is; verify unchanged).
- Vision layer: MediaPipe is the FPS bottleneck (E1: 29fps median with 3 landmarkers); drop the object detector from the start (E1 deviation, already recorded — keep parity WITH E1's final state, not the original's debug extra).

## Tasks (each ends in a commit; SDD per-task briefs will scope exactly)

- [ ] **P1 Scaffold.** `playcanvas` dep; client component mounts pc.Application on a canvas with device setup, resize, strict-mode-safe destroy; fps readout; `/showroom` + `/drive` scaffold routes (same as E1 for comparability). Acceptance: clear-color canvas at 60 fps, no leaks on unmount; gates clean.
- [ ] **P2 Environment + showroom + camera.** Prefilter the foundation HDRI OFFLINE per [C-ibl] (document the tool/command; artifact into public/env/); skybox+IBL; tone mapping; self-built showroom (ground + curved backdrop) + static hero camera. Acceptance: lit reflective showroom, static, headed screenshot.
- [ ] **P3 Hero car material.** FIRST verify clearcoat on StandardMaterial [C-pbr FLAG]; then load `public/models3d/CarConcept-draco-webp.glb` via Draco loader [C-draco]; car-paint + glass to the showroom bar (or documented fallback). Acceptance: showroom-grade car under the HDRI, headed screenshot; clearcoat verdict recorded in checklist.
- [ ] **P4 Vehicle physics (official raycast vehicle on Ammo).** Load Ammo per [C-phys]; implement the official btRaycastVehicle pattern [C-veh]; tune to a good feel; verify per-scene physics-world lifecycle under strict-mode BEFORE building on it. Acceptance: drives/turns/brakes/settles; feel notes + effort-vs-E1 note recorded.
- [ ] **P5 Drivable world (Quaternius) + coordinate contract.** Same layout as E1 (straight Z +24..−204 + turn stubs), instancing for repeated tiles, flat collider boxes as the wheel-ray/physics ground (E1 lesson: don't ray the crowned visual tiles), off-track detection; own pure layout module + tests deriving the contract from placement constants (checkpoint (0,0,−90) in-strip). Acceptance: headed screenshot of continuous textured road; contract test green.
- [ ] **P5b Rearview mirror.** RenderTarget + rear camera onto a screen-space mirror element (framed), horizontally flipped; `mirror.setActive/isActive` hook. Acceptance: live rear view while driving; 60 fps with mirror on at 1920x1200.
- [ ] **P6 Controls + reverse gear.** Reuse E1's pure `driveControls` CONTRACT (rewrite the module per D1.a; same keys W/S/A/D+arrows, gears 1/2/3=P/D/R, ±0.6 keyboard steer, signed throttle). Acceptance: scripted evidence D→−Z, R→+Z, P holds, brake stops; speed capped ~59 km/h like E1 (feel parity target).
- [ ] **P7 Product shell + grading** (split like E1: P7a shell — store-driven screens, home + showroom hero + lesson select + briefing, store-wired drive canvas, free mode; P7b grading — missionGrading-equivalent runtime feeding frozen checkMissionGoal/evaluateCheckpoint/calculateMissionScore, feedback screen with original score formula, DOM tutorial ja/en). Acceptance: straight lesson start→goal→feedback 100/100 headed; 8-lesson goal sweep; tutorial runs.
- [ ] **P8 HUD + feedback/replay-review.** Product HUD (speed/gear/throttle/brake/steer ±1.0 display scale — E1 final convention), off-track overlay, replay playback scene via frozen replay.ts (kinematic car, chase/driver). Acceptance: HUD live; replay plays a recorded run.
- [ ] **P9 Internationalization.** Full ja/en parity; reuse the STRINGS content decisions E1 settled (uiStrings pattern, へ/に per-screen, 信号機, technical tokens English) — rewrite the module per D1.a. Acceptance: every screen both languages, parity tests.
- [ ] **P10 Firebase.** Auth + history fail-soft, identical mission_logs record + query as E1/original. Acceptance: guest path bulletproof with zero config; record byte-compat pinned by test.
- [ ] **P11 Webcam control + pedal fallback.** VisionController equivalent feeding the frozen vision pure modules; keyboard fallback semantics identical to E1 (nothing detected → setSteering(0), no pedal writes uncalibrated); no object detector. Acceptance: fake-webcam e2e (headed) + camera-denied e2e (headless) green; keyboard drives to 100/100 with vision running.
- [ ] **P12 Performance pass + measurement + tests.** Production build; headed 1920x1200 measurements (home/drive/vision-drive/replay fps + true download); tune; fill the E2 column of `docs/superpowers/specs/2026-06-30-engine-trial-checklist.md` beside E1's numbers; all suites green. Acceptance: honest recorded numbers; gates clean.

## Verification (branch complete)
- A4 checklist E2 section filled beside E1; 60 fps (or honest recorded misses); download ≤50 MB; coordinate-contract + replay-score reproduction; all tests green; final whole-branch review.

## Notes
E1's biggest risk (hand-built vehicle) is expected to be E2's smallest (official tutorial); E2's distinct risks are the FLAGged clearcoat, offline IBL prefiltering, and Ammo WASM lifecycle under strict-mode. Record actual effort per task for the trial's effort comparison.
