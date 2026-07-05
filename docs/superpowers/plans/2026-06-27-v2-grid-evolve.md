# V2 · Grid — Evolve (HUD + steering polish + menu motion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the V2 Grid variant with an in-drive telemetry HUD, a strong speed-sensitive steering refinement (sim stability), and restrained menu entrance motion — all in the motorsport (charcoal + red, mono tabular) identity.

**Architecture:** Continue on the existing `V2-grid/feature/look-and-feel` branch (worktree `.worktrees/v2-grid`, PR #28). Three independent tasks: physics (`carPhysics.ts`, TDD), HUD (`Dashboard.tsx`), menu motion (`HomeScreen.tsx`). Reads live driving state from the existing Zustand store; no `Car.tsx` or store changes.

**Tech Stack:** Next.js 16, React 19, React Three Fiber, TypeScript 5, Tailwind 3.4, `node --test`.

## Global Constraints

- `src/lib/carPhysics.ts` functions keep their signatures and purity; only the math/constants change. Frame-rate independence (dt-scaling) must be preserved: any new factor must depend on inputs other than `dtScale`, leaving the per-`dtScale` ratio unchanged.
- HUD reads existing store fields only: `speed` (already a rounded km/h integer), `gear` (`"P"|"D"|"R"`), `throttle` and `brake` (0..1). Do NOT modify `src/lib/store.ts` or `src/components/simulation/Car.tsx`.
- No new gameplay systems, missions, or scoring. No lesson-copy, label, or language-selector changes.
- Stay in the Grid identity: charcoal base, a single red accent (`#dc2626`), white/neutral text, upright type, monospace tabular numerals, minimal glow, restrained motion.
- Node >=24. Unit tests: `npm run test:unit` (single file: `node --test tests/carPhysics.test.ts`).

---

### Task 1: Speed-sensitive steering damping (sim — strong)

Adds a `highSpeedDamping` knob that reduces turn authority as speed approaches
`maxSpeed`. Grid sets this HIGH for high-speed stability.

**Files:**
- Modify: `src/lib/carPhysics.ts` (`STEERING` object + `steeringYawDelta` body)
- Test: `tests/carPhysics.test.ts`

**Interfaces:**
- Consumes: existing `CAR_PHYSICS`, `STEERING`, `steeringYawDelta`.
- Produces: `STEERING.highSpeedDamping: number` (0..1); `steeringYawDelta` signature unchanged.

- [ ] **Step 1: Update the characterization test + add the damping test**

In `tests/carPhysics.test.ts`, REPLACE the existing test titled
`"steeringYawDelta is defined by the exported STEERING constants"` with the
damped version below, and ADD the second test after it:

```ts
test("steeringYawDelta is defined by the exported STEERING constants (incl. high-speed damping)", () => {
  const { maxSpeed, turnSpeed } = CAR_PHYSICS;
  const { curveExponent, boost, rateMultiplier, highSpeedDamping } = STEERING;
  const speed = maxSpeed, steering = 0.5, dir = 1, dt = 1;
  const curved = Math.sign(steering) * Math.pow(Math.abs(steering), curveExponent);
  const speedFrac = Math.min(Math.abs(speed) / maxSpeed, 1);
  const damp = 1 - highSpeedDamping * speedFrac;
  const expected = -(curved * boost * turnSpeed * (speed / maxSpeed) * rateMultiplier * dir) * damp * dt;
  assert.ok(
    Math.abs(steeringYawDelta(speed, steering, dir, dt) - expected) < 1e-12,
    "steeringYawDelta must be computed from the exported STEERING constants incl. damping",
  );
});

test("high-speed steering is damped below low-speed turn authority", () => {
  assert.ok(STEERING.highSpeedDamping > 0 && STEERING.highSpeedDamping < 1);
  const hi = CAR_PHYSICS.maxSpeed;        // speedFrac 1   -> damp = 1 - k
  const lo = CAR_PHYSICS.maxSpeed * 0.1;  // speedFrac 0.1 -> damp ~ 1 - 0.1k
  const yawHiPerFrac = Math.abs(steeringYawDelta(hi, 1, 1, 1)) / 1.0;
  const yawLoPerFrac = Math.abs(steeringYawDelta(lo, 1, 1, 1)) / 0.1;
  assert.ok(yawHiPerFrac < yawLoPerFrac, "high-speed turn authority must be damped below low-speed");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/carPhysics.test.ts`
Expected: FAIL — `highSpeedDamping` is `undefined`.

- [ ] **Step 3: Implement the knob + damping**

In `src/lib/carPhysics.ts`, add `highSpeedDamping` to `STEERING` (Grid sets it high) and apply it in `steeringYawDelta`:

```ts
export const STEERING = {
  curveExponent: 2.4,
  boost: 6.0,
  rateMultiplier: 3.0,
  highSpeedDamping: 0.5,
} as const;
```

```ts
export function steeringYawDelta(
  speed: number,
  steering: number,
  direction: number,
  dtScale: number,
): number {
  if (Math.abs(speed) <= 0.001) return 0;
  const { maxSpeed, turnSpeed } = CAR_PHYSICS;
  const { curveExponent, boost, rateMultiplier, highSpeedDamping } = STEERING;
  const curved = Math.sign(steering) * Math.pow(Math.abs(steering), curveExponent);
  const boosted = curved * boost;
  // Speed-sensitive steering: reduce turn authority as speed approaches maxSpeed
  // for high-speed stability. Depends only on speed (not dtScale), so the per-frame
  // dt scaling — and frame-rate independence — is unchanged.
  const speedFrac = Math.min(Math.abs(speed) / maxSpeed, 1);
  const damp = 1 - highSpeedDamping * speedFrac;
  return -(boosted * turnSpeed * (speed / maxSpeed) * rateMultiplier * direction) * damp * dtScale;
}
```

- [ ] **Step 4: Run full suite to verify green**

Run: `npm run test:unit`
Expected: PASS — new/updated tests pass; the frame-rate-independence ratio test still passes (`damp` depends only on speed, not `dtScale`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/carPhysics.ts tests/carPhysics.test.ts
git commit -m "feat(v2-grid): add strong speed-sensitive steering damping (sim stability)"
```

---

### Task 2: In-drive HUD — Grid telemetry strip

Adds a SPEED / GEAR / THROTTLE telemetry strip. Gated by build/type-check/lint;
screenshot deferred.

**Files:**
- Modify: `src/components/ui/Dashboard.tsx`

**Interfaces:**
- Consumes: `useDrivingStore` fields `speed`, `gear`, `throttle`, `brake`.
- Produces: a telemetry strip inside the existing overlay div. (The root div already
  sets `fontFamily` monospace and `fontVariantNumeric: 'tabular-nums'`, so the
  numerals render tabular automatically.)

- [ ] **Step 1: Read the new store fields**

In `Dashboard.tsx`, alongside the existing selectors, add:

```tsx
  const speed = useDrivingStore(state => state.speed);
  const gear = useDrivingStore(state => state.gear);
  const throttle = useDrivingStore(state => state.throttle);
  const brake = useDrivingStore(state => state.brake);
```

- [ ] **Step 2: Add the telemetry strip**

Insert this block just before the closing `<style jsx>` block of the root overlay
`<div>` (after the off-track warning block, still inside the root div):

```tsx
      {/* In-drive HUD: telemetry strip (Grid) */}
      <div style={{ position: 'absolute', bottom: '28px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '1px', background: '#dc2626', padding: '1px', borderRadius: '2px' }}>
        <div style={{ background: 'rgba(15,15,15,0.92)', padding: '8px 16px', minWidth: '120px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '2px', color: '#a3a3a3' }}>SPEED</div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: '#f5f5f5' }}>{speed}<span style={{ fontSize: '12px', color: '#a3a3a3', marginLeft: '4px' }}>KM/H</span></div>
        </div>
        <div style={{ background: 'rgba(15,15,15,0.92)', padding: '8px 16px', minWidth: '72px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '2px', color: '#a3a3a3' }}>GEAR</div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: '#dc2626' }}>{gear}</div>
        </div>
        <div style={{ background: 'rgba(15,15,15,0.92)', padding: '8px 16px', minWidth: '120px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '2px', color: '#a3a3a3' }}>THROTTLE</div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: brake > 0 ? '#dc2626' : '#f5f5f5' }}>{Math.round(throttle * 100)}<span style={{ fontSize: '12px', color: '#a3a3a3' }}>%</span></div>
        </div>
      </div>
```

- [ ] **Step 3: Build + type-check + lint**

Run: `npm run build` then `npm run type-check` then `npm run lint`
Expected: build succeeds, no type errors, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Dashboard.tsx
git commit -m "feat(v2-grid): add in-drive telemetry HUD (speed/gear/throttle)"
```

---

### Task 3: Menu entrance motion (restrained)

Adds a subtle staggered card entrance and a quiet title fade, in keeping with the
restrained motorsport identity (no glow, small movement). Gated by
build/type-check/lint; screenshot deferred.

**Files:**
- Modify: `src/components/ui/HomeScreen.tsx`

**Interfaces:**
- Consumes: existing `LESSONS`, store hooks (unchanged).
- Produces: animated overlay; `HomeScreen` signature unchanged.

- [ ] **Step 1: Make the component a client component**

Add `"use client";` as the very first line of `src/components/ui/HomeScreen.tsx`.

- [ ] **Step 2: Add a quiet title fade**

Add an entrance animation to the title `<h1>` via a `style` prop (keep its existing
classes exactly):

```tsx
            <h1 className="text-5xl font-semibold not-italic tracking-tight text-neutral-100" style={{ animation: "titleIn 0.4s ease-out both" }}>
              VIRTUAL <span className="text-red-600">DRIVING</span> SCHOOL
            </h1>
```

- [ ] **Step 3: Wrap each lesson card in a staggered-entrance wrapper**

Move `key` to a new wrapper `<div>` carrying a small entrance animation; keep the
existing flat `<button>` (with all its classes) as the child:

```tsx
            {LESSONS.map((lesson, index) => (
              <div
                key={lesson.id}
                className="flex-shrink-0"
                style={{ animation: "cardIn 0.3s ease-out both", animationDelay: `${index * 40}ms` }}
              >
                <button
                  onClick={() => handleSelectLesson(lesson.id)}
                  className="group relative flex-shrink-0 w-72 h-48 bg-neutral-900/80 rounded-sm border border-neutral-700 hover:border-red-600 transition-all duration-200 transform hover:-translate-y-1 snap-center overflow-hidden"
                >
```

Leave the button's inner content unchanged, and close the new `<div>` after the
existing `</button>`:

```tsx
                </button>
              </div>
            ))}
```

- [ ] **Step 4: Add the keyframes (small movement, no bounce)**

Just before the final closing `</div>` of the component's root element, add:

```tsx
      <style jsx>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes titleIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
```

- [ ] **Step 5: Build + type-check + lint**

Run: `npm run build` then `npm run type-check` then `npm run lint`
Expected: build succeeds, no type errors, 0 lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/HomeScreen.tsx
git commit -m "feat(v2-grid): add restrained staggered menu entrance"
```

---

## Final verification

- [ ] `npm run test:unit` green; `npm run build`, `npm run type-check`, `npm run lint` clean.
- [ ] Deferred to manual visual pass: drive a lesson to confirm the telemetry strip reads live speed/gear/throttle with tabular numerals; open the menu to confirm the restrained staggered entrance.
