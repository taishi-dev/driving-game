# ADR 0003 — Replace Three.js/React Three Fiber via Three-Engine Full-Port Trial

**Status:** Accepted  
**Date:** 2026-06-30  
**Author:** taishi  
**Branch:** `engine-trial/foundation` (not yet merged to `main`)  
**Will be updated by:** Phase C (C5) with the chosen engine and measured basis

---

## Context

The current Virtual Driving School renders in Three.js / React Three Fiber (R3F). The
visual baseline is primitive geometry: box shapes for buildings, basic mesh cars, no
PBR materials, no HDR lighting. User-visible symptoms are a flat and unconvincing scene
that undermines the credibility of a driving instruction product.

The immediate goal is hero-car realism: showroom-quality PBR + clearcoat car paint +
HDR image-based lighting + ACES tone mapping, in a high-quality cohesive world. Three.js
can, in principle, reach this quality — third-party showcase sites demonstrate it. The
question is whether doing so inside the existing R3F codebase is the cheapest path, or
whether switching to a purpose-built game engine is better.

Three candidate engines were identified through documented research
(`docs/superpowers/research/2026-06-30-engine-trial-research.md`):

- **Babylon.js** — Apache-2.0; WebGPU production-ready; native clearcoat; Draco/meshopt/KTX2 all supported.
- **PlayCanvas** — MIT; React wrapper available; official btRaycastVehicle tutorial; no meshopt support.
- **Cocos Creator 3.8** — MIT runtime; PBR + HDR IBL; no clearcoat (custom Surface Shader needed); no documented KTX2/Draco.

Each engine has a full game-loop, vehicle physics, scene graph, and asset pipeline
built in. R3F is a thin React wrapper over Three.js with no vehicle physics and relies
on community packages for advanced features.

---

## Decision

**Run a three-engine full-port trial.** Port the entire product (all nine lessons,
checkpoints, HUD, i18n, Firebase auth+history, webcam foot/hand control, replay/ghost)
into each of Babylon.js, PlayCanvas, and Cocos Creator on separate git branches/worktrees
branching from `engine-trial/foundation`. Measure fps at 1920×1200 on the target hardware
(Intel Core Ultra 7 255H, Intel Arc 140T) and record download size to first interactive.
Then pick the winner by driven judgment informed by the measured metrics.

Only the winning engine's branch is finished and merged to `main`. The two losing branches
are closed. The existing R3F app on `main` (V1/V2/V3) is not touched.

**Base branch (`engine-trial/foundation`) contains:**
- Compressed CC-BY/CC0 hero car (`public/models3d/CarConcept-draco*.glb`)
- Verified-license PBR textures and HDRI in `assets/source/`
- `npm run assets:build` compression pipeline (`@gltf-transform/cli`, MIT)
- Feature-and-comparison checklist (`docs/superpowers/specs/2026-06-30-engine-trial-checklist.md`)

---

## Alternatives Considered

### A. Stay in R3F and rebuild the visuals

Rebuild the existing R3F scene to showroom quality: add Drei's `<Environment>` for HDRI
IBL, `<MeshPhysicalMaterial>` for clearcoat car paint, custom GLSL for transmission
glass, and a quality world model.

**Why not chosen:** Reference sites (Three.js showcase) confirm this quality level is
reachable in Three.js. However, the existing codebase would need the vehicle physics,
scene graph, and asset pipeline rebuilt from scratch — essentially the same effort as the
port — with no built-in vehicle controller, no production-ready WebGPU path, and a
community-maintained ecosystem. The effort is roughly comparable to a single-engine port,
but gains a less capable platform than the dedicated engines.

**Falsification condition:** If a properly rebuilt R3F scene on top of the existing
codebase demonstrably reached showroom visual quality, steady 60 fps at 1920×1200, and
full feature parity in less time than the winning engine port took — the three-engine
trial was the wrong call. The reference sites prove the visual quality is achievable; the
open question is the cost/time differential.

### B. Single-engine port (pick one engine, skip the trial)

Choose one engine without comparison and port to it.

**Why not chosen:** The three engines differ materially on vehicle physics availability,
clearcoat support, KTX2 support, and React/Next.js integration model. Picking one without
measurement creates risk of choosing wrong. The trial cost (three full ports) is accepted
as worthwhile given the long-term commitment — the engine choice is essentially
irreversible without another full port.

### C. Evaluation slice, then full port

Build only a small prototype (hero-car render, drivable car, one lesson) per engine,
measure, then do one full port of the winner.

**Why not chosen:** A slice that omits webcam control, replay, Firebase, i18n, or the
lesson/scoring pipeline may not predict the full-port cost. A full port catches
integration problems that a slice misses. The user explicitly chose full-port parity
(plan §11.A, D1 decision 2026-06-30).

**Note:** A 1–2 day spike gate is still run before each full port (plan Revision 2, §8)
to catch the known risks early (E1: no official vehicle controller; E3: no clearcoat,
uncertain KTX2, licensing ambiguity).

---

## Trade-offs Accepted

| Trade-off | Accepted because |
|---|---|
| Three full ports is a large time investment | Only the winner ships; the comparison is worth the cost given the irreversibility of the engine choice |
| Pure logic (scoring, replay, physics) is built three times and can drift | Each branch authors its own equivalent unit tests (7 suites); drift is caught by test failures, not by shared code |
| Comparison fairness: each engine's vehicle feel will differ | Vehicle physics is intentionally engine-native (§9.B); C3 records engine capability gaps (vehicle controller, clearcoat, compression, UI model) as explicit line items beside driven judgment |
| Cocos licensing risk (training simulator vs. game classification) | Accepted as a game under Cocos free terms; risk noted (plan §149) |
| No Three.js/R3F control branch | D2 decision: R3F remains only on V1/V2/V3; not entered as a control |

---

## Falsification Condition

This decision should be revisited if any of the following become true before Phase C
concludes:

1. A properly rebuilt R3F scene reaches showroom visual quality, 60 fps at 1920×1200,
   and full product feature parity, in materially less time than the winning engine port.
2. The target hardware (Intel Arc 140T) is replaced with a device where WebGPU or a
   specific engine's GPU backend makes a different engine the obvious winner.
3. Cocos licensing (training-simulator classification) is challenged and cannot be resolved
   as a game under the free Cocos terms, blocking E3 from shipping.

---

## Consequences

- Three worktrees branch from `engine-trial/foundation`: `E1-babylon`, `E2-playcanvas`, `E3-cocos`.
- Each runs tasks B1–B12 from the plan template, expanded into TDD-sized steps in a per-branch sub-plan.
- Phase C measures and decides the winner.
- Only the winning branch is merged to `main` (via PR to the taishi-dev/driving-game fork, per project convention).
- This ADR is updated in Phase C (C5) with the chosen engine and the measured basis for the choice.
