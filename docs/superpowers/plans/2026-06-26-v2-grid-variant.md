# V2 · Grid (Sim) Variant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the front end's visual/UX language and driving feel as the **Grid (sim)** variant — restrained motorsport charcoal/white/red, telemetry-style HUD, weighty/grippy handling — on its own branch for A/B comparison.

**Architecture:** Direct per-branch restyle + retune. One `feature/*` branch off `main` edits three files with Grid-specific values: lift the inline steering literals in `carPhysics.ts` into named constants, retune `CAR_PHYSICS`/`STEERING` for weighty/grippy feel, and restyle `HomeScreen.tsx` + `Dashboard.tsx`. No shared abstraction is introduced — commonality is extracted only after a winner emerges.

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
git checkout -b V2-grid/feature/look-and-feel
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
  assert.equal(stepSpeed(speed, { throttle: 0, brake: 1 }, 1), speed - brakeRate);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/carPhysics.test.ts`
Expected: FAIL — `STEERING` is `undefined` / not exported.

- [ ] **Step 3: Refactor `carPhysics.ts` to introduce the constants**

In `src/lib/carPhysics.ts`, add `brakeRate` to `CAR_PHYSICS` and a new `STEERING`
object, then replace the inline literals.

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
Expected: PASS — new tests pass and all pre-existing tests stay green (values unchanged → identical behavior).

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/carPhysics.ts tests/carPhysics.test.ts
git commit -m "refactor(physics): lift steering literals + brake rate into named constants"
```

---

### Task 2: Retune physics for Grid feel (weighty & grippy)

**Files:**
- Modify: `src/lib/carPhysics.ts:12-25` (`CAR_PHYSICS` + `STEERING` values)
- Test: `tests/carPhysics.test.ts`

**Interfaces:**
- Consumes: `CAR_PHYSICS`, `STEERING` from Task 1.
- Produces: retuned constant values; no signature changes.

Target feel (from spec): slower `acceleration` build, moderate `maxSpeed`, higher
`friction` (engine-brake feel), softer/progressive steering (less twitch, more
grip). The numbers below are a verified starting point — tune on feel in Step 4.

- [ ] **Step 1: Write the failing directional test**

Add to `tests/carPhysics.test.ts`. Pins the design intent (slower to build,
grippier, more progressive than the 60fps baseline).

```ts
test("grid feel: slower build, grippier, more progressive than the 0.01/0.005/1.8 baseline", () => {
  assert.ok(CAR_PHYSICS.acceleration < 0.01, "acceleration should be below baseline (slower build)");
  assert.ok(CAR_PHYSICS.friction > 0.005, "friction should exceed baseline (engine-brake)");
  assert.ok(STEERING.curveExponent > 1.8, "steering curve should be more progressive/less twitchy");
  assert.ok(CAR_PHYSICS.maxSpeed <= 1.6, "top speed stays moderate");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/carPhysics.test.ts`
Expected: FAIL — baseline values do not satisfy the assertions.

- [ ] **Step 3: Set the Grid values**

In `src/lib/carPhysics.ts`:

```ts
export const CAR_PHYSICS = {
  maxSpeed: 1.5,
  acceleration: 0.006,
  friction: 0.012,
  creepSpeed: 0.15,
  turnSpeed: 0.045,
  brakeRate: 0.05,
} as const;

export const STEERING = {
  curveExponent: 2.4,
  boost: 6.0,
  rateMultiplier: 3.0,
} as const;
```

- [ ] **Step 4: Run tests + drive to verify feel**

Run: `npm run test:unit`
Expected: PASS — directional test plus all invariant tests (frame-rate independence, dt identity, ratio) stay green (they reference the constants dynamically).

Then use the `run-driving` skill to drive a short loop. Confirm the car builds speed slowly, slows noticeably when coasting (engine-brake), and turns with grip rather than twitch. Adjust `acceleration`/`friction`/`curveExponent` on feel; re-run `npm run test:unit` after any change.

- [ ] **Step 5: Commit**

```bash
git add src/lib/carPhysics.ts tests/carPhysics.test.ts
git commit -m "feat(v2-grid): retune physics for weighty, grippy sim feel"
```

