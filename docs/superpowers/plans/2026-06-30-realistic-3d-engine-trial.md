# Realistic 3D World: Three-Engine Full-Port Trial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan phase-by-phase. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the current primitive-geometry 3D world with a realistic one, and choose the rendering engine by fully porting the product into three engines on separate branches, then comparing them.

**Architecture:** A shared foundation branch prepares engine-neutral assets, a compression pipeline, and a fixed feature and comparison checklist. Three worktrees branch from it (E1-babylon, E2-playcanvas, E3-cocos). Each reimplements the entire product in its engine, using each engine's own vehicle physics, targeting hero-car realism with a static hero-shot home screen. A hybrid decision (measured fps and download size plus driven judgment) picks the winner; only the winner is finished into the product.

**Tech Stack:** Next.js 16 host; per branch one of Babylon.js (Apache-2.0), PlayCanvas (MIT), Cocos Creator 3.8 (MIT runtime); glTF assets; Draco / meshopt / KTX2 compression via gltf-transform / gltfpack; Poly Haven (CC0) HDRIs; ambientCG (CC0) textures.

**Cited research:** all external claims and their source URLs are in `docs/superpowers/research/2026-06-30-engine-trial-research.md`. This plan references that document rather than repeating every URL.

## Global Constraints

- Target device: Intel Core Ultra 7 255H, Intel Arc 140T integrated GPU, 1920x1200. Pass line: steady 60 fps at 1920x1200 on this machine.
- Download budget: <= ~50 MB to first interactive scene (RESOLVED by user, 2026-06-30). Consequence: at 50 MB all three engines likely clear the ceiling, so download size is a weak discriminator in the 12.C decision; weight measured fps and driven look/feel more heavily.
- Visual target: hero-car realism (6.A). The car reaches showroom quality (PBR + clearcoat + HDR image-based lighting + ACES tone mapping); the world is high quality and cohesive but optimized for real-time.
- Feel: each engine uses its OWN built-in vehicle physics (9.B). Feel will differ per engine and is tuned per branch.
- Scope per engine: full parity (11.A) — the realistic world, all nine lessons and checkpoints, HUD, Japanese/English internationalization, Firebase auth + history, webcam foot/hand control, replay/ghost, static hero-shot home (10.A).
- Existing Three.js / React Three Fiber work on V1/V2/V3 is NOT touched by this plan.
- Assets used in the public repo and web build must be redistributable (CC0 preferred; CC-BY only with attribution recorded).
- No claim about an engine API, asset license, or file path enters an implementation step until verified (research doc URL for external; file read for codebase).

## Proposed Architecture Decision Record

Create `docs/adr/0003-replace-renderer-via-three-engine-trial.md` capturing: the decision to replace Three.js/React Three Fiber with a new engine chosen through a three-engine full-port trial; the alternatives (stay in R3F and rebuild visuals, single-engine port, evaluation-slice-then-port); the trade-off accepted (three full ports is large; only the winner ships); and the falsification condition (a properly rebuilt Three.js scene, as the reference sites prove possible, could reach the same quality at lower cost). This qualifies for an ADR: hard to reverse, surprising without context, real trade-off.

---

## Phase A — Shared foundation branch (`engine-trial/foundation` off `main`)

Deliverable: a curated, compressed, engine-neutral asset set; a repeatable compression command; a written feature-and-comparison checklist; and a small fps/download measurement method that every engine branch will reuse.

### Task A1: Branch + asset license ledger

- [ ] Create branch `engine-trial/foundation` from `main`.
- [ ] Create `assets/CREDITS.md` recording each sourced asset, its URL, and its license (CC0 or CC-BY with required attribution). Seed it with the Poly Haven, ambientCG, and Khronos car sources from the research doc.
- [ ] Commit.

### Task A2: Curate the engine-neutral asset set

- [ ] Hero car = **Khronos CarConcept (CC-BY 4.0)** (RESOLVED, user 2026-06-30). Fetch from the Khronos glTF Sample Assets repo; record the required attribution (Eric Chadwick; Darmstadt Graphics Group) in `assets/CREDITS.md`. Do NOT ship the existing `gtrrsas.glb` as the hero car: it is 72.3 MB and has no recorded license/provenance in the repo, so a branded GT-R model is a redistribution/trademark risk in a public repo. (ToyCar CC0 may be kept only as a lightweight compression-test asset.)
- [ ] Download one outdoor HDRI from Poly Haven (CC0) for image-based lighting; store source EXR/HDR under `assets/source/` (not shipped) and note it in CREDITS.
- [ ] Gather CC0 PBR ground/road and building textures from ambientCG / Poly Haven into `assets/source/`.
- [ ] Assemble a minimal world kit (road segment, a few building shells, water plane for the "pool", curbs, props) as glTF, reusing `public/models/city.glb` where its quality and license allow.
- [ ] Commit source assets under `assets/source/` (git-ignored from the shipped build; kept for reproducibility) and record sizes.

