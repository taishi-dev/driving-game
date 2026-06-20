# CI Pipeline + Lint Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the driving app to a clean ESLint baseline, then add a cross-OS GitHub Actions CI pipeline that gates merges to `main`.

**Architecture:** Three phases in strict order. Phase 1 makes `eslint .` exit 0 (prerequisite for the lint gate). Phase 2 adds the workflow + supporting config so CI runs green. Phase 3 enables branch protection so the checks actually block merges. CI-only — Vercel continues to handle deploys.

**Tech Stack:** Next.js 16 (static output), React 19, ESLint flat config (`eslint.config.mjs`), TypeScript, GitHub Actions, `start-server-and-test`.

**Spec:** `docs/superpowers/specs/2026-06-20-cicd-pipeline-design.md` (rationale for every decision lives there).

## Global Constraints

- **Node: 24.x only.** Single version; never reintroduce a Node-version matrix.
- **Lint gate fails on errors + `@typescript-eslint/no-unused-vars`**; `react-hooks/exhaustive-deps` stays a non-blocking **warning** — do NOT "fix" the 6 exhaustive-deps warnings, and do NOT add `--max-warnings 0`.
- **Never replace `any` with `any`.** Use a precise type, or `unknown` + narrowing.
- **No new runtime dependencies.** Only `start-server-and-test` as a **devDependency**.
- **Build/smoke env:** dummy `NEXT_PUBLIC_FIREBASE_*` values only; never real secrets.
- **No test framework exists.** Each task's "test" is an objective command (`eslint`, `tsc`, `next build`, smoke) plus a manual run-through for the two behavioral fixes (confetti, webcam).
- **Run Node tools** by prepending `C:\Program Files\nodejs` to PATH if `node`/`npm` aren't found in the shell.

---

## PHASE 1 — Lint cleanup (must complete before Phase 2)

### Task 1: Promote `no-unused-vars` to error

**Files:**
- Modify: `eslint.config.mjs`