---

### Task 3: Restyle `HomeScreen.tsx` — Grid look

**Files:**
- Modify: `src/components/ui/HomeScreen.tsx` (overlay markup/classes only; keep `LESSONS`, handlers, store wiring, and the language selector intact)

**Interfaces:**
- Consumes: `useDrivingStore`, `GarageScene`, `LESSONS` (all unchanged).
- Produces: restyled overlay. `HomeScreen` signature unchanged.

Look (from spec): restrained motorsport. Charcoal base, white/red accents,
telemetry-style HUD with tabular numerals, minimal glow, mostly upright type.

- [ ] **Step 1: Replace the component's `return` markup with the Grid restyle**

Replace the JSX returned by `HomeScreen` (the `return ( ... )` block, lines 45-126
in the baseline) with the following. Keep everything above the `return` exactly
as-is. Note the removed `clipPath` (flat rectangular cards), `not-italic`,
`tabular-nums`, and absence of glow shadows.

```tsx
  return (
    <div className="w-full h-full relative overflow-hidden bg-neutral-950 text-neutral-100 font-sans selection:bg-red-600 selection:text-white">
      {/* 3D Background - z-0 */}
      <div className="absolute inset-0 z-0">
        <GarageScene />
      </div>

      {/* Overlay UI - z-10 */}
      <div className="absolute inset-0 z-10 flex flex-col justify-between pointer-events-none">
        {/* Top Bar */}
        <div className="w-full p-8 flex justify-between items-start pointer-events-auto bg-gradient-to-b from-neutral-950/90 to-transparent">
          <div>
            <h1 className="text-5xl font-semibold not-italic tracking-tight text-neutral-100">
              VIRTUAL <span className="text-red-600">DRIVING</span> SCHOOL
            </h1>
            <p className="text-xs font-mono text-neutral-500 tracking-[0.3em] mt-2 tabular-nums">TELEMETRY SYSTEM · v2.0</p>

            <select
              aria-label="Select language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'ja' | 'en')}
              className="mt-4 bg-neutral-900/80 text-neutral-100 text-sm font-medium px-3 py-1.5 rounded-sm border border-neutral-700 hover:border-red-600 focus:border-red-600 focus:outline-none transition-colors cursor-pointer"
            >
              <option value="ja">日本語 (Japanese)</option>
              <option value="en">English (English)</option>
            </select>
          </div>
        </div>

        {/* Bottom Area: Carousel */}
        <div className="w-full p-8 pb-12 pointer-events-auto bg-gradient-to-t from-neutral-950/95 via-neutral-950/50 to-transparent flex flex-col justify-end">
          <div className="mb-4 flex items-end gap-4 border-b border-neutral-700 pb-2 max-w-4xl">
            <h2 className="text-xl font-semibold tracking-widest text-neutral-200 uppercase">Select Course</h2>
            <span className="text-xs text-red-500 font-mono mb-1 tabular-nums">/ SYSTEMS NOMINAL</span>
          </div>

          <div className="flex items-end gap-4 overflow-x-auto pb-4 pt-2 snap-x scrollbar-hide">
            {LESSONS.map((lesson, index) => (
              <button
                key={lesson.id}
                onClick={() => handleSelectLesson(lesson.id)}
                className="group relative flex-shrink-0 w-72 h-48 bg-neutral-900/80 rounded-sm border border-neutral-700 hover:border-red-600 transition-all duration-200 transform hover:-translate-y-1 snap-center overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-red-950/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

                <div className="absolute inset-0 p-6 flex flex-col justify-between text-left">
                  <div className="flex justify-between items-start">
                    <span className="text-[11px] font-mono tabular-nums text-neutral-400 bg-neutral-950 px-2 py-1 rounded-sm border border-neutral-800 group-hover:text-neutral-200 group-hover:border-neutral-600 transition-colors">
                      {lesson.sub}
                    </span>
                    <div className={`w-2.5 h-2.5 rounded-full ${index === 0 ? "bg-red-600" : "bg-neutral-700"}`} />
                  </div>

                  <div>
                    <h3 className="text-2xl font-semibold not-italic text-neutral-100 group-hover:text-white mb-1">{lesson.label[language]}</h3>
                    <p className="text-xs text-neutral-500 font-mono">{lesson.desc}</p>
                  </div>

                  <div className="flex justify-between items-end">
                    <div className="text-4xl font-mono tabular-nums font-bold text-neutral-800 group-hover:text-neutral-700 select-none">
                      0{index + 1}
                    </div>

                    <span className="text-sm font-semibold text-red-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      START <span className="text-lg">›</span>
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
Expected: build succeeds.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Screenshot and eyeball**

Use the `run-driving` skill to capture the home screen. Confirm: charcoal base, red accent on "DRIVING", upright (non-italic) type, monospace tabular numerals, flat cards with a thin red hover border and no glow. Tune class values toward a more restrained motorsport feel if needed; re-run `npm run lint` after edits.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/HomeScreen.tsx
git commit -m "feat(v2-grid): restyle home screen with restrained motorsport look"
```