### Task A3: Compression pipeline to the download budget

- [ ] Add `gltf-transform` (MIT, https://gltf-transform.dev/) as a dev dependency and a script `npm run assets:build` that produces shipped assets under `public/models3d/`.
- [ ] For the meshopt-compatible engines, produce a Draco-and-meshopt + KTX2 variant; for PlayCanvas produce a Draco + Basis variant (meshopt is NOT supported in PlayCanvas — research [C-meshopt]). Keep per-engine output folders if a single encoding cannot serve all three.
- [ ] Verify each shipped car+world set is within the <= ~50 MB interactive budget; record measured sizes in `assets/CREDITS.md`.
- [ ] Commit the pipeline and the compressed outputs.

### Task A4: Feature-and-comparison checklist + measurement method

- [ ] Write `docs/superpowers/specs/2026-06-30-engine-trial-checklist.md`: the exact feature list each branch must reach (world, hero car with PBR+clearcoat+HDR IBL, static hero-shot home, all nine lessons + checkpoints, HUD, i18n, Firebase auth+history, webcam control, replay/ghost, 60 fps at 1920x1200, recorded download size).
- [ ] Define the measurement method: an on-screen fps readout (each engine's own stats overlay — Babylon SceneOptimizer/inspector, PlayCanvas MiniStats, Cocos profiler) and how download size is recorded (built asset bytes to first interactive).
- [ ] Commit.

### Task A5: ADR

- [ ] Write the ADR described above.
- [ ] Commit. Do NOT merge to `main`; keep `engine-trial/foundation` as the base the three worktrees branch from. Only the winning engine merges to `main` (Phase C).

**Phase A verification:** `npm run assets:build` produces assets within budget; checklist and ADR exist; CREDITS lists every asset with a redistributable license.

---

## Phase B — Per-engine full port (one worktree per engine)

Applied identically to three branches so the comparison is fair. Branch/worktree names: `E1-babylon`, `E2-playcanvas`, `E3-cocos`, each cut from the Phase A base. Build order within each branch is the same task sequence B1..B12 below. Per-engine deltas are listed after the template.

Because a full game port cannot be specified line-by-line up front, each branch gets its own detailed sub-plan (written with superpowers:writing-plans) when its turn begins, expanding B1..B12 into TDD-sized steps against the engine's cited docs. This mirrors how the V1/V2/V3 variants were planned per branch.

Task template (each is a reviewable deliverable ending in a commit):
- [ ] **B1 Scaffold:** stand up the engine in the Next.js host (or its own web build for Cocos), a canvas, render loop, resize handling, and the fps overlay from A4.
- [ ] **B2 Environment + camera:** load the Poly Haven HDRI as image-based lighting, ACES tone mapping, sRGB output, soft shadows, and the floor-clamped hero camera (static hero shot, no auto-rotation — 10.A).
- [ ] **B3 Hero car material:** load the compressed hero car; apply PBR metallic-roughness + clearcoat car paint + transmission glass to reach the showroom bar (technique stack, research section 1).
- [ ] **B4 Vehicle physics:** stand up the engine's vehicle model and tune it to a good driving feel (9.B). PlayCanvas: official btRaycastVehicle tutorial [C-veh]. Babylon and Cocos: hand-built wheel/suspension model (no official controller — [B-veh][D-veh]).
- [ ] **B5 Drivable world:** roads, buildings, water/pool, curbs, props from the Phase A world kit; collision surfaces; off-track detection.
- [ ] **B6 Controls:** keyboard drive (throttle/brake/steer) and camera follow, matching current controls.
- [ ] **B7 Lessons + checkpoints:** port all nine lessons, briefings, stop/mirror checkpoints, and free mode.
- [ ] **B8 HUD:** speed/gear/throttle readout and the feedback/warning overlays.
- [ ] **B9 Internationalization:** Japanese/English parity for all UI text.
- [ ] **B10 Firebase:** auth + history (fail-soft to guest), reusing the Firebase web SDK.
- [ ] **B11 Webcam control + replay:** MediaPipe foot/hand input feeding the drive inputs; replay/ghost recording and playback.
- [ ] **B12 Performance pass + measurement:** tune to 60 fps at 1920x1200 (SceneOptimizer/HardwareScaling for Babylon [B-opt]; draw-call batching + DPR scaling + texture compression for PlayCanvas [C-opt]; Cocos equivalents), then record fps and download size against the A4 checklist.

Per-engine deltas and risks (from research):
- **E1-babylon:** clearcoat native [B-cc]; all compressions supported [B-gltf][B-ktx2]; WebGPU production [B-webgpu]. RISK: no official vehicle controller — B4 is hand-built or the unmaintained community Havok raycast port [B-veh].
- **E2-playcanvas:** official raycast-vehicle tutorial makes B4 lowest-risk [C-veh]; official React wrapper eases B1/B8/B9 [C-react]. RISK: meshopt unsupported — assets must use Draco (+Basis) for this branch [C-meshopt]; IBL prefilter must be done offline in A3 [C-ibl].
- **E3-cocos:** PBR + HDR IBL + reflection probes exist [D-ibl]. RISKS: no clearcoat (custom Surface Shader for B3) [D-cc]; no KTX2/Draco documented, so B12 download budget is hardest [D-ktx2]; no built-in vehicle (B4 fully custom) [D-veh]; HTML/React overlay for HUD/menus is undocumented, so B8/B9 need a Cocos-native UI approach [D-embed]; LICENSE risk for a training-sim product must be cleared before starting (see Open Decisions) [D-lic].

**Phase B verification per branch:** the A4 checklist fully met; 60 fps at 1920x1200 on the target machine; download size recorded; build/type-check/lint clean; a driven smoke test of a lesson.

---

## Phase C — Measure, compare, decide, finish

- [ ] **C1:** Run each finished branch on the target machine; record measured fps and download size (the objective half of 12.C).
- [ ] **C2:** Drive each branch and record subjective look/feel notes (the subjective half of 12.C).
- [ ] **C3:** Present the measured metrics beside the driven judgment; you pick the winner.
- [ ] **C4:** On the winning branch, run superpowers:finishing-a-development-branch (PR to the fork per the project convention). Close the losing branches' PRs and remove their worktrees.
- [ ] **C5:** Update the ADR with the chosen engine and the measured basis for the choice.

---

## Open Decisions — ALL RESOLVED (authoritative record is 'Remaining open items (status)' below; this list is historical)

1. Download budget: RESOLVED = ~50 MB to interactive (user, 2026-06-30).
2. Hero car asset: compress the existing 72.3 MB `gtrrsas.glb`, or use a fresh CC0/CC-BY car (ToyCar CC0 / CarConcept CC-BY). Licensing and quality trade-off.
3. Cocos licensing: confirm whether a "virtual driving school" is acceptable under the Cocos agreement's non-game/training-simulator terms before committing the E3 port [D-lic].
4. Base branch: RESOLVED = foundation stays unmerged; engines branch from it; only winner merges to main (user, 2026-06-30).

## Notes on granularity

This is a program-level plan: Phase A is specified to concrete tasks and commands; Phase B is a fair, fixed task template because three full game ports cannot be authored line-by-line in advance. Each engine branch will receive its own detailed, TDD-sized sub-plan (via superpowers:writing-plans) when its turn begins, expanding B1..B12 against that engine's cited documentation.

---

## Revision 2 — incorporating QA + Architecture review (2026-06-30)

Both reviews (full text in `scratchpad/qa-review.md`, `scratchpad/arch-review.md`) verified the program structure and research but found the per-engine template incomplete and the comparison at risk of being unfair. The items below are folded in. Two findings conflict with your locked Phase 0 choices and are raised as decisions (D1, D2) rather than applied.

### Baked in (do not conflict with your choices)

1. **Test discipline (was dropped).** Whatever logic each branch ends up with, it must keep the seven `node --test` suites (or their per-branch equivalents) green: `carPhysics`, `scoring`, `replay`, `checkpointEval`, `pedalDecision`, `steeringGear`, `footPedalRecognition`. Add this as a per-branch acceptance gate in B12.
2. **World coordinate + scoring contract (Critical, verified).** `course.ts` builds a `THREE.CurvePath` from fixed `Vector3` coordinates and `scoring.ts` grades `MISSION_CHECKPOINTS` against stored frame positions with `THREE.Vector3`. Each engine's world MUST preserve the same coordinate system, scale, and checkpoint positions, verified by a B5/B7 acceptance check that replays a known drive and reproduces the same score. (Note: mission data lives in `src/lib/mission/` and `scoring.ts`; there is no `missions.ts`.)
3. **Missing subsystems added to the Phase B template:**
   - B5 world must include the traffic/pedestrian/bicycle/crossing actors (`TrafficSystem.tsx`, `objects/*`) and traffic-light signal cycling, which feeds a scoring path.
   - New B5b: rearview mirror (`RearviewMirror.tsx`) is a render-to-texture second-camera pass — a real per-frame cost (count it in B12) and load-bearing for graded mirror checkpoints.
   - B4/B6 must include reverse gear (store gear P/D/R set from webcam hand pose) and the keyboard pedal-mode fallback, not only throttle/brake/steer.
   - B7 must include the tutorial flow (its own screen + scene); B8 must include the feedback / replay-review screen and scoring display.
4. **Home screen is a deviation, not parity.** The current home renders a live 3D `GarageScene`; the static hero shot (10.A) is an intentional behavior change. Label it as such in the checklist.
5. **Budget accounting.** The <=50 MB interactive budget must also count the MediaPipe vision WASM + model files and the Draco/KTX2 decoder payloads, not only meshes/textures. Record them separately in A3/B12.
6. **Measurement is headed, real-GPU.** The fps gate must be measured in a real browser on the target GPU, not headless (headless renders no shadows on this project — see the project's own notes). Define "first interactive" precisely and script the download-size capture.
7. **Cocos gets its own task template.** Cocos builds its own web bundle with engine-native UI and no React/Next host, so B1..B12 (which assume the Next.js host) do not apply unchanged; E3 needs a Cocos-specific template covering its build, embedding, and native UI for HUD/menus/i18n.
8. **Per-branch spike gate (cheap de-risk before each full port).** Before committing B1..B12 on a branch, run a 1–2 day spike proving the branch's known risks: for E3-cocos, the license question (D-lic) AND a clearcoat car-paint shader AND a drivable vehicle; for E1-babylon, a drivable vehicle (no official controller). A branch that fails its spike is reconsidered before the full port.
9. **i18n reality (corrected).** i18n is hand-rolled (no library): bilingual conditionals in ~4 files and bilingual object literals in ~2 files, ~14 files touching language total. Smaller than the review's "143/28" estimate, but still a per-branch rebuild with no shared string table today.

### Decisions (RESOLVED by user, 2026-06-30)

- **D1 = (a). Full rewrite per engine, no shared core.** Each engine branch rewrites even the renderer-independent logic (input/vision, Firebase, replay, scoring/course/store) in its own codebase; nothing is extracted to a shared module. Consequence accepted: the pure logic is built three times and can drift, and the seven `node --test` suites do not carry over as-is. Each branch must therefore author its OWN equivalent tests for the rewritten logic (same behavior: scoring, checkpoint eval, replay interpolation, pedal decision, steering gear, foot-pedal recognition, physics), and those must be green at B12. The reviewers' effort-tripling and comparison-fairness concerns are accepted, not mitigated; to limit fairness bias, C3 must record each engine's capability gaps (vehicle controller, clearcoat, compression, UI model) as explicit line items beside the driven judgment.
- **D2 = (a). No Three.js/R3F control branch.** The trial is the three new engines only (Babylon, PlayCanvas, Cocos), as chosen in Q1/Q3. The existing R3F app remains only on V1/V2/V3 and is not entered as a control.

### Remaining open items (status)

- Cocos licensing: **RESOLVED = proceed as a game, accept the interpretation risk** (user, 2026-06-30). No authorization will be sought; the app is classified as a driving game under the free game-development terms. Risk accepted and recorded here.
- Download budget: RESOLVED = ~50 MB to first interactive (user, 2026-06-30).
- Hero-car asset: RESOLVED = Khronos CarConcept (CC-BY 4.0), attribution recorded (user, 2026-06-30).
- Base branch: RESOLVED = keep `engine-trial/foundation` unmerged; branch E1/E2/E3 from it; only the winner merges to main (user, 2026-06-30).
