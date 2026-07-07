# Track boundary walls — design

**Date:** 2026-07-07
**Status:** Approved (design), pending implementation plan
**Branch context:** follow-up on top of `fix/drive-camera-and-vision` (PR #35)

## Problem

The drive world's buildings and props are visuals with **no colliders**. Only the
flat road boxes (`roadColliders()` + `lessonCorridorColliders(lesson)`) and a
600 m flat ground plane have physics. The car is a dynamic raycast-vehicle
rigidbody, so it drives freely off the road onto open ground, straight *through*
where buildings visually sit. In a real learner drive recording this off-track
wandering is what disturbed the chase camera (PR #35 #2 leveled the *view* but
does not keep the car on the track).

`isOffTrack(x, z) = !isOnRoad(x, z, 0, lesson)` is already computed every frame
and reported to the store, but nothing acts on it physically.

## Goal

Keep the car physically on/near the drivable region with **hard invisible walls**
along the track boundary, so it can no longer reach the buildings — without
touching scoring, vision, physics tuning, or PR #35's four fixes.

## Non-goals

- No building/prop colliders (car must not be able to roam open ground at all).
- No change to off-track *scoring* (off-track is HUD-only and stays that way).
- No visible barrier art.

## Approach — grid-boundary extraction

Chosen over (B) per-box perimeter walls with overlap culling — messy interval
math for the diagonally-overlapping corridor boxes — and (C) outer bounding
rectangle only — too permissive, car still roams open ground inside the bbox.

Rasterize the drivable region onto a coarse grid over the union's bounding box
and emit wall segments on the boundary between on-road and off-road cells. Because
membership is tested with the **same `isOnRoad` predicate** the off-track HUD
uses, the physical wall line is the off-track boundary by construction — they can
never disagree. This matches the repo's existing "pure baked math + `node --test`"
style (cf. `corridorColliders`, `isOnRoad`).

### New pure function — `src/lib/pcDriveLayout.ts`

```
boundaryWalls(lesson?: string): ColliderBox[]
```

Algorithm:
1. Compute the union bounding box of `roadColliders() + lessonCorridorColliders(lesson)`,
   inflated by a small margin so the boundary has off-road cells on the outside.
2. Walk a grid at `WALL_CELL` (≈ 1 m) resolution. Mark each cell on/off road via
   `isOnRoad(cx, cz, -WALL_BUFFER, lesson)` — a **negative** margin, which inflates
   each road box outward so the wall sits `WALL_BUFFER` beyond the true road edge.
3. For each on-road cell, inspect its 4 axis neighbors; where a neighbor is
   off-road, record a unit wall segment on that shared edge (with orientation).
4. Merge colinear, adjacent segments into long wall boxes (greedy run-merge on
   each grid line) to keep entity count low — the straight road's two long sides
   collapse to ~2 walls each, etc.
5. Return `ColliderBox[]`: thickness `WALL_THICKNESS` (0.3 m), height `WALL_HEIGHT`
   (3 m, top well above the chassis), base at ground (`cy = WALL_HEIGHT/2`).

Constants (exported for tuning + tests):
- `WALL_BUFFER = 1.25` (m) — how far off the road edge the car may stray before
  the wall. Chosen so the car can still dip a wheel off (HUD off-track still
  fires) but is stopped well before any building; must stay smaller than the
  building corridor clearance so wall and building never touch.
- `WALL_CELL = 1` (m), `WALL_THICKNESS = 0.3` (m), `WALL_HEIGHT = 3` (m).

### Consumer — `src/components/playcanvas/driveWorld.ts`

Immediately after the existing road-collider placement loop, instantiate each
`boundaryWalls(lesson)` box as an **invisible** entity: `collision` (box) +
`rigidbody` `{ type: "static", friction: 0.2, restitution: 0 }`, positioned at
the box center, **no render component**, pushed to `disposables`.

- `restitution: 0` → dead stop, no bounce that could fling the car into a
  building on rebound.
- low `friction: 0.2` → the car slides along the wall rather than catching.

## Data flow

```
roadColliders()            ┐
lessonCorridorColliders() ─┤→ isOnRoad(x,z,-BUFFER,lesson) ─→ boundaryWalls(lesson)
                           ┘        (grid boundary scan + merge)
                                                                   │
driveWorld.buildDriveWorld(app,_,lesson) ──────────────────────────┘
   → invisible static collider boxes added to the scene + disposables
```

No new inputs; `boundaryWalls` depends only on the existing pure layout data and
is per-lesson (corridor lessons get walls hugging their corridor).

## Testing (`node --test`, pure — new `tests/pcBoundaryWalls.test.ts`)

1. **No trap:** no returned wall box's XZ footprint contains an on-road point —
   sample the drivable interior (incl. `SPAWN_POS`) and assert none is inside a
   wall. Guarantees the car is never clipped/trapped at spawn.
2. **Containment (closed loop):** from any interior on-road cell, stepping outward
   in +x, −x, +z, −z crosses at least one wall before leaving the bbox — proves
   the walls enclose the drivable region with no gap.
3. **Bounded count:** merged wall count is small (well under a stated cap), i.e.
   run-merge actually collapses colinear segments.
4. **Per-lesson:** a corridor lesson (e.g. s-curve) yields walls whose extent
   tracks its corridor, distinct from the base road lesson.
5. **Buffer honored:** a point just inside `WALL_BUFFER` of the road edge is still
   inside the walled region (not walled off); a point far outside is walled.

## Risks / mitigations

- **Entity count / perf:** unmerged boundary segments could be many; run-merge
  (step 4) + a bounded-count test keep it small. Walls are static, so no runtime
  cost beyond broadphase.
- **Stair-stepped diagonal walls** (corridor edges): invisible, and physically
  fine for containment — acceptable.
- **Junction concavity** (the T/plus road shape): the per-cell neighbor test
  handles concave regions naturally.

## Rollout

Its own commit; branch/PR decision at finish time (fits PR #35's feel-fix theme,
but is a discrete feature). No dependency on the steering-sensitivity tweak, which
ships separately on `fix/drive-camera-and-vision`.
