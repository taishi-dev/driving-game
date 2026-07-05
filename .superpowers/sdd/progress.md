# E3-cocos full-port — SDD progress ledger

Plan: docs/superpowers/plans/2026-07-04-e3-cocos-full-port.md (FEASIBILITY-GATED)
Branch: E3-cocos/feature/full-port (worktree .worktrees/E3-cocos, cut from foundation 5aeffac)
Reference candidates: E1-babylon COMPLETE (038b1a1), E2-playcanvas COMPLETE (eccee30). D1.a: no engine-code sharing across branches.

C0 (GATE): EARLY-EXIT — code-first Cocos port infeasible. 2026-07-04.
  Report: .superpowers/sdd/c0-feasibility-report.md ; checklist E3 verdict section filled.
  Blocker 1: no runnable Cocos 3.8 web runtime distributed code-first (cc=C++ linter; cocos-js/@cocos-creator-3d 404; @cocos/creator-types = types-only, 644 .d.ts/0 engine .js). Engine README: "not to be used independently"; build bootstrap (settings.json/bundle config/MD5) is editor-generated.
  Blocker 2 (independent): no runtime GLB/glTF loading — editor import only (Issue #16531).
  License: non-game/training-sim use may need written authorization + fees.
  No C1+ work. Branch ends as a valid documented trial datum. No engine code compiled (nothing to install/embed).

- Task C0: COMPLETE — VERDICT: EARLY-EXIT, upheld by adversarial verification (commits 09491de + corrections). Decisive blocker: no runtime glTF/GLB loading in Cocos (editor import-time conversion only; cocos-engine #16531 open, no commitment; only community loader abandoned 2019) — architecturally incompatible with the trial's runtime public/models3d pipeline. Secondary: no drop-in npm/CDN engine runtime (self-build via official @cocos/ccbuild possible but moot); license risk (User Service Agreement: games-only free, non-game needs written authorization — live unresolved contradiction with the Creator License per Cocos forum). Verifier corrections absorbed (ccbuild + overrideSettings overstatements). One-time editor-export hybrid steel-manned and rejected: violates the gate, cannot hit parity, strictly more effort than E1/E2.
- BRANCH STATUS: E3 ENDS HERE as a documented trial datum. Not eligible for Phase C comparison items.
