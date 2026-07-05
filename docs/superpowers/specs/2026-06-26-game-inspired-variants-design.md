# Game-Inspired UI/UX + Driving-Feel Variants — Design

**Date:** 2026-06-26
**Status:** Approved (design); pending spec review

## Goal

Produce three independent, comparable variants of the Virtual Driving School
front end, each rebuilding the **visual/UX design language** *and* the **driving
feel** of a reference racing game in our own stack. The variants exist so we can
A/B them and pick a winner; only the winner gets merged to `main`.

The reference games (Asphalt Legends, Grid Autosport, Need for Speed) run on a
completely different stack (native mobile / Unity / proprietary engines). We do
**not** reuse any of their code — only their look and handling feel, rebuilt
natively in **Next.js + React + React Three Fiber (TypeScript)**.

## Non-goals (YAGNI)

- No runtime theme/variant switcher. Variants are branches, not a dropdown.
- No shared theme-engine or physics-preset abstraction up front. Each branch
  owns its look and feel directly. Commonality is extracted *after* a winner
  emerges, not before.
- No `develop`/`release/*`/`main` branches per variant yet. Those are created
  per variant only once there is something to stabilize.
- No new gameplay systems, missions, or scoring changes. Variants restyle and
  retune existing behavior; they do not add features.

## Approach

**Direct per-branch restyle + retune.** Each variant is one `feature/*` branch
off `main` that edits the same set of files with its own values. You compare by
checking out a branch and running it.

Rejected alternatives:
- *Runtime theme switcher* — more code for a goal that branches already serve;
  the user explicitly wants separate branches to compare.
- *Extract a shared theme/preset layer first* — that is a refactor on `main`
  before any variant exists. Lean start beats premature abstraction.

## The three variants

### V1 · Asphalt (arcade)
- **Look:** neon gold + electric blue, heavy glow, fast motion, aggressive
  italics, high-energy "nitro" feel. Builds on the existing angular card style
  but amplifies glow and motion.
- **Feel:** loose and fast. Higher `maxSpeed`, higher `acceleration`, lower
  `friction` (glidey coast), responsive/twitchy steering (sharper curve).

### V2 · Grid (sim)
- **Look:** restrained motorsport. Charcoal base, white/red accents,
  telemetry-style HUD with tabular numerals, minimal glow, mostly upright type.
- **Feel:** weighty and grippy. Slower `acceleration` build, moderate
  `maxSpeed`, higher `friction` (engine-brake feel), softer/progressive steering
  (less twitch, more grip).

### V3 · NFS (street)
- **Look:** dark urban night, vibrant cyan/magenta neon, gritty drift-culture
  boldness. Darker than Asphalt, more saturated accents.
- **Feel:** slidey / drift-leaning. Low `friction`, eager turn-in, steering
  curve tuned toward oversteer; mid `maxSpeed`/`acceleration`.

## Files each variant touches

| Concern | File | Change |
|---|---|---|
| Menu look | `src/components/ui/HomeScreen.tsx` | Colors, typography, card style, motion |
| HUD look | `src/components/ui/Dashboard.tsx` | Restyle in-drive HUD to match the variant |
| Driving feel | `src/lib/carPhysics.ts` | Set `CAR_PHYSICS` values; lift inline steering literals (`1.8` exponent, `8.0` boost, `0.05` brake rate) into named constants so each variant tunes them cleanly |

`carPhysics.ts` functions keep their signatures and purity — only constant values
change — so the existing unit tests and frame-rate-independence guarantees hold.

## Branch strategy

Three feature branches off `main`, one "look-and-feel" feature per variant to
start:

```
V1-asphalt/feature/look-and-feel
V2-grid/feature/look-and-feel
V3-nfs/feature/look-and-feel
```

Naming convention for later finer-grained work: `V{n}-{game}/{flow}/{topic}`,
e.g. `V1-asphalt/feature/steering`, `V3-nfs/develop/handling`. Split into
per-topic features only if a variant needs finer iteration.

## Verification (per branch)

1. `npm run build` succeeds.
2. Type-check clean; existing unit tests stay green (physics signatures
   unchanged).
3. Lint clean.
4. Screenshot the menu and run a short drive via the `run-driving` skill to
   eyeball look and feel.

## Open questions

None blocking. Exact per-variant constant values (e.g. how much higher Asphalt's
`maxSpeed` is) are tuning decisions made and verified during implementation of
each branch, not fixed in this spec.
