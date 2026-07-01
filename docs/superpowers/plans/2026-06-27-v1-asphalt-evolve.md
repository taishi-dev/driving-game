# V1 · Asphalt — Evolve (HUD + steering polish + menu motion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the V1 Asphalt variant with an in-drive game HUD, a speed-sensitive steering refinement, and menu entrance motion — each in the arcade (neon-gold + electric-blue) identity.

**Architecture:** Continue on the existing `V1-asphalt/feature/look-and-feel` branch (worktree `.worktrees/v1-asphalt`, PR #27). Three independent tasks: physics (`carPhysics.ts`, TDD), HUD (`Dashboard.tsx`), menu motion (`HomeScreen.tsx`). Reads live driving state from the existing Zustand store; no `Car.tsx` or store changes.

**Tech Stack:** Next.js 16, React 19, React Three Fiber, TypeScript 5, Tailwind 3.4, `node --test`.

## Global Constraints

- `src/lib/carPhysics.ts` functions keep their signatures and purity; only the math/constants change. Frame-rate independence (dt-scaling) must be preserved: any new factor must depend on inputs other than `dtScale`, leaving the per-`dtScale` ratio unchanged.
- HUD reads existing store fields only: `speed` (already a rounded km/h integer), `gear` (`"P"|"D"|"R"`), `throttle` and `brake` (0..1). Do NOT modify `src/lib/store.ts` or `src/components/simulation/Car.tsx`.
- No new gameplay systems, missions, or scoring. No lesson-copy, label, or language-selector changes.
- Stay in the Asphalt identity: neon gold (`#fbbf24`) primary with an electric-blue (`#3b82f6` / `blue-500`) secondary accent, heavy glow, italics.
- Node >=24. Unit tests: `npm run test:unit` (single file: `node --test tests/carPhysics.test.ts`).

---

### Task 1: Speed-sensitive steering damping (arcade-light)

Adds a `highSpeedDamping` knob that gently reduces turn authority as speed
approaches `maxSpeed`. Arcade feel keeps this LOW so it stays twitchy.

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
  // steeringYawDelta already scales by speed/maxSpeed; divide it back out so we
  // compare only the damping term. Damping makes the high-speed value smaller.
  const yawHiPerFrac = Math.abs(steeringYawDelta(hi, 1, 1, 1)) / 1.0;
  const yawLoPerFrac = Math.abs(steeringYawDelta(lo, 1, 1, 1)) / 0.1;
  assert.ok(yawHiPerFrac < yawLoPerFrac, "high-speed turn authority must be damped below low-speed");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/carPhysics.test.ts`
Expected: FAIL — `highSpeedDamping` is `undefined` (NaN expected value) and the damping test references an undefined constant.

- [ ] **Step 3: Implement the knob + damping**

In `src/lib/carPhysics.ts`, add `highSpeedDamping` to `STEERING` (Asphalt keeps it low) and apply it in `steeringYawDelta`:

```ts
export const STEERING = {
  curveExponent: 1.4,
  boost: 10.0,
  rateMultiplier: 3.0,
  highSpeedDamping: 0.15,
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
Expected: PASS — new/updated tests pass; the existing frame-rate-independence ratio test (`oneStep20 === oneStep60 * 3`) still passes because `damp` depends only on speed, not `dtScale`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/carPhysics.ts tests/carPhysics.test.ts
git commit -m "feat(v1-asphalt): add light speed-sensitive steering damping"
```

---

### Task 2: In-drive HUD — Asphalt gauge

Adds a speed + gear + throttle cluster to the in-drive overlay. No automated UI
test harness exists (no RTL/jsdom), so this task is gated by build/type-check/lint;
the live screenshot is deferred to a manual visual pass.

**Files:**
- Modify: `src/components/ui/Dashboard.tsx`

**Interfaces:**
- Consumes: `useDrivingStore` fields `speed`, `gear`, `throttle`, `brake`.
- Produces: a HUD cluster inside the existing full-screen overlay div.

- [ ] **Step 1: Read the new store fields**

In `Dashboard.tsx`, alongside the existing `isOffTrack` / `drivingFeedback`
selectors, add:

```tsx
  const speed = useDrivingStore(state => state.speed);
  const gear = useDrivingStore(state => state.gear);
  const throttle = useDrivingStore(state => state.throttle);
  const brake = useDrivingStore(state => state.brake);
```

- [ ] **Step 2: Add the HUD cluster**

Insert this block just before the closing `<style jsx>` block of the root
overlay `<div>` (i.e. after the off-track warning block, still inside the root div):

```tsx
      {/* In-drive HUD: gear + speed + throttle (Asphalt gauge) */}
      <div style={{ position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'flex-end', gap: '24px' }}>
        <div style={{ fontStyle: 'italic', fontWeight: 900, fontSize: '28px', color: '#fbbf24', textShadow: '0 0 18px rgba(251,191,36,0.6)', border: '2px solid #fbbf24', borderRadius: '8px', padding: '4px 14px', background: 'rgba(0,0,0,0.5)' }}>
          {gear}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontStyle: 'italic', fontWeight: 900, fontSize: '64px', lineHeight: 1, color: '#ffffff', textShadow: '0 0 24px rgba(251,191,36,0.7)' }}>{speed}</span>
          <span style={{ fontStyle: 'italic', fontWeight: 800, fontSize: '18px', color: '#3b82f6', letterSpacing: '2px' }}>KM/H</span>
        </div>
        <div style={{ width: '120px', height: '10px', background: 'rgba(255,255,255,0.12)', borderRadius: '6px', overflow: 'hidden', alignSelf: 'center' }}>
          <div style={{ width: `${Math.round(throttle * 100)}%`, height: '100%', background: brake > 0 ? '#ef4444' : '#fbbf24', boxShadow: '0 0 14px rgba(251,191,36,0.7)', transition: 'width 0.08s linear' }} />
        </div>
      </div>
