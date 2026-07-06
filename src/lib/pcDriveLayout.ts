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

// ─── Lesson corridors (world build-out) ──────────────────────────────────────
// The s-curve and crank lessons run OFF the straight/turn roads (their frozen
// course geometry overlaps the straight area spatially), so their corridors are
// paved per-lesson: the world builder passes the current lesson and gets that
// lesson's extra colliders + visual patches. Off-track is HUD-only (scoring's
// deviation penalty replays the frozen course path), so corridors can never
// change a score.

/** Full corridor width (m) — a little wider than the tiled road for the curve. */
export const CORRIDOR_WIDTH = 7;

/** [x, z] pairs. */
export type PolyPoint = readonly [number, number];

/**
 * The frozen s-curve course (course.ts CatmullRom through (0,20) (0,0) (14,-30)
 * (-14,-60) (0,-100), centripetal, tension 0.5) sampled at 25 equally-spaced
 * points. BAKED DATA, not a re-implementation — the corridor test re-samples
 * the live course and fails if these drift off it.
 */
export const SCURVE_POLYLINE: readonly PolyPoint[] = [
  [0.0, 20.0],
  [-0.29, 14.23],
  [-0.68, 8.47],
  [-0.46, 2.7],
  [0.95, -2.87],
  [3.7, -7.95],
  [6.9, -12.76],
  [10.07, -17.59],
  [12.78, -22.68],
  [14.12, -28.27],
  [12.5, -33.72],
  [8.71, -38.05],
  [4.24, -41.72],
  [-0.41, -45.14],
  [-5.02, -48.62],
  [-9.35, -52.44],
  [-12.87, -57.0],
  [-14.32, -62.53],
  [-13.76, -68.26],
  [-12.08, -73.79],
  [-9.82, -79.1],
  [-7.28, -84.29],
  [-4.67, -89.44],
  [-2.17, -94.65],
  [0.0, -100.0],
];

/**
 * The frozen crank course's leg/corner skeleton (course.ts: r=4, xR=16, xL=-8;
 * straight in, jog right, down, jog left, straight out). Corners are cut as
 * simple diagonals — the corridor inflation covers the bezier arcs.
 */
export const CRANK_POLYLINE: readonly PolyPoint[] = [
  [0, 20],
  [0, -15],
  [4, -19],
  [12, -19],
  [16, -23],
  [16, -55],
  [12, -59],
  [-4, -59],
  [-8, -63],
  [-8, -100],
];

/** Subdivide so no segment exceeds `maxStep` (endpoints preserved). */
export function densifyPolyline(poly: readonly PolyPoint[], maxStep: number): PolyPoint[] {
  const out: PolyPoint[] = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / maxStep));
    for (let k = 0; k < n; k++) {
      out.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
    }
  }
  out.push(poly[poly.length - 1]);
  return out;
}

/**
 * One flat collider per polyline segment: the segment's AABB inflated by the
 * corridor width on both axes. Diagonal segments get generous cover — exactly
 * what a training-yard corridor wants.
 */
export function corridorColliders(
  poly: readonly PolyPoint[],
  width: number,
  name: string,
): ColliderBox[] {
  const cy = -COLLIDER_THICKNESS / 2;
  const boxes: ColliderBox[] = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[i + 1];
    boxes.push({
      name: `${name}_${i}`,
      cx: (x0 + x1) / 2,
      cy,
      cz: (z0 + z1) / 2,
      sx: Math.abs(x1 - x0) + width,
      sy: COLLIDER_THICKNESS,
      sz: Math.abs(z1 - z0) + width,
    });
  }
  return boxes;
}

/** Max corridor sampling step (m) — also the asphalt-patch spacing. */
const CORRIDOR_STEP = 6;

function lessonCorridor(lesson: string | undefined): PolyPoint[] | null {
  if (lesson === "s-curve") return densifyPolyline(SCURVE_POLYLINE, CORRIDOR_STEP);
  if (lesson === "crank") return densifyPolyline(CRANK_POLYLINE, CORRIDOR_STEP);
  return null;
}

/** Extra flat colliders for the lesson's corridor (empty for road lessons). */
export function lessonCorridorColliders(lesson: string | undefined): ColliderBox[] {
  const poly = lessonCorridor(lesson);
  return poly ? corridorColliders(poly, CORRIDOR_WIDTH, `corridor_${lesson}`) : [];
}

/**
 * Is world point (x,z) on the driveable road — i.e. inside the XZ footprint of
 * ANY road collider (optionally shrunk by `margin` so a car with its centre
 * exactly on the edge still counts as off)? This is the off-track predicate the
 * scene exposes: `offTrack = !isOnRoad(chassis.x, chassis.z, margin, lesson)`.
 */
export function isOnRoad(x: number, z: number, margin = 0, lesson?: string): boolean {
  const boxes = [...roadColliders(), ...lessonCorridorColliders(lesson)];
  for (const b of boxes) {
    const hx = b.sx / 2 - margin;
    const hz = b.sz / 2 - margin;
    if (x >= b.cx - hx && x <= b.cx + hx && z >= b.cz - hz && z <= b.cz + hz) {
      return true;
    }
  }
  return false;
}

// ─── Visual patches per lesson ───────────────────────────────────────────────

export interface WorldPatch {
  /**
   * asphalt = Street_Asphalt_9x9 ground patch; crosswalk = stripe decal across
   * the road; rail = one rail across the road; crossbuck = the X-sign post at
   * the roadside.
   */
  kind: "asphalt" | "crosswalk" | "rail" | "crossbuck";
  cx: number;
  cz: number;
  /** Yaw (degrees) about +Y; 0 faces the patch "along −Z". */
  yawDeg: number;
}

