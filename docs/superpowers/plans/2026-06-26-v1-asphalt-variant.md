# V1 · Asphalt (Arcade) Variant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the front end's visual/UX language and driving feel as the **Asphalt (arcade)** variant — neon gold + electric blue, heavy glow, fast/loose handling — on its own branch for A/B comparison.

**Architecture:** Direct per-branch restyle + retune. One `feature/*` branch off `main` edits three files with Asphalt-specific values: lift the inline steering literals in `carPhysics.ts` into named constants, retune `CAR_PHYSICS`/`STEERING` for loose-and-fast feel, and restyle `HomeScreen.tsx` + `Dashboard.tsx`. No shared abstraction is introduced — commonality is extracted only after a winner emerges.

**Tech Stack:** Next.js 16, React 19, React Three Fiber, TypeScript 5, Tailwind CSS 3.4, `node --test` unit tests.

## Global Constraints

- Stack: Next.js + React + React Three Fiber (TypeScript). No reuse of any reference-game code — look and feel are rebuilt natively. (verbatim from spec)
- `carPhysics.ts` functions keep their signatures and purity — only constant values change — so existing unit tests and frame-rate-independence guarantees hold. (verbatim from spec)
- No runtime theme/variant switcher; no shared theme-engine or physics-preset abstraction up front; no new gameplay systems, missions, or scoring changes. Variants restyle and retune existing behavior only. (verbatim from spec)
- Do not change lesson copy, the bilingual labels, or the language selector behavior — restyle only.
- Node `>=24`. Unit tests run with `npm run test:unit`; a single file with `node --test tests/carPhysics.test.ts`.

---

### Task 0: Create the variant branch

**Files:** none (branch only)

- [ ] **Step 1: Branch off a clean `main`**

```bash
git checkout main
git pull --ff-only
git checkout -b V1-asphalt/feature/look-and-feel
```

- [ ] **Step 2: Confirm clean baseline**

Run: `npm run test:unit`
Expected: all tests PASS (baseline green before any change).

---

### Task 1: Lift inline physics literals into named constants

This is a pure structural refactor — no behavior change. It exists so the retune
in Task 2 has clean, named knobs. Identical across all three variants by design.

**Files:**
- Modify: `src/lib/carPhysics.ts:12-18` (add `brakeRate` to `CAR_PHYSICS`), `:32-65` (introduce `STEERING`, replace literals)
- Test: `tests/carPhysics.test.ts`

**Interfaces:**
- Consumes: existing `CAR_PHYSICS`, `stepSpeed`, `steeringYawDelta` from `src/lib/carPhysics.ts`.
- Produces:
  - `CAR_PHYSICS.brakeRate: number` (the per-step brake decrement, was the inline `0.05`)
  - `export const STEERING = { curveExponent: number; boost: number; rateMultiplier: number }` (was the inline `1.8`, `8.0`, `3.0`)
  - `stepSpeed`, `steeringYawDelta` keep their exact signatures.

- [ ] **Step 1: Write the failing tests**