```

(The "KM/H" label is electric-blue to bring the secondary accent into the HUD.)

- [ ] **Step 3: Build + type-check + lint**

Run: `npm run build` then `npm run type-check` then `npm run lint`
Expected: build succeeds, no type errors, 0 lint errors (pre-existing warnings in unrelated files are acceptable).

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Dashboard.tsx
git commit -m "feat(v1-asphalt): add in-drive HUD (speed/gear/throttle gauge)"
```

---

### Task 3: Menu entrance motion + electric-blue accent

Adds a staggered card entrance and a title fade, and brings electric-blue back as
the Asphalt secondary accent. Gated by build/type-check/lint; screenshot deferred.

**Files:**
- Modify: `src/components/ui/HomeScreen.tsx`

**Interfaces:**
- Consumes: existing `LESSONS`, store hooks (unchanged).
- Produces: animated overlay; `HomeScreen` signature unchanged.

- [ ] **Step 1: Make the component a client component**

Add `"use client";` as the very first line of `src/components/ui/HomeScreen.tsx`
(required for the styled-jsx `<style jsx>` block added below).

- [ ] **Step 2: Re-add the electric-blue secondary accent**

In the title `<h1>`, make the third word electric-blue alongside the gold
`DRIVING`. Replace the title line so it reads:

```tsx
            <h1 className="text-6xl font-black italic tracking-tighter text-white drop-shadow-[0_0_18px_rgba(0,0,0,0.7)]" style={{ animation: "titleIn 0.5s ease-out both" }}>
              VIRTUAL{" "}
              <span className="text-amber-400 drop-shadow-[0_0_25px_rgba(251,191,36,0.85)]">DRIVING</span>{" "}
              <span className="text-blue-500 drop-shadow-[0_0_22px_rgba(59,130,246,0.8)]">SCHOOL</span>
            </h1>
```

And change the carousel status accent from amber to electric-blue:

```tsx
            <span className="text-sm text-blue-400 font-mono mb-1 animate-pulse">/ ALL SYSTEMS READY</span>
```

- [ ] **Step 3: Wrap each lesson card in a staggered-entrance wrapper**

Replace the `{LESSONS.map((lesson, index) => ( ... ))}` block's outer element:
move `key` to a new wrapper `<div>` that carries the entrance animation, and keep
the existing `<button>` (with all its classes and its `clipPath` style) as the
wrapper's child:

```tsx
            {LESSONS.map((lesson, index) => (
              <div
                key={lesson.id}
                className="flex-shrink-0"
                style={{ animation: "cardIn 0.4s ease-out both", animationDelay: `${index * 50}ms` }}
              >
                <button
                  onClick={() => handleSelectLesson(lesson.id)}
                  className="group relative flex-shrink-0 w-72 h-48 bg-slate-900/80 border-t-4 border-amber-500/60 hover:border-amber-400 transition-all duration-200 transform hover:-translate-y-3 hover:scale-[1.03] hover:shadow-[0_0_45px_rgba(251,191,36,0.5)] snap-center overflow-hidden"
                  style={{ clipPath: "polygon(0 0, 100% 0, 100% 85%, 90% 100%, 0 100%)" }}
                >
```

Leave the button's inner content unchanged, and close the new `<div>` after the
existing `</button>`:

```tsx
                </button>
              </div>
            ))}
```

- [ ] **Step 4: Add the keyframes**

Just before the final closing `</div>` of the component's root element, add:

```tsx
      <style jsx>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes titleIn {
          from { opacity: 0; transform: translateY(-12px); }
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
git commit -m "feat(v1-asphalt): staggered menu entrance + electric-blue accent"
```

---

## Final verification

- [ ] `npm run test:unit` green; `npm run build`, `npm run type-check`, `npm run lint` clean.
- [ ] Deferred to manual visual pass: drive a lesson to confirm the gold/blue HUD reads live speed/gear/throttle; open the menu to confirm staggered entrance and the gold+blue title.