---

### Task 4: Restyle `Dashboard.tsx` — Grid telemetry HUD

**Files:**
- Modify: `src/components/ui/Dashboard.tsx` (feedback + warning overlay styling; keep store wiring and conditional logic intact)

**Interfaces:**
- Consumes: `useDrivingStore` selectors `isOffTrack`, `drivingFeedback` (unchanged).
- Produces: restyled HUD overlays. `Dashboard` signature unchanged.

- [ ] **Step 1: Switch the root HUD font to telemetry monospace**

In `src/components/ui/Dashboard.tsx`, change the outer container's `fontFamily`
(currently `"'Segoe UI', Roboto, sans-serif"`) to a monospace telemetry stack and
enable tabular numerals:

```tsx
        fontFamily: "'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        fontVariantNumeric: 'tabular-nums',
```

- [ ] **Step 2: Restyle the feedback box (the `drivingFeedback` block)**

Replace the inner feedback `<div>`'s style object (currently `border: '2px solid #4ade80'`)
with a flat, square white-on-charcoal telemetry readout with a red accent rule:

```tsx
              <div style={{
                  backgroundColor: 'rgba(10, 10, 10, 0.88)',
                  border: '1px solid #e5e5e5',
                  borderLeft: '4px solid #dc2626',
                  borderRadius: '2px',
                  padding: '14px 28px',
                  color: '#f5f5f5',
                  fontSize: '18px',
                  fontWeight: 600,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap'
              }}>
                  {drivingFeedback}
              </div>
```

- [ ] **Step 3: Restyle the off-track warning (the `isOffTrack` block)**

Replace the warning's inner `<div style={{ fontSize: '24px', ... }}>` with a flat
red telemetry treatment (square, monospace, no glow):

```tsx
              <div style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '4px', border: '1px solid #dc2626', borderRadius: '2px', padding: '8px 18px', backgroundColor: 'rgba(20,20,20,0.7)', color: '#dc2626' }}>
                  WARNING
              </div>
```

Also change the small `OFF TRACK` subtitle color to neutral so the red stays the single accent:

```tsx
              <div style={{ fontSize: '13px', marginTop: '4px', color: '#a3a3a3', letterSpacing: '2px' }}>OFF TRACK</div>
```

(Update the warning block's outer `color: '#ef4444'` to `color: '#dc2626'` to match.)

- [ ] **Step 4: Build + type-check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Screenshot in-drive HUD**

Use the `run-driving` skill to enter a lesson, trigger an off-track warning and (if reachable) a feedback message, and capture the HUD. Confirm the monospace, square, white/red telemetry treatment reads as "Grid".

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/Dashboard.tsx
git commit -m "feat(v2-grid): restyle in-drive HUD as motorsport telemetry"
```

---

## Final verification (per spec, run once at the end)

- [ ] `npm run build` succeeds.
- [ ] `npm run type-check` clean; `npm run test:unit` green.
- [ ] `npm run lint` clean.
- [ ] `run-driving` screenshots of menu + a short drive captured and they read as the Grid look and weighty/grippy feel.
