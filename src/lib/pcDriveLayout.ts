/**
 * P5 — pure layout math + coordinate contract for the PlayCanvas drive world.
 *
 * Rewritten for the E2 branch (D1.a: engine-coupled logic is rebuilt per branch,
 * NOT copied from E1's `driveLayout.ts`), but it derives the SAME coordinate
 * contract so a known replay reproduces the same score across engines. It holds
 * the constants that DRIVE tile + collider placement in
 * `src/components/playcanvas/driveWorld.ts` plus the on-road / off-track math —
 * all free of any `playcanvas` / browser imports so `node --test` can exercise
 * the contract without the 3D engine.
 *
 * The world builder imports the SAME constants AND the SAME `roadColliders()`
 * list from here, so the checks below fail FOR REAL if the layout drifts (the
 * naive version compares hardcoded literals to hardcoded literals and can never
 * fail).
 *
 * Coordinate contract: X = right, −Z = forward (course runs toward −Z), Y = up,
 * road surface flat at Y = 0.
 */

// ─── Tile dimensions (Quaternius urban pack, verified in E1) ─────────────────
/** Street_2Lane tile: 6 m wide (X). */
export const TILE_W = 6;
/** Street_2Lane tile: 12 m long (Z). */
export const TILE_L = 12;
/** Road surface Y. */
export const ROAD_Y = 0;

// ─── Straight-road layout ────────────────────────────────────────────────────
/** First (nearest, +Z) straight-tile centre. Tiles step −TILE_L from here. */
export const STRAIGHT_START_Z = 18;
/** Number of straight tiles laid end-to-end toward −Z. */
export const STRAIGHT_TILE_COUNT = 19;

/**
 * course.ts "straight" lesson runs (0,0,20) → (0,0,−200); its midpoint
 * checkpoint is (0,0,−90). The contract verifies this lands on the road.
 */
export const STRAIGHT_CHECKPOINT = { x: 0, y: 0, z: -90 } as const;

// ─── Turn-stub layout (mirrors the E1 connector-stub placement) ──────────────
/** Z of the horizontal turn strips' centreline. */
export const TURN_Z = -38;
/** Outer X reach of the left/right turn strips from the junction. */
export const TURN_REACH = 60;
/** Inner X where a turn strip begins (past the straight strip's edge). */
export const TURN_INNER_X = 8;

export interface RoadStrip {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  y: number;
}

/**
 * Axis-aligned bounds of the straight road strip, DERIVED from the same
 * constants that place the tiles: tile i is centred at
 * `STRAIGHT_START_Z − i*TILE_L`, spanning ± TILE_L/2; the strip is TILE_W wide,
 * centred on X = 0. Computed (not hardcoded), so the contract below fails if any
 * of those constants change.
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

/**
 * A flat collider box (the wheel-ray + physics ground surface). Placement is in
 * WORLD coordinates: centre (cx,cy,cz) and full extents (sx,sy,sz). The top face
 * sits at Y=0 (cy = −sy/2) so the driving surface is exactly the contract's Y=0
 * — see `driveWorld.ts`, which places these AND uses them for physics.
 *
 * The E1 hard lesson is baked in here: the collider is FLAT (not the crowned
 * visual tile), and the world builder gives ONLY these boxes a collision
 * component, so wheel rays never hit the cambered asphalt art.
 */
export interface ColliderBox {
  /** Human label (for debugging / naming the entity). */
  readonly name: string;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
}

const COLLIDER_THICKNESS = 0.5;

/**
 * The flat road colliders, DERIVED from the layout constants. The straight
 * collider spans the exact straight strip; the two turn colliders reach out
 * along ±X at TURN_Z; two corner fillers bridge the straight edge to the turn
 * strips so wheel rays never drop into a junction gap mid-turn.
 */
