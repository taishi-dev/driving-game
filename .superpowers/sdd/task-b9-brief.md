# Task B9 brief — Internationalization parity (ja/en)

Plan task (verbatim): **B9 Internationalization.** Japanese/English parity across all UI (rewritten in this branch per D1.a). Acceptance: language toggle switches all strings.

## Scope

Audit and fix ja/en parity across the ENTIRE Babylon product (`src/components/babylon/product/*` + any user-visible strings in `src/components/babylon/*` scenes, e.g. the drive key-hint): every user-visible string must switch with the store `language`, in both directions, on every screen (language picker, home, briefing, driving HUD + toasts + warnings, feedback incl. replay labels, tutorial, auth/history stubs).

Known specific defects to fix (from prior reviews — verify each and sweep for more):
1. Home course-card `desc`/`sub` strings are English-only (`lessonCatalog.ts` HOME_ENTRIES) — localize.
2. ja label drift: card says 信号 but briefing says 信号機 for traffic-light — unify (pick the one the ORIGINAL app used; check the original components for the canonical ja strings).
3. EN tutorial step 1 renders hardcoded Japanese commas (、) between phrases — punctuation must be per-language.
4. Language dropdown on home (verify it exists and switches everything live, matching original behavior).

Structural (in scope, keep pragmatic): the per-screen STRINGS blocks have drifted (3+ near-duplicates). Consolidate SHARED strings (e.g. backToHome, app title, lesson names already in lessonCatalog) into one pure module — do NOT build an i18n framework; a typed strings module in `src/lib/` following the lessonCatalog pattern is exactly right. Screen-specific strings may stay screen-local. New pure module gets `node --test` coverage for parity (e.g. every key exists in both ja and en — a completeness test).

Reference for canonical Japanese: the original app's components (`src/components/ui/*`, `ClientApp.tsx`) — the port should read naturally to a Japanese learner, matching the original's wording where the same UI exists.

## Global constraints
- Frozen modules untouched: course.ts, missions.ts, checkpointEval.ts, scoring.ts, replay.ts, store.ts contract. (checkpointEval emits user-visible checkpoint toast strings — those are frozen; do not fork them.)
- 126/126 tests must not regress; add the parity test(s).
- Preserve all prior invariants (mirror hook, loaders, Havok, strict-mode teardown, fail-soft Firebase).

## Verification loop
- Dev server ALREADY RUNNING on http://localhost:3000 (hot reload). No second `next dev`; no `npm run build`.
- NEVER issue a foreground Bash call >115s — split or poll the background output file.
- Headed Playwright (scripts in `.claude/skills/run-driving/shots/`): walk every screen in BOTH languages (seed localStorage.language, or toggle live on home) and screenshot each; READ the PNGs and confirm no residual wrong-language strings. Include: home, briefing (a lesson with checkpoints, e.g. left-turn), driving HUD, feedback after a completed run, tutorial steps, auth/history stubs.
- Gates: `npm run type-check`, `npm run lint`, `npm test`.

## Report contract
Write your full report to `.superpowers/sdd/task-b9-report.md` (defects found+fixed beyond the known four, consolidation decisions, screenshot paths per screen/language, gate outputs). Commit on the current branch. Return ONLY: status, commit sha(s), one-line test summary, concerns.
