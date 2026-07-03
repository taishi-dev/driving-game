/**
 * B5 — pure layout math for the Quaternius drive world.
 *
 * This module holds the constants that DRIVE tile placement in
 * `src/components/babylon/driveWorld.ts` plus the coordinate-contract check that
 * verifies the world's road centreline aligns with the course.ts checkpoints.
 *
 * It is intentionally free of any @babylonjs / browser imports so the contract
 * can be exercised by `node --test` without dragging the 3D engine in. The
 * builder imports the SAME constants from here, so the check fails for real if
 * the layout ever drifts (the previous check compared hardcoded literals to
 * hardcoded literals and could never fail).
 */

// ─── Tile dimensions (measured / verified from Quaternius urban pack) ────────
/** Street_2Lane tile: 6 m wide (X). */
export const TILE_W = 6;
/** Street_2Lane tile: 12 m long (Z direction). */
export const TILE_L = 12;
/** Road surface Y. */
export const ROAD_Y = 0;

// ─── Straight-road layout ─────────────────────────────────────────────────────
/** First (nearest, +Z) straight-tile centre. Tiles step -TILE_L from here. */
export const STRAIGHT_START_Z = 18;
/** Number of straight tiles laid end-to-end down the course (toward -Z). */
export const STRAIGHT_TILE_COUNT = 19;

/**
 * course.ts "straight" lesson runs (0,0,20) → (0,0,-200); its midpoint
 * checkpoint is (0,0,-90). The contract verifies this lands on the road.
 */
export const STRAIGHT_CHECKPOINT = { x: 0, y: 0, z: -90 } as const;

export interface RoadStrip {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  y: number;
}

/**
 * Derive the axis-aligned bounds of the straight road strip from the SAME
 * constants that place the tiles. Tile i is centred at
 * `STRAIGHT_START_Z - i*TILE_L` and spans that centre ± TILE_L/2; the strip is
 * TILE_W wide, centred on X = 0. Because this is computed (not hardcoded), the
 * coordinate contract below fails if any of those constants change.
 */
export function straightRoadStrip(): RoadStrip {
  const halfW = TILE_W / 2;
  const firstCentre = STRAIGHT_START_Z;
  const lastCentre = STRAIGHT_START_Z - (STRAIGHT_TILE_COUNT - 1) * TILE_L;
  return {
    xMin: -halfW,
    xMax: halfW,
    zMin: lastCentre - TILE_L / 2,
    zMax: firstCentre + TILE_L / 2,
    y: ROAD_Y,
  };
}

export interface CoordinateContract {
  ok: boolean;
  checkpoint: { x: number; y: number; z: number };
  strip: RoadStrip;
  reason?: string;
}

/**
 * Verify that the given checkpoint (default: the straight-lesson midpoint) falls
 * inside the derived straight road strip. Pure — returns a result object rather
 * than throwing so it is trivially testable; the builder turns `!ok` into a
 * thrown error.
 */
export function checkCoordinateContract(
  checkpoint: { x: number; y: number; z: number } = STRAIGHT_CHECKPOINT,
): CoordinateContract {
  const strip = straightRoadStrip();
  const inX = Math.abs(checkpoint.x) <= strip.xMax;
  const inZ = checkpoint.z >= strip.zMin && checkpoint.z <= strip.zMax;
  const inY = Math.abs(checkpoint.y - strip.y) < 1e-6;
  const ok = inX && inZ && inY;
  return {
    ok,
    checkpoint: { ...checkpoint },
    strip,
    reason: ok
      ? undefined
      : `checkpoint (${checkpoint.x},${checkpoint.y},${checkpoint.z}) is outside ` +
        `road strip X∈[${strip.xMin},${strip.xMax}], Z∈[${strip.zMin},${strip.zMax}], ` +
        `Y=${strip.y}`,
  };
}
