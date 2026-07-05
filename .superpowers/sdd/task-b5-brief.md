# Task B5 brief (verbatim from docs/superpowers/plans/2026-07-01-e1-babylon-full-port.md)

**B5 Drivable world (Quaternius) + coordinate contract.** Assemble the world from `public/models3d/world/quaternius/*.glb` using instancing/thin instances for repeated pieces [B-opt]; roads, buildings, water/pool, curbs, props; collision surfaces; off-track detection. Preserve the course coordinate system, scale, and checkpoint positions. Acceptance: a scripted known drive reproduces the same score as the current app (coordinate-contract check).

Note from controller: scoring/checkpoint evaluation does not exist yet on this branch (arrives B7), so the full "reproduces the same score" acceptance is deferred to B7; the B5-level check is the geometric coordinate contract (X=right, −Z=forward, Y=up, surface Y=0, straight-lesson checkpoint (0,0,−90) inside road strip |X|<3, Z∈[−204,24]).

This task's diff includes a post-hoc fix round; the fix round's requirements are in `.superpowers/sdd/b5-fix-brief.md` (same directory) — read that too, it is part of the spec for this review.
