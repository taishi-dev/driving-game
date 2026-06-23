# Spec: Firestore Security-Rules Emulator Test + CI Job (driving)

**Date:** 2026-06-22
**Status:** Draft (awaiting review)
**Branch context:** to be created — `test/firestore-rules-emulator`

## Goal

Regression-guard the owner-isolation `mission_logs` security rules with an
automated, hermetic test suite that runs in CI. The rules are already authored,
deployed, and verified live in `driving-school-e862d` (positive + 9/9 deny paths,
see prior work), but that verification was a one-time manual probe. This spec adds
a **repeatable, offline test** so a future edit to `firestore.rules` that weakens
owner isolation fails the build instead of silently shipping.

## Project facts (verified 2026-06-22)

- `firestore.rules` = **owner-isolation only** on `match /mission_logs/{logId}`:
  - `read` (get + list): `auth != null && resource.data.userId == auth.uid`
  - `create`: `auth != null && request.resource.data.userId == auth.uid`
  - `delete`: `auth != null && resource.data.userId == auth.uid`
  - `update`: omitted → denied by default
  - All other paths: denied by default
  - No field-shape/type/size validation by design (`score` is client-trusted, ADR-0001).
- `firebase.json` currently has only a `firestore` block (`rules`, `indexes`). No
  `emulators` block yet.
- CI today (`.github/workflows/ci.yml`) = 3 jobs, all Node 24: `quality`
  (lint + type-check, Ubuntu), `build-smoke` (3-OS matrix), e2e (webcam-fallback).
  Dummy `NEXT_PUBLIC_FIREBASE_*` env. No Firebase secrets.
- Repo deps are deliberately lean — no vitest/jest. `package.json` has `deploy:rules`
  (pinned `npx firebase-tools@15.22.0`) and `test:e2e` scripts.
- Local dev machine (Windows) has **no JDK** installed; the Firestore emulator
  requires Java. This is why the original deny-path matrix was run via the live
  client SDK, not the emulator.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Test runner = **built-in `node:test` + `node:assert`**. Only new devDep = `@firebase/rules-unit-testing`. | Keeps the repo's lean-deps posture — no vitest/jest. `node:test` is already available on Node 24. |
| 2 | Approach = **`firebase emulators:exec` wraps `node --test`** (Approach A). | Hermetic and matches existing CI style (pinned `firebase-tools` via `npx`). The emulator boots, the test runs against it, the emulator tears down — one command. |
| 3 | Use a **`demo-` prefixed project id** (`demo-driving`). | The Firebase emulator treats `demo-*` projects as fully offline — no credentials, no network, no real project touched. |
| 4 | New **dedicated CI job** `rules` (not folded into an existing job). | It needs Java (setup-java); other jobs don't. Keeping it separate avoids slowing the matrix and surfaces rule failures distinctly. |
| 5 | Document the **JDK prerequisite** for local runs; do NOT auto-install Java. | The dev machine has no Java. CI provides Temurin via setup-java. Auto-installing a JDK on the user's machine is out of scope and intrusive. |
| 6 | Delivery = branch `test/firestore-rules-emulator` → PR to fork `main` (`taishi-dev/driving-game`). | Matches the established workflow for this repo. |

## Components

### 1. `tests/firestore-rules.test.mjs`

ESM, `node:test` + `node:assert`. Uses `@firebase/rules-unit-testing`:

- `initializeTestEnvironment({ projectId: 'demo-driving', firestore: { rules: <read firestore.rules> } })`.
- Seed: via `env.withSecurityRulesDisabled(...)`, write alice's `mission_logs` doc
  (`userId: 'alice'`, plus a representative `lesson`/`score`).
- Three authed contexts: `alice` (owner), `bob` (other user), and an
  unauthenticated context.
- `beforeEach`/`afterEach` (or per-file) clears Firestore between assertions where
  needed; `after` calls `env.cleanup()`.

**Assertion matrix** (mirrors the live-verified paths), using
`assertSucceeds` / `assertFails`:

| Case | Actor | Op | Expected |
|------|-------|----|----|
| Read own (get) | alice | get own doc | succeed |
| Read own (list) | alice | list where userId==alice | succeed |
| Read other (get) | bob | get alice's doc | fail |
| Read other (list) | bob | list where userId==alice | fail |
| Read unauth (get) | unauth | get alice's doc | fail |
| Read unauth (list) | unauth | list | fail |
| Create self | bob | create doc userId==bob | succeed |
| Create spoof | bob | create doc userId==alice | fail |
| Create unauth | unauth | create doc | fail |
| Update own | alice | update own doc | fail (update denied for all) |
| Delete own | alice | delete own doc | succeed |
| Delete other | bob | delete alice's doc | fail |

### 2. `firebase.json` — add `emulators` block

```jsonc
"emulators": {
  "firestore": { "port": 8080 },
  "ui": { "enabled": false }
}
```

Keep the existing `firestore` block unchanged.

### 3. `package.json` — devDep + script

- Add devDep: `@firebase/rules-unit-testing` (pin a current version at implementation time).
- Add script:
  ```
  "test:rules": "npx --yes firebase-tools@15.22.0 emulators:exec --only firestore --project demo-driving \"node --test tests/firestore-rules.test.mjs\""
  ```

### 4. `.github/workflows/ci.yml` — new `rules` job

- Runner: `ubuntu-latest`.
- `actions/setup-node@v4`: Node 24, `cache: npm`.
- `actions/setup-java@v4`: `distribution: temurin`, `java-version: 21`.
- `npm ci`.
- `npm run test:rules`.
- No Firebase env vars (emulator uses the `demo-` project, fully offline).
- Independent job (no `needs:`), consistent with the existing split topology.

## Data flow

```
npm run test:rules
  └─ firebase-tools emulators:exec --only firestore --project demo-driving
       ├─ boots Firestore emulator on :8080 (offline, demo project)
       ├─ runs: node --test tests/firestore-rules.test.mjs
       │     ├─ initializeTestEnvironment(rules = firestore.rules)
       │     ├─ seed alice's doc (rules disabled)
       │     ├─ run 12-case assert matrix (alice / bob / unauth)
       │     └─ env.cleanup()
       └─ tears down emulator; exit code = test exit code
```

## Error handling / failure modes

- **Rule weakened** (e.g. owner check removed): a deny-case assertion flips to
  succeed → `assertFails` throws → `node --test` exits non-zero → `emulators:exec`
  propagates it → CI job fails. This is the whole point.
- **No Java locally:** `emulators:exec` errors clearly that it can't start the
  emulator. Documented as a known local-DX limitation; CI is the source of truth.
- **Emulator port conflict (8080 in use):** rare locally; documented. CI runners
  are clean.

## Testing (of this test)

- The matrix is self-validating against the real `firestore.rules` file (it reads
  the actual rules, not a copy). To confirm the suite has teeth during
  implementation: temporarily weaken one rule, confirm the corresponding case
  fails, then revert.

## Out of scope (YAGNI)

- No field-shape/type/size validation tests (`score` is client-trusted by design,
  ADR-0001) — would test rules that intentionally don't exist.
- No vitest/jest, no coverage tooling.
- No auto-install of a JDK on the dev machine.
- No changes to the deployed rules or the live project.
