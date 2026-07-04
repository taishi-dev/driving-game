# E3 · Cocos Creator Full Port — Implementation Sub-Plan (feasibility-gated)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. This expands Phase B of `docs/superpowers/plans/2026-06-30-realistic-3d-engine-trial.md` for the Cocos branch. Unlike E1/E2, E3 is FEASIBILITY-GATED: the research (`docs/superpowers/research/2026-06-30-engine-trial-research.md`, [D-*] keys) flags Cocos Creator 3.8 as editor-centric ("Editor underpins build pipeline; CLI exists but editor required" [D-editor]; "React/HTML overlay integration not documented" [D-embed] FLAG; no documented clearcoat [D-cc]; glTF Draco not documented [D-gltf] FLAG; KTX2 not supported [D-ktx2]; no built-in vehicle [D-veh]). A DOCUMENTED EARLY EXIT with evidence is a legitimate trial outcome per the parent plan's honest-comparison mandate — better than a zombie port.

**Goal:** Either (a) rebuild the driving product in Cocos on branch `E3-cocos/feature/full-port` at parity with E1/E2, or (b) produce a rigorous, evidence-backed infeasibility record for the comparison checklist. C0 decides which.

## C0 — Feasibility spike (GATE; timebox ~1 focused implementer session)

Question: can the Cocos runtime power our EXISTING Next.js app code-first — no Cocos Creator editor in the build loop — at the fidelity the trial demands?

Success criteria (ALL must hold to proceed to C1+):
1. **Engine embed**: a Cocos 3.8.x runtime (npm `cc`/`cocos-js` engine build, or the open-source cocos-engine built for web) initializes on a canvas inside our Next.js 16 client component, renders a lit clear-color scene at 60fps headed, survives strict-mode double-mount, and disposes cleanly. No editor-generated project scaffolding required at build time.
2. **Asset path**: our license-verified GLBs (Draco+WebP: `public/models3d/CarConcept-draco-webp.glb`) load at RUNTIME from code. If Draco-in-glTF is genuinely unsupported [D-gltf FLAG], measure the non-Draco fallback size (re-encode without Draco) against the ≤50MB budget and record; if runtime glTF loading itself requires editor-preprocessed assets, that is a FAIL.
3. **PBR + IBL floor**: an HDR-lit PBR material renders (clearcoat may be absent [D-cc] — record; a custom surface shader is acceptable-in-principle but note the effort).
4. **Physics**: Bullet (default) or another supported backend instantiates code-first with a rigidbody + raycast available for a vehicle build.
5. **License check (documented, not adjudicated here)**: record the current runtime/editor license terms for our use case (the parent plan accepted the risk knowingly; C0 just refreshes the facts).

Deliverables either way: `.superpowers/sdd/c0-feasibility-report.md` + a checklist E3 section entry with the verdict and evidence (code, screenshots, errors). If ANY criterion fails after honest effort: STOP — write the infeasibility record (what was tried, exact blockers, what WOULD be required, e.g. editor-based asset pipeline), fill the checklist E3 section as an early exit, and the branch ends there as a valid trial datum.

## C1..C12 (only if C0 passes)

Mirror E2's task structure exactly (C-numbers ≙ P-numbers): C1 scaffold, C2 showroom+IBL, C3 hero car (clearcoat = custom shader effort, record), C4 vehicle (hand-built on Bullet — no official controller [D-veh]; E1's kernel/probe discipline applies: straight-line probe EARLY), C5 world+contract (own pure layout module + tests), C5b mirror RTT, C6 controls, C7 shell+grading (frozen modules verbatim; scores must reproduce E1/E2 exactly), C8 HUD+replay, C9 i18n (settled canon), C10 Firebase fail-soft, C11 vision, C12 measure+checklist+final review.

## Global constraints (identical to E1/E2)
60fps @1920x1200 Arc 140T headed; ≤50MB; frozen pure core untouched; coordinate/scoring contract; settled i18n canon; E1/E2 testid parity; strict-mode discipline; all the hard-won E1/E2 execution lessons (headed-GPU-only verification, no >115s foreground, poll-don't-wait, port hygiene, bringToFront before FPS sampling).

## Notes
E3's known-hardest aspects: engine embed (existential), clearcoat (custom shader), asset compression (no Draco/KTX2 documented), hand-built vehicle again. Record effort honestly — the comparison needs it.
