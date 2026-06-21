# Spec: CI Pipeline + Lint Cleanup (driving)

**Date:** 2026-06-20
**Status:** Draft (awaiting review)
**Branch context:** `improve/perf-playability`

## Goal

Stand up a GitHub Actions pipeline that verifies the driving app **builds and boots
across macOS, Linux, and Windows** on every push and PR, and enforces clean,
reviewable source via a hard lint gate. Despite the "CI/CD" framing, this is
**CI-only** — Vercel already handles deployment (see Decision 5).

## Project facts (verified 2026-06-20)

- Next.js **16.1.6** + React 19 browser app. Build output is **fully static** (`○`
  on `/`, `/_not-found`, `/debug`) — Node is the build *toolchain*, not a runtime.
- Deployed today on **Vercel** (`driving-silk.vercel.app`); repo is **public**
  (`Piyoone3939/driving`) → GitHub Actions minutes are **free/unlimited**.
- npm scripts today: `dev`, `build`, `start`, `lint` (`eslint`). No test suite. No
  `type-check` script. Has `package-lock.json`, `tsconfig.json`, `next.config.ts`.
- Firebase init is lazy/client-side; `build` and `start` work with **dummy**
  `NEXT_PUBLIC_FIREBASE_*` values (no real secrets needed).
- **Current check status (run locally):** `tsc --noEmit` ✅ passes · `next build` ✅
  passes · `eslint .` ❌ **fails** — 52 problems (27 errors, 25 warnings).
- Next 16 docs confirm: minimum Node **20.9**; all three OSes supported; and
  **`next build` no longer runs the linter** (so lint must be its own gate).

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Lint is a hard gate; fix the 27 errors first** (prerequisite, not `continue-on-error`). | Readable source for reviewers is the whole point of the gate. |
| 2 | Gate fails on **errors + unused-vars**; `exhaustive-deps` stays a non-blocking warning. | Kills the redundancy clutter without forcing risky dependency-array changes in the webcam/`requestAnimationFrame` loops. Implemented by promoting `@typescript-eslint/no-unused-vars` to **error** and running plain `eslint .` (no `--max-warnings 0`). |
| 3 | Triggers: **`push` (all branches) + `pull_request`**, with concurrency cancellation. | Honors "verify every push." Concurrency cancels superseded in-flight runs. (push vs PR have different `github.ref`, so the PR'd-branch double-run remains; rapid re-pushes to one branch cancel their own stale runs.) |
| 4 | **Single Node `24.x`** → 3-job OS matrix (not 20+22). Pin via `.nvmrc` + `engines`. | Static app → Node version is toolchain-only. Node 20 is **EOL (2026-04-30)**; 24 is the current **Active LTS**, longest runway, and matches the dev machine (24.16.0). |
| 5 | **CI-only — no deploy job.** | Vercel auto-deploys on push natively; an Actions deploy job would duplicate/conflict. |
| 6 | Smoke test uses **`start-server-and-test`** (devDep), probing `http-get://127.0.0.1:3000`, `WAIT_ON_TIMEOUT=60000`. Pass = HTTP **200** on `/`. | Removes the flakiest piece — hand-rolled background+`kill` teardown is unreliable on the Windows runner. `http-get://` forces a GET probe (wait-on defaults to HEAD); `127.0.0.1` avoids IPv6 `::1` mismatch. |
| 7 | **Split topology, two independent jobs** (no `needs:`): `quality` (Ubuntu: lint + type-check) and `build-smoke` (3-OS matrix, `fail-fast: false`: build + smoke). | Lint/tsc are deterministic & OS-independent — run once. Ubuntu's case-sensitive FS makes it the *strictest* place to type-check (catches import-casing bugs the other OSes hide). Independent jobs surface every problem per push. |
| 8 | **Branch protection on `main`** requiring all checks before merge. | A workflow only reports; protection is what makes the gate actually block merges. Scope: `main` only. |
| 9 | **One phased spec**; verify behavioral lint fixes by **manual run-through** (no test suite). | Phases are tightly ordered; the ~10 behavioral fixes touch only cosmetic/utility code (confetti, checkpoint IDs), so eyeballing the running app is sufficient. |

## Changes by phase

### Phase 1 — Lint cleanup (must land first; ends with `eslint .` exit 0)

ESLint config: promote `@typescript-eslint/no-unused-vars` from warn → **error**.

Fix the **27 errors** + **19 unused-vars**:
- **16 × `@typescript-eslint/no-explicit-any`** — replace `any` with real types (incl. `src/lib/store.ts:29`).
- **8 × `react-hooks/purity`** (`GoalEffects.tsx`) — confetti effect. Generate the
  random position/velocity/color arrays once (effect or seeded init, not during
  render); swap `Date.now()` sway → `useFrame`'s `clock.getElapsedTime()`.
- **2 × `react-hooks/immutability`**.
- **1 × `prefer-const`** (auto-fixable).
- `react-hooks/purity` in **`useRegisterCheckpoint.ts:12`** — replace
  `Math.random()` ID with React's **`useId()`** (stable, correct).
- **19 × `no-unused-vars`** — delete dead bindings.

Leave the **6 × `react-hooks/exhaustive-deps`** warnings as-is (non-blocking).

**Verify:** `eslint .` exits 0; manual run-through confirms checkpoints register and
the goal confetti still plays.

### Phase 2 — Pipeline (CI goes green)

`package.json`:
- Add `"type-check": "tsc --noEmit"`.
- Add `"smoke": "start-server-and-test start http-get://127.0.0.1:3000 smoke:check"`
  and `"smoke:check": "node -e \"\""` (no-op; the wait-for-200 is the assertion).
- Add `"engines": { "node": ">=24" }`.
- Add devDependency `start-server-and-test`.

`.nvmrc`: `24`

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Lint & Type-check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check

  build-smoke:
    name: Build & Smoke
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    env:
      NEXT_PUBLIC_FIREBASE_API_KEY: dummy
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: dummy
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: dummy
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: dummy
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: dummy
      NEXT_PUBLIC_FIREBASE_APP_ID: dummy
      WAIT_ON_TIMEOUT: "60000"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm run smoke
```

### Phase 3 — Branch protection

On `main`, require these status checks to pass before merge:
- `Lint & Type-check`
- `Build & Smoke (ubuntu-latest)`
- `Build & Smoke (macos-latest)`
- `Build & Smoke (windows-latest)`

(Names include the matrix value — keep job names stable.) Set via Settings →
Branches, or `gh api` once the CLI is installed. Document as a manual step.

## Out of scope / future notes

- **Gemini feedback feature** (server-side LLM-generated feedback): when built, it
  introduces a real Node runtime → (1) CI Node version must match **Vercel's**
  supported runtime, (2) add a `GEMINI_API_KEY` secret to CI, (3) add an
  API-route smoke check.
- Flipping `exhaustive-deps` to blocking once the hooks are audited.
- `caniuse-lite` is ~6 months stale (build warning) — optional `npx update-browserslist-db@latest`.
- Optional Vercel setting: "don't promote a deploy unless CI passes."

## Caveats (flagged to user)

- The OS matrix proves the **toolchain** (build/lint/type-check) and that the server
  **boots**, NOT webcam/MediaPipe runtime or gameplay.
- No test suite exists; behavioral lint fixes rely on manual verification.
