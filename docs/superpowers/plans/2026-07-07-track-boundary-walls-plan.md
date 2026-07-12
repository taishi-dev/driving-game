# Implementation plan — track boundary walls

Spec: `docs/superpowers/specs/2026-07-07-track-boundary-walls-design.md`
Branch: `feat/track-boundary-walls` (off `fix/drive-camera-and-vision`)

## Global Constraints

- **Pure/engine split (hard rule):** all new geometry math lives in
  `src/lib/pcDriveLayout.ts` and must import NOTHING from `playcanvas` or the
  browser — it is exercised by `node --test`. Only `driveWorld.ts` touches the
  engine.
- **Wall line == off-track boundary:** wall membership MUST be computed from the
  existing `isOnRoad(x, z, margin, lesson)` predicate. Do not re-derive a
  separate boundary. Per-lesson: pass `lesson` through.
- **Exact constants** (exported from `pcDriveLayout.ts`):
  - `WALL_BUFFER = 1.25` (m) — negative margin fed to `isOnRoad` (i.e.
    `isOnRoad(x, z, -WALL_BUFFER, lesson)`), inflating the drivable region so the
    wall sits 1.25 m beyond the true road edge.
  - `WALL_CELL = 1` (m) — grid resolution.
  - `WALL_THICKNESS = 0.3` (m), `WALL_HEIGHT = 3` (m).
- **Wall boxes** use the existing `ColliderBox` interface. `cy = WALL_HEIGHT / 2`
  (base at ground Y=0), `sy = WALL_HEIGHT`. Along-run axis gets the merged length;
  cross axis gets `WALL_THICKNESS`.
- **Wall rigidbody** (in driveWorld): `{ type: "static", friction: 0.2, restitution: 0 }`,
  NO render component, pushed to `disposables`.
- **No scope creep:** do NOT change scoring, vision, physics tuning, building/prop
  placement, or PR #35's fixes. No visible barrier art.
- **Tests:** `node --test`. Do not weaken existing tests.

## Task 1 — `boundaryWalls` pure function + unit tests

**Files:** `src/lib/pcDriveLayout.ts` (add), `tests/pcBoundaryWalls.test.ts` (new).

Add exported constants `WALL_BUFFER`, `WALL_CELL`, `WALL_THICKNESS`, `WALL_HEIGHT`
and an exported function:

```ts
export function boundaryWalls(lesson?: string): ColliderBox[]
```

Algorithm (all axis-aligned, XZ plane):
1. Union bounding box of `[...roadColliders(), ...lessonCorridorColliders(lesson)]`
   (min/max of `cx ± sx/2`, `cz ± sz/2`), inflated on every side by
   `WALL_BUFFER + WALL_CELL` so the outer ring of cells is guaranteed off-road.
2. Snap the bbox to a `WALL_CELL` grid. For each cell center `(x, z)`, compute
   `on = isOnRoad(x, z, -WALL_BUFFER, lesson)`.
3. Boundary edges: for each on-road cell, for each of the 4 neighbors (±x, ±z)
   that is off-road (or outside the grid), record a wall segment of length
   `WALL_CELL` centered on the shared edge, oriented perpendicular to that
   neighbor direction. Track segments in two buckets: those running along X
   (varying x, fixed z) and those running along Z (varying z, fixed x).
4. Merge: within each bucket, group by the fixed coordinate and by which side
   (so an inner and outer wall on the same grid line don't merge), then greedily
   merge contiguous colinear unit segments into one `ColliderBox` spanning the run.
5. Emit each merged run as a `ColliderBox`: for an along-X run of length `L`
   centered at `(cx, cz)`: `sx = L`, `sz = WALL_THICKNESS`; for an along-Z run:
   `sx = WALL_THICKNESS`, `sz = L`. Both: `cy = WALL_HEIGHT/2`, `sy = WALL_HEIGHT`,
   `name = "wall_<axis>_<index>"`.

**Tests** (`tests/pcBoundaryWalls.test.ts`, pure — mirror `pcLessonCorridors.test.ts` style):
1. **No trap:** for the base road lesson (`undefined`/`"straight"`) AND the
   `"s-curve"` lesson, no returned wall box's XZ footprint contains any on-road
   sample point. Sample the drivable interior on a fine grid via
   `isOnRoad(x,z,0,lesson)`, and explicitly include the spawn point XZ `(0, 12)`
   (do NOT import `SPAWN_POS` — it is an engine `Vec3` in `driveScene.ts`; use the
   literal). Assert none lies inside any wall box.
2. **Containment (closed loop):** pick several interior on-road cells; for each,
   step outward in +x, −x, +z, −z in `WALL_CELL` steps until leaving the bbox;
   assert each of the 4 rays crosses at least one wall box's footprint.
3. **Bounded count:** `boundaryWalls("straight")` and `boundaryWalls("s-curve")`
   each return fewer than 200 boxes (proves run-merge collapses segments — the
   raw unmerged count would be many hundreds).
4. **Buffer honored:** a point 1.0 m outside the true road edge (inside
   `WALL_BUFFER`) is NOT inside any wall box (car may reach it); a point 3 m
   outside IS enclosed (a ray outward from the road center through it crosses a
   wall). Use the straight strip's known X edge (`±TILE_W/2 = ±3`) at a mid-Z on
   the straight to pick the test points.
5. **Per-lesson difference:** the union of wall extents for a corridor lesson
   (`s-curve`) differs from the base lesson (walls reach corridor points that are
   off the base road).

TDD: write tests first, then implement until green. Run `node --test tests/pcBoundaryWalls.test.ts` and the existing `tests/pcLessonCorridors.test.ts` (shares the layout module) — both must pass.

## Task 2 — Instantiate the walls in the drive world

**File:** `src/components/playcanvas/driveWorld.ts`.

Import `boundaryWalls` from `pcDriveLayout`. Immediately AFTER the existing
road-collider placement loop (the `for (const b of [...roadColliders(), ...lessonCorridorColliders(lesson)])`
block), add a loop over `boundaryWalls(lesson)` that, per box:
- `new Entity(b.name)`, `addComponent("collision", { type: "box", halfExtents: new Vec3(b.sx/2, b.sy/2, b.sz/2) })`,
  `addComponent("rigidbody", { type: "static", friction: 0.2, restitution: 0 })`,
  `setPosition(b.cx, b.cy, b.cz)`, `app.root.addChild(box)`, `disposables.push(box)`.
- NO render component (invisible).

Do not change `isOffTrack`, the road-collider loop, or anything else. Match the
existing surrounding style exactly.

**Verification:** `npm run lint` and `npx tsc --noEmit` (or the repo's type-check
script) clean. No unit test covers engine wiring directly; state in the report
that the change is a mechanical mirror of the existing collider loop and that
type-check passes. Do NOT attempt a headless GPU run (SwiftShader lies about
visuals; feel/visual verification is the human drive-test, tracked separately).

## Out of scope / follow-ups

- Feel-tuning `WALL_BUFFER` and wall friction happens after the human drive-test.
- Off-track scoring is unchanged (HUD-only, by spec).