Add these imports and tests to `tests/carPhysics.test.ts`. The tests recompute
the expected result *from the exported constants*, so they stay green after any
retune in Task 2 while still failing now (the constants don't exist yet).

```ts
// add STEERING to the existing import from "../src/lib/carPhysics.ts"
import {
  CAR_PHYSICS,
  STEERING,
  stepSpeed,
  steeringYawDelta,
  forwardStep,
  dtScaleFromDelta,
  smoothingAlpha,
} from "../src/lib/carPhysics.ts";

test("steeringYawDelta is defined by the exported STEERING constants", () => {
  const { maxSpeed, turnSpeed } = CAR_PHYSICS;
  const { curveExponent, boost, rateMultiplier } = STEERING;
  const speed = maxSpeed, steering = 0.5, dir = 1, dt = 1;
  const curved = Math.sign(steering) * Math.pow(Math.abs(steering), curveExponent);
  const expected = -(curved * boost * turnSpeed * (speed / maxSpeed) * rateMultiplier * dir) * dt;
  assert.ok(
    Math.abs(steeringYawDelta(speed, steering, dir, dt) - expected) < 1e-12,
    "steeringYawDelta must be computed from the exported STEERING constants",
  );
});

test("stepSpeed braking uses CAR_PHYSICS.brakeRate", () => {
  const { brakeRate } = CAR_PHYSICS;
  const speed = 1;
  // throttle 0, brake 1, dt 1 -> speed - brakeRate
  assert.equal(stepSpeed(speed, { throttle: 0, brake: 1 }, 1), speed - brakeRate);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/carPhysics.test.ts`
Expected: FAIL — `STEERING` is `undefined` / not exported (import error or `curveExponent` of undefined).

- [ ] **Step 3: Refactor `carPhysics.ts` to introduce the constants**

In `src/lib/carPhysics.ts`, add `brakeRate` to `CAR_PHYSICS` and a new `STEERING`
object, then replace the inline literals in `stepSpeed` and `steeringYawDelta`.

```ts
export const CAR_PHYSICS = {
  maxSpeed: 1.5,
  acceleration: 0.01,
  friction: 0.005,
  creepSpeed: 0.15,
  turnSpeed: 0.05,
  brakeRate: 0.05,
} as const;

/** Steering response knobs, lifted from inline literals so each variant tunes
 * them cleanly. `curveExponent` shapes input response (higher = more progressive,
 * lower = twitchier); `boost` scales overall turn authority; `rateMultiplier` is
 * the legacy *3 term. */
export const STEERING = {
  curveExponent: 1.8,
  boost: 8.0,
  rateMultiplier: 3.0,
} as const;
```

Update `stepSpeed`'s brake branch:

```ts
  if (inputs.brake > 0) {
    const next = speed - inputs.brake * CAR_PHYSICS.brakeRate * dtScale;
    return next < 0 ? 0 : next;
  }
```

Update `steeringYawDelta` body (signature unchanged):

```ts
export function steeringYawDelta(
  speed: number,
  steering: number,
  direction: number,
  dtScale: number,
): number {
  if (Math.abs(speed) <= 0.001) return 0;
  const { maxSpeed, turnSpeed } = CAR_PHYSICS;
  const { curveExponent, boost, rateMultiplier } = STEERING;
  const curved = Math.sign(steering) * Math.pow(Math.abs(steering), curveExponent);
  const boosted = curved * boost;
  return -(boosted * turnSpeed * (speed / maxSpeed) * rateMultiplier * direction) * dtScale;
}
```

- [ ] **Step 4: Run the full unit suite to verify green**

Run: `npm run test:unit`
Expected: PASS — the two new tests pass and all pre-existing `carPhysics`/other tests stay green (values are unchanged, so behavior is identical).

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/carPhysics.ts tests/carPhysics.test.ts
git commit -m "refactor(physics): lift steering literals + brake rate into named constants"
```

---

### Task 2: Retune physics for Asphalt feel (loose & fast)

**Files:**
- Modify: `src/lib/carPhysics.ts:12-25` (`CAR_PHYSICS` + `STEERING` values)
- Test: `tests/carPhysics.test.ts`

**Interfaces:**
- Consumes: `CAR_PHYSICS`, `STEERING` from Task 1.
- Produces: retuned constant values; no signature changes.

Target feel (from spec): higher `maxSpeed`, higher `acceleration`, lower
`friction` (glidey coast), responsive/twitchy steering (sharper curve). The exact
numbers below are a verified starting point — tune on feel in Step 4.

- [ ] **Step 1: Write the failing directional test**

Add to `tests/carPhysics.test.ts`. This pins the *design intent* (faster, glidier,
twitchier than the 60fps baseline) so a future edit can't silently undo it.

```ts
test("asphalt feel: faster, glidier, twitchier than the 1.5/0.01/0.005/1.8 baseline", () => {
  assert.ok(CAR_PHYSICS.maxSpeed > 1.5, "top speed should exceed baseline");
  assert.ok(CAR_PHYSICS.acceleration > 0.01, "acceleration should exceed baseline");
  assert.ok(CAR_PHYSICS.friction < 0.005, "friction should be below baseline (glidey)");
  assert.ok(STEERING.curveExponent < 1.8, "steering curve should be sharper/twitchier");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/carPhysics.test.ts`
Expected: FAIL — baseline values (`maxSpeed: 1.5`, etc.) do not satisfy the assertions.

- [ ] **Step 3: Set the Asphalt values**

In `src/lib/carPhysics.ts`:

```ts
export const CAR_PHYSICS = {
  maxSpeed: 2.2,
  acceleration: 0.018,
  friction: 0.002,
  creepSpeed: 0.15,
  turnSpeed: 0.055,
  brakeRate: 0.05,
} as const;

export const STEERING = {
  curveExponent: 1.4,
  boost: 10.0,
  rateMultiplier: 3.0,
} as const;
```

- [ ] **Step 4: Run tests + drive to verify feel**

Run: `npm run test:unit`
Expected: PASS — the directional test plus all invariant tests (frame-rate independence, dt identity, ratio) stay green because they reference `CAR_PHYSICS`/`STEERING` dynamically.

Then use the `run-driving` skill to start the app and drive a short loop. Confirm the car feels fast and glidey with quick turn-in. Nudge `maxSpeed`/`friction`/`curveExponent` if it overshoots; re-run `npm run test:unit` after any change.

- [ ] **Step 5: Commit**

```bash
git add src/lib/carPhysics.ts tests/carPhysics.test.ts
git commit -m "feat(v1-asphalt): retune physics for loose, fast arcade feel"
```

---

### Task 3: Restyle `HomeScreen.tsx` — Asphalt look

**Files:**
- Modify: `src/components/ui/HomeScreen.tsx` (overlay markup/classes only; keep `LESSONS`, handlers, store wiring, and the language selector intact)

**Interfaces:**
- Consumes: `useDrivingStore`, `GarageScene`, `LESSONS` (all unchanged).
- Produces: restyled overlay. No exported API change (`HomeScreen` signature unchanged).

Look (from spec): neon gold + electric blue, heavy glow, fast motion, aggressive
italics, high-energy "nitro" feel — amplify the existing angular card style's glow
and motion.

- [ ] **Step 1: Replace the component's `return` markup with the Asphalt restyle**

Replace the JSX returned by `HomeScreen` (the `return ( ... )` block, lines 45-126
in the baseline) with the following. Keep everything above the `return` (imports,
`LESSONS`, the `handleSelectLesson` body and store hooks) exactly as-is.

```tsx
  return (
    <div className="w-full h-full relative overflow-hidden bg-black text-white font-sans selection:bg-amber-500 selection:text-black">
      {/* 3D Background - z-0 */}
      <div className="absolute inset-0 z-0">
        <GarageScene />
      </div>

      {/* Overlay UI - z-10 */}
      <div className="absolute inset-0 z-10 flex flex-col justify-between pointer-events-none">
        {/* Top Bar */}
        <div className="w-full p-8 flex justify-between items-start pointer-events-auto bg-gradient-to-b from-black/85 to-transparent">
          <div>
            <h1 className="text-6xl font-black italic tracking-tighter text-white drop-shadow-[0_0_18px_rgba(0,0,0,0.7)]">
              VIRTUAL{" "}
              <span className="text-amber-400 drop-shadow-[0_0_25px_rgba(251,191,36,0.85)]">DRIVING</span>{" "}
              SCHOOL
            </h1>
            <p className="text-sm font-black italic text-amber-300/80 tracking-[0.35em] mt-2">NITRO SIMULATION v2.0</p>

            <select
              aria-label="Select language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'ja' | 'en')}
              className="mt-4 bg-black/70 text-white text-sm font-bold px-3 py-1.5 rounded border border-amber-500/40 hover:border-amber-400 focus:border-amber-400 focus:outline-none transition-colors cursor-pointer"
            >
              <option value="ja">日本語 (Japanese)</option>
              <option value="en">English (English)</option>
            </select>
          </div>
        </div>

        {/* Bottom Area: Carousel */}
        <div className="w-full p-8 pb-12 pointer-events-auto bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col justify-end">
          <div className="mb-4 flex items-end gap-4 border-b border-amber-400/30 pb-2 max-w-4xl">
            <h2 className="text-2xl font-black italic tracking-wider text-white">SELECT COURSE</h2>
            <span className="text-sm text-amber-400 font-mono mb-1 animate-pulse">/ ALL SYSTEMS READY</span>
          </div>

          <div className="flex items-end gap-6 overflow-x-auto pb-4 pt-2 snap-x scrollbar-hide">
            {LESSONS.map((lesson, index) => (
              <button
                key={lesson.id}
                onClick={() => handleSelectLesson(lesson.id)}
                className="group relative flex-shrink-0 w-72 h-48 bg-slate-900/80 border-t-4 border-amber-500/60 hover:border-amber-400 transition-all duration-200 transform hover:-translate-y-3 hover:scale-[1.03] hover:shadow-[0_0_45px_rgba(251,191,36,0.5)] snap-center overflow-hidden"
                style={{ clipPath: "polygon(0 0, 100% 0, 100% 85%, 90% 100%, 0 100%)" }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-amber-900/0 to-amber-600/25 opacity-60 group-hover:opacity-100 transition-all duration-200" />

                <div className="absolute inset-0 p-6 flex flex-col justify-between text-left">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-black text-amber-200/70 bg-slate-950 px-2 py-1 rounded border border-amber-500/30 group-hover:text-amber-300 group-hover:border-amber-400/60 transition-colors">
                      {lesson.sub}
                    </span>
                    <div className={`w-3 h-3 rounded-full ${index === 0 ? "bg-amber-400 shadow-[0_0_12px_#fbbf24]" : "bg-slate-700"}`} />
                  </div>

                  <div>
                    <h3 className="text-2xl font-black italic text-white group-hover:text-amber-300 mb-1">{lesson.label[language]}</h3>
                    <p className="text-xs text-amber-200/60 font-mono">{lesson.desc}</p>
                  </div>

                  <div className="flex justify-between items-end">
                    <div className="text-4xl font-black italic text-slate-800 group-hover:text-amber-500/40 select-none">
                      0{index + 1}
                    </div>

                    <span className="text-sm font-black italic text-amber-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transform translate-x-4 group-hover:translate-x-0 transition-all duration-200">
                      START <span className="text-lg">»</span>
                    </span>
                  </div>
                </div>
              </button>
            ))}

            <div className="w-12 flex-shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
```

- [ ] **Step 2: Build + type-check**

Run: `npm run build`
Expected: build succeeds (no type errors).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Screenshot and eyeball**

Use the `run-driving` skill to start the dev server and capture the home screen. Confirm: gold accent on "DRIVING" with glow, italic high-energy type, amber card hover glow + lift. Tune class values if the glow/motion is too weak or too strong; re-run `npm run lint` after edits.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/HomeScreen.tsx
git commit -m "feat(v1-asphalt): restyle home screen with neon-gold arcade look"
```

---

### Task 4: Restyle `Dashboard.tsx` — Asphalt HUD

**Files:**
- Modify: `src/components/ui/Dashboard.tsx` (feedback + warning overlay styling; keep store wiring and conditional logic intact)

**Interfaces:**
- Consumes: `useDrivingStore` selectors `isOffTrack`, `drivingFeedback` (unchanged).
- Produces: restyled HUD overlays. `Dashboard` signature unchanged.

- [ ] **Step 1: Restyle the feedback box (the `drivingFeedback` block)**

In `src/components/ui/Dashboard.tsx`, replace the inner feedback `<div>`'s style
object (the one currently using `border: '2px solid #4ade80'`) with the Asphalt
gold treatment:

```tsx
              <div style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.82)',
                  border: '2px solid #fbbf24',
                  borderRadius: '10px',
                  padding: '16px 32px',
                  color: '#fbbf24',
                  fontSize: '26px',
                  fontWeight: 900,
                  fontStyle: 'italic',
                  letterSpacing: '1px',
                  boxShadow: '0 0 28px rgba(251, 191, 36, 0.45)',
                  whiteSpace: 'nowrap'
              }}>
                  {drivingFeedback}
              </div>
```

- [ ] **Step 2: Restyle the off-track warning (the `isOffTrack` block)**

Replace the warning's inner `<div style={{ fontSize: '24px', ... }}>` with an
italic, glow-amplified red treatment to match the arcade energy:

```tsx
              <div style={{ fontSize: '26px', fontWeight: 900, fontStyle: 'italic', letterSpacing: '4px', border: '2px solid #ef4444', padding: '10px 22px', borderRadius: '6px', backgroundColor: 'rgba(50,0,0,0.55)', boxShadow: '0 0 26px rgba(239,68,68,0.5)' }}>
                  WARNING
              </div>
```

- [ ] **Step 3: Build + type-check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Screenshot in-drive HUD**

Use the `run-driving` skill to enter a lesson, trigger an off-track warning and (if reachable) a feedback message, and capture the HUD. Confirm the gold/italic feedback and amplified red warning read as "Asphalt".

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Dashboard.tsx
git commit -m "feat(v1-asphalt): restyle in-drive HUD to match arcade look"
```

---

## Final verification (per spec, run once at the end)

- [ ] `npm run build` succeeds.
- [ ] `npm run type-check` clean; `npm run test:unit` green.
- [ ] `npm run lint` clean.
- [ ] `run-driving` screenshots of menu + a short drive captured and they read as the Asphalt look and loose/fast feel.