// ─── Buildings & props (lesson-filtered placement data) ──────────────────────
// The base city dressing was authored for the straight/turn roads; corridor
// lessons drive THROUGH parts of it (e.g. the building at (12,−30) stands on
// the s-curve apex). The world builder therefore takes its building/prop lists
// from here, filtered so nothing overlaps the active lesson's corridor.

export interface WorldItem {
  file: string;
  x: number;
  z: number;
  /** Yaw in radians (kept in the builder's convention). */
  rotY: number;
  /** Approximate footprint half-size (m) used for corridor clearance. */
  half: number;
}

const BASE_BUILDINGS: readonly WorldItem[] = [
  { file: "Building_Large_2.glb", x: -18, z: -30, rotY: 0, half: 8 },
  { file: "Building_Medium_2_001.glb", x: -18, z: -80, rotY: 0, half: 8 },
  { file: "Building_Small_1.glb", x: 12, z: -30, rotY: Math.PI, half: 8 },
  { file: "Building_Large_2.glb", x: 18, z: -80, rotY: Math.PI, half: 8 },
  { file: "Building_Small_1.glb", x: -14, z: -140, rotY: 0, half: 8 },
  { file: "Building_Medium_2_001.glb", x: 14, z: -140, rotY: Math.PI, half: 8 },
];

const BASE_PROPS: readonly WorldItem[] = [
  { file: "Prop_Bollard.glb", x: -4, z: 10, rotY: 0, half: 1 },
  { file: "Prop_Bollard.glb", x: -4, z: -10, rotY: 0, half: 1 },
  { file: "Prop_Bollard.glb", x: 4, z: 10, rotY: 0, half: 1 },
  { file: "Prop_Bollard.glb", x: 4, z: -10, rotY: 0, half: 1 },
  { file: "Prop_Planter_Single.glb", x: -5, z: -50, rotY: 0, half: 1 },
  { file: "Prop_Planter_Single.glb", x: 5, z: -50, rotY: 0, half: 1 },
  { file: "Prop_Planter_Single.glb", x: -5, z: -100, rotY: 0, half: 1 },
  { file: "Prop_Planter_Single.glb", x: 5, z: -100, rotY: 0, half: 1 },
];

function clearsCorridor(item: WorldItem, boxes: ColliderBox[]): boolean {
  return !boxes.some(
    (b) =>
      Math.abs(item.x - b.cx) < item.half + b.sx / 2 &&
      Math.abs(item.z - b.cz) < item.half + b.sz / 2,
  );
}

/** Buildings that don't stand in the lesson's corridor. */
export function lessonBuildings(lesson: string | undefined): WorldItem[] {
  const boxes = lessonCorridorColliders(lesson);
  return BASE_BUILDINGS.filter((b) => clearsCorridor(b, boxes));
}

/** Curbside props that don't stand in the lesson's corridor. */
export function lessonProps(lesson: string | undefined): WorldItem[] {
  const boxes = lessonCorridorColliders(lesson);
  return BASE_PROPS.filter((p) => clearsCorridor(p, boxes));
}

/** Yaw (deg) of the segment leaving point i (last point reuses the previous). */
function pointYaws(poly: readonly PolyPoint[]): number[] {
  const yaws: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[Math.min(i, poly.length - 2)];
    const b = poly[Math.min(i + 1, poly.length - 1)];
    yaws.push((Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI);
  }
  return yaws;
}

/**
 * The lesson's extra world visuals. Corridor lessons pave one asphalt patch per
 * densified point (oriented along the path); crosswalk / railroad / traffic-light
 * dress their frozen checkpoint locations (missions.ts) on the straight road.
 */
export function lessonWorldPatches(lesson: string | undefined): WorldPatch[] {
  const poly = lessonCorridor(lesson);
  if (poly) {
    const yaws = pointYaws(poly);
    return poly
      .map(([x, z], i): WorldPatch => ({ kind: "asphalt", cx: x, cz: z, yawDeg: yaws[i] }))
      .filter(
        // The corridor's first/last stretch runs ON the straight road (both
        // courses start at x=0); a patch there would Z-fight the road tiles.
        // The corridor COLLIDERS still cover those points, so on-road stays true.
        (p) => !isOnRoad(p.cx, p.cz, 2),
      );
  }
  if (lesson === "crosswalk") {
    // Safety checkpoint cw-safety-1 at (0,0,-30).
    return [{ kind: "crosswalk", cx: 0, cz: -30, yawDeg: 0 }];
  }
  if (lesson === "railroad-crossing") {
    // Stop checkpoint rr-stop-1 at (0,0,-60): rails just past the stop line,
    // one crossbuck per roadside.
    return [
      { kind: "rail", cx: 0, cz: -62, yawDeg: 0 },
      { kind: "rail", cx: 0, cz: -63.5, yawDeg: 0 },
      { kind: "crossbuck", cx: 4.2, cz: -60.5, yawDeg: 0 },
      { kind: "crossbuck", cx: -4.2, cz: -60.5, yawDeg: 0 },
    ];
  }
  if (lesson === "traffic-light") {
    // Pedestrian crossing just past the signal-1 stop line (z=-18).
    return [{ kind: "crosswalk", cx: 0, cz: -22, yawDeg: 0 }];
  }
  return [];
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