export function roadColliders(): ColliderBox[] {
  const strip = straightRoadStrip();
  const straightLen = strip.zMax - strip.zMin;
  const straightMidZ = (strip.zMax + strip.zMin) / 2;
  const cy = -COLLIDER_THICKNESS / 2; // top face at Y=0

  // Turn strips run from the junction (near X=0) out to ±TURN_REACH at TURN_Z.
  const turnCenterX = (TURN_REACH + TURN_INNER_X) / 2; // e.g. (60+8)/2 = 34
  const turnSpanX = TURN_REACH - TURN_INNER_X; // e.g. 60-8 = 52

  // Corner fillers bridge |X|∈[3,9] around the junction at TURN_Z..near straight.
  const fillerCenterX = (TILE_W / 2 + TURN_INNER_X + 1) / 2; // ~6
  const fillerSpanX = TURN_INNER_X + 1 - TILE_W / 2; // ~6
  const fillerZ = TURN_Z + TILE_W / 2 + 2.5; // toward the straight
  const fillerSpanZ = 11;

  return [
    {
      name: "road_collider_straight",
      cx: 0,
      cy,
      cz: straightMidZ,
      sx: TILE_W,
      sy: COLLIDER_THICKNESS,
      sz: straightLen,
    },
    {
      name: "road_collider_turn_left",
      cx: -turnCenterX,
      cy,
      cz: TURN_Z,
      sx: turnSpanX,
      sy: COLLIDER_THICKNESS,
      sz: TILE_W,
    },
    {
      name: "road_collider_turn_right",
      cx: turnCenterX,
      cy,
      cz: TURN_Z,
      sx: turnSpanX,
      sy: COLLIDER_THICKNESS,
      sz: TILE_W,
    },
    {
      name: "road_collider_join_left",
      cx: -fillerCenterX,
      cy,
      cz: fillerZ,
      sx: fillerSpanX,
      sy: COLLIDER_THICKNESS,
      sz: fillerSpanZ,
    },
    {
      name: "road_collider_join_right",
      cx: fillerCenterX,
      cy,
      cz: fillerZ,
      sx: fillerSpanX,
      sy: COLLIDER_THICKNESS,
      sz: fillerSpanZ,
    },
  ];
}

/**
 * Is world point (x,z) on the driveable road — i.e. inside the XZ footprint of
 * ANY road collider (optionally shrunk by `margin` so a car with its centre
 * exactly on the edge still counts as off)? This is the off-track predicate the
 * scene exposes: `offTrack = !isOnRoad(chassis.x, chassis.z)`.
 */
export function isOnRoad(x: number, z: number, margin = 0): boolean {
  for (const b of roadColliders()) {
    const hx = b.sx / 2 - margin;
    const hz = b.sz / 2 - margin;
    if (x >= b.cx - hx && x <= b.cx + hx && z >= b.cz - hz && z <= b.cz + hz) {
      return true;
    }
  }
  return false;
}

export interface CoordinateContract {
  ok: boolean;
  checkpoint: { x: number; y: number; z: number };
  strip: RoadStrip;
  onRoad: boolean;
  reason?: string;
}

/**
 * Verify the given checkpoint (default: the straight-lesson midpoint) falls
 * inside the derived straight road strip AND on a road collider. Pure — returns
 * a result object rather than throwing so it is trivially testable; the builder
 * turns `!ok` into a thrown error.
 */
export function checkCoordinateContract(
  checkpoint: { x: number; y: number; z: number } = STRAIGHT_CHECKPOINT,
): CoordinateContract {
  const strip = straightRoadStrip();
  const inX = Math.abs(checkpoint.x) <= strip.xMax;
  const inZ = checkpoint.z >= strip.zMin && checkpoint.z <= strip.zMax;
  const inY = Math.abs(checkpoint.y - strip.y) < 1e-6;
  const onRoad = isOnRoad(checkpoint.x, checkpoint.z);
  const ok = inX && inZ && inY && onRoad;
  return {
    ok,
    checkpoint: { ...checkpoint },
    strip,
    onRoad,
    reason: ok
      ? undefined
      : `checkpoint (${checkpoint.x},${checkpoint.y},${checkpoint.z}) fails: ` +
        `inX=${inX} inZ=${inZ} inY=${inY} onRoad=${onRoad}; strip ` +
        `X∈[${strip.xMin},${strip.xMax}] Z∈[${strip.zMin},${strip.zMax}] Y=${strip.y}`,
  };
}