**Interfaces:**
- Produces: an ESLint config where unused vars are errors (so later tasks' fixes are gated).

- [ ] **Step 1: Add the rules override**

Append a config object before the closing `]` of `defineConfig([...])`:

```js
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "error",
    },
  },
```

- [ ] **Step 2: Verify unused-vars now report as errors**

Run: `npx eslint . -f stylish`
Expected: the 19 `no-unused-vars` lines now show as `error` (total error count rises from 27 to 46). This confirms the rule took effect; the count drops as later tasks fix them.

- [ ] **Step 3: Commit**

```bash
git add eslint.config.mjs
git commit -m "chore(lint): promote no-unused-vars to error"
```

---

### Task 2: Delete the 19 unused bindings

**Files (exact sites):**
- `src/components/ClientApp.tsx:9` — remove `useState` from the React import
- `src/components/simulation/Car.tsx:214` — remove unused `turnDir`
- `src/components/simulation/GarageScene.tsx:4` — remove `Environment`, `Float`, `Stars` from the import
- `src/components/simulation/GoalEffects.tsx:21` — remove `colors`/`col` (also see Task 4; the colors array is never applied via `setColorAt`)
- `src/components/simulation/MissionController.tsx:2,3,7,8,9,10,11` — remove 8 unused imports/bindings
- `src/components/simulation/RoadProps.tsx:117` — remove or prefix unused `e`
- `src/components/simulation/Surroundings.tsx:3` — remove `Stars` from the import
- `src/components/ui/FeedbackScreen.tsx:4,19` — remove `getCoursePath`, `calculateMissionResult`
- `src/components/vision/VisionController.tsx:32` — remove unused `gear`

**Interfaces:**
- Consumes: ESLint config from Task 1.

- [ ] **Step 1: Remove each binding listed above.** For unused imports, delete the named import (and the whole import line if it becomes empty). For unused locals, delete the declaration. Do not delete anything that is actually referenced — let the verify step confirm.

- [ ] **Step 2: Verify no unused-vars remain and types still compile**

Run: `npx eslint . 2>&1 | grep no-unused-vars` → Expected: no output.
Run: `npx tsc --noEmit` → Expected: exit 0 (deletions broke nothing).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(lint): remove 19 unused bindings"
```

---

### Task 3: Replace the 16 `any` types

**Files (exact sites):**
- `src/lib/store.ts:29` — `meta?: Record<string, any>` → `Record<string, unknown>`
- `src/app/debug/page.tsx:88`
- `src/components/auth/AuthScreen.tsx:34`
- `src/components/ClientApp.tsx:73,77,77`
- `src/components/simulation/Car.tsx:51`
- `src/components/simulation/objects/Bicycle.tsx:18`
- `src/components/simulation/objects/ModelErrorBoundary.tsx:6`
- `src/components/simulation/objects/RailroadCrossing.tsx:25`
- `src/components/simulation/objects/TrafficLight.tsx:39`
- `src/components/simulation/Surroundings.tsx:97`
- `src/components/ui/FeedbackScreen.tsx:46,48,49`
- `src/components/ui/HistoryScreen.tsx:44`

**Interfaces:**
- Produces: an `any`-free type surface (no new exported signatures).

- [ ] **Step 1: Replace each `any` with a precise type**, using this deterministic rule:
  - `catch (e: any)` → remove the annotation (TS infers `unknown`) or `catch (e: unknown)`, then narrow before use.
  - `Record<string, any>` → `Record<string, unknown>`.
  - GLTF / three.js loader results → the proper imported type (e.g. `THREE.Object3D`, `GLTF`); if genuinely unknowable, `unknown` + a narrowing check or a single explicit cast at the use site.
  - Never leave or introduce `any`.

- [ ] **Step 2: Verify**

Run: `npx eslint . 2>&1 | grep no-explicit-any` → Expected: no output.
Run: `npx tsc --noEmit` → Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(lint): replace 16 any types with precise types"
```

---

### Task 4: Fix GoalEffects confetti (purity + immutability)

**Files:**
- Modify: `src/components/simulation/GoalEffects.tsx`

**Interfaces:**
- Consumes: nothing new. Produces: same `<GoalEffects />` component, same visual behavior.

**Why:** `Math.random()` runs during render (7× `react-hooks/purity`, lines 44–56) and the memoized arrays are mutated in `useFrame` (`react-hooks/immutability`, line 72). Fix by generating the random data **once in an effect** into refs, and mutating the refs in `useFrame`. Drop the unused `colors` array. Replace `Date.now()` sway with `useFrame`'s `clock`.

- [ ] **Step 1: Rewrite the `Confetti` function**

```tsx
function Confetti() {
  const count = 200;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dataRef = useRef<{ pos: Float32Array; vel: Float32Array } | null>(null);

  // Generate random initial state once, after mount (not during render).
  useEffect(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = 5 + Math.random() * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
      vel[i * 3] = (Math.random() - 0.5) * 0.2;
      vel[i * 3 + 1] = -0.05 - Math.random() * 0.1;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
    }
    dataRef.current = { pos, vel };
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    const data = dataRef.current;
    if (!meshRef.current || !data) return;
    const { pos, vel } = data;
    const t = clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      pos[i * 3] += vel[i * 3];
      pos[i * 3 + 1] += vel[i * 3 + 1];
      pos[i * 3 + 2] += vel[i * 3 + 2];
      if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 10 + (i % 5);
      pos[i * 3] += Math.sin(t + i) * 0.01;
      dummy.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      dummy.rotation.x += 0.1;
      dummy.rotation.y += 0.1;
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <planeGeometry args={[0.2, 0.2]} />
      <meshBasicMaterial side={THREE.DoubleSide} />
    </instancedMesh>
  );
}
```

Ensure the imports at the top are `import { useEffect, useRef, useMemo } from "react";`.

- [ ] **Step 2: Verify lint + types**

Run: `npx eslint src/components/simulation/GoalEffects.tsx` → Expected: no errors.
Run: `npx tsc --noEmit` → Expected: exit 0.
(If `react-hooks/purity` still flags anything, move ALL random generation into the `useEffect` body — nothing random may execute during render.)

- [ ] **Step 3: Commit**

```bash
git add src/components/simulation/GoalEffects.tsx
git commit -m "refactor(lint): make confetti effect pure (generate in effect, mutate refs)"
```

---

### Task 5: Fix useRegisterCheckpoint ID generation

**Files:**
- Modify: `src/hooks/useRegisterCheckpoint.ts`

- [ ] **Step 1: Replace the `Math.random` ID with `useId`**

Change the import to `import { useEffect, useId } from 'react';` and replace line 12:

```ts
  // Stable unique ID per component instance (pure; replaces Math.random()).
  const id = useId();
```

Remove `useRef` from the import if no longer used. Leave the `useEffect` dependency array as-is (`id` is still a valid, now-stable dep).

- [ ] **Step 2: Verify**

Run: `npx eslint src/hooks/useRegisterCheckpoint.ts` → Expected: no `react-hooks/purity` error (the `exhaustive-deps` warning may remain — leave it).
Run: `npx tsc --noEmit` → Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRegisterCheckpoint.ts
git commit -m "refactor(lint): use useId() for checkpoint ids"
```

---

### Task 6: Fix VisionController (prefer-const + use-before-declare)

**Files:**
- Modify: `src/components/vision/VisionController.tsx`

**Why:** `let steeringHands = []` is never reassigned (`prefer-const`, line 411). And `predictWebcam()` is called at line 141 inside the `startCamera` `useCallback`, but `predictWebcam` is declared later (line 268), which the React Compiler flags as `react-hooks/immutability` (access before declaration). This is core webcam code — fix via a ref so the callback calls the latest loop without depending on declaration order, preserving the existing "don't put predictWebcam in deps" behavior.

- [ ] **Step 1: prefer-const** — change line 411 `let steeringHands = []` to `const steeringHands = []`.

- [ ] **Step 2: Add a ref for the loop function.** Near the other refs at the top of the component, add:

```ts
  const predictWebcamRef = useRef<() => void>(() => {});
```

- [ ] **Step 3: Call through the ref at line 141.** Replace `predictWebcam();` with:

```ts
                predictWebcamRef.current();
```

- [ ] **Step 4: Keep the ref current.** Where `predictWebcam` is defined (around line 268), immediately after its declaration assign it: `predictWebcamRef.current = predictWebcam;`. (Assigning a ref during render is allowed and avoids the use-before-declare access in the callback.)

- [ ] **Step 5: Verify lint + types**

Run: `npx eslint src/components/vision/VisionController.tsx` → Expected: no errors (the 3 `exhaustive-deps` warnings may remain — leave them).
Run: `npx tsc --noEmit` → Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/vision/VisionController.tsx
git commit -m "refactor(lint): const steeringHands + ref-indirect predictWebcam loop"
```

---

### Task 7: Green-lint gate + manual run-through

**Interfaces:**
- Consumes: Tasks 1–6. Produces: a clean baseline that the Phase 2 lint gate can rely on.

- [ ] **Step 1: Full lint passes**

Run: `npx eslint .`
Expected: exit 0, only `react-hooks/exhaustive-deps` warnings remain (6), zero errors.

- [ ] **Step 2: Type-check + build pass**

Run: `npx tsc --noEmit` → Expected: exit 0.
Run: `npm run build` (with dummy `NEXT_PUBLIC_FIREBASE_*` env) → Expected: exit 0.

- [ ] **Step 3: Manual behavioral verification** (no automated tests exist)

Run `npm run dev`, then in the browser confirm:
- Checkpoints still register (drive a lesson; scoring/feedback fires at checkpoints).
- The goal **confetti** still plays on a successful run.
- The **webcam** hand-steering still starts and steers (and keyboard `←/→` fallback still works).

Use the `/run` skill to launch and observe if helpful.

- [ ] **Step 4: Commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "chore(lint): clean baseline — eslint . exits 0"
```

---

## PHASE 2 — CI pipeline

### Task 8: package.json scripts, engines, devDep, .nvmrc

**Files:**
- Modify: `package.json`
- Create: `.nvmrc`

**Interfaces:**
- Produces scripts consumed by the workflow: `npm run type-check`, `npm run smoke`.

- [ ] **Step 1: Add scripts and engines to `package.json`**

In `"scripts"` add:
```json
    "type-check": "tsc --noEmit",
    "smoke": "start-server-and-test start http-get://127.0.0.1:3000 smoke:check",
    "smoke:check": "node -e \"\""
```
Add a top-level field:
```json
  "engines": { "node": ">=24" }
```

- [ ] **Step 2: Add the devDependency**

Run: `npm install --save-dev start-server-and-test`
Expected: `start-server-and-test` appears under `devDependencies`; `package-lock.json` updated.

- [ ] **Step 3: Create `.nvmrc`**

File `.nvmrc` containing exactly:
```
24
```

- [ ] **Step 4: Verify the smoke script locally**

Run: `npm run build` then `npm run smoke` (with dummy firebase env).
Expected: server starts, wait-on gets HTTP 200 on `http-get://127.0.0.1:3000`, `smoke:check` no-op runs, server shuts down, exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .nvmrc
git commit -m "build: add type-check + smoke scripts, pin Node 24"
```

---

### Task 9: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm run lint`, `npm run type-check`, `npm run build`, `npm run smoke` from Task 8.
- Produces these check names (Phase 3 requires them verbatim): `Lint & Type-check`, `Build & Smoke (ubuntu-latest)`, `Build & Smoke (macos-latest)`, `Build & Smoke (windows-latest)`.

- [ ] **Step 1: Create the workflow file** with exactly the contents from the spec:

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

- [ ] **Step 2: Commit and push to trigger CI**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add cross-OS lint/type-check/build/smoke pipeline"
git push
```

- [ ] **Step 3: Verify CI is green on GitHub**

Check the Actions tab (or `gh run watch`). Expected: all 4 jobs pass — `Lint & Type-check` and `Build & Smoke` on ubuntu/macos/windows.
If the smoke step hangs on Windows: confirm `http-get://` (not `http://`) and `127.0.0.1` (not `localhost`) — both already set above.

---

## PHASE 3 — Branch protection

### Task 10: Require the checks on `main`

**Files:** none (GitHub repo settings).

- [ ] **Step 1: Add the branch protection rule.** GitHub → Settings → Branches → Add rule for `main`:
  - Require status checks to pass before merging → select: `Lint & Type-check`, `Build & Smoke (ubuntu-latest)`, `Build & Smoke (macos-latest)`, `Build & Smoke (windows-latest)`.
  - (Optional) Require branches to be up to date before merging.

  Or via CLI once `gh` is installed:
  ```bash
  gh api -X PUT repos/Piyoone3939/driving/branches/main/protection \
    -H "Accept: application/vnd.github+json" \
    -f 'required_status_checks[strict]=true' \
    -f 'required_status_checks[checks][][context]=Lint & Type-check' \
    -f 'required_status_checks[checks][][context]=Build & Smoke (ubuntu-latest)' \
    -f 'required_status_checks[checks][][context]=Build & Smoke (macos-latest)' \
    -f 'required_status_checks[checks][][context]=Build & Smoke (windows-latest)' \
    -F enforce_admins=false -F required_pull_request_reviews= -F restrictions=
  ```

- [ ] **Step 2: Verify enforcement.** Open a throwaway PR with a deliberate lint error; confirm GitHub blocks merge until checks pass. Revert the throwaway change.

---

## Self-Review

**Spec coverage:** All 9 spec decisions map to tasks — lint hard-gate + fix-first (Tasks 1–7), error+unused-vars gate / exhaustive-deps stays warning (Task 1 + Global Constraints), triggers + concurrency (Task 9), single Node 24 + `.nvmrc`/`engines` (Tasks 8–9), CI-only/no deploy (no deploy task by design), `start-server-and-test` smoke (Tasks 8–9), split topology (Task 9), branch protection (Task 10), phased + manual verify (phase ordering + Task 7). Out-of-scope items (Gemini, exhaustive-deps flip, browserslist, Vercel wait-for-CI) intentionally have no tasks.

**Placeholder scan:** Exact file:line sites listed for all mechanical fixes; full code given for the non-trivial ones; `any` replacement uses a deterministic rule + objective `tsc`/`eslint` gates rather than vague wording.

**Type consistency:** `predictWebcamRef` typed `() => void` and used consistently (Task 6); `dataRef` shape `{ pos, vel }` consistent within Task 4; check names in Task 9's Produces match Task 10's required list verbatim.
