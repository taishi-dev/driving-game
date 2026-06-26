import type { ReplayFrame } from "./store";

export interface ReplaySample {
  position: [number, number, number];
  rotation: [number, number, number];
  headRotation: { pitch: number; yaw: number; roll: number };
  /** True once elapsed time has reached/passed the last recorded frame. */
  done: boolean;
}

const ZERO_HEAD = { pitch: 0, yaw: 0, roll: 0 };

/** Total recorded wall-clock span (ms) — first to last frame timestamp. */
export function replayDurationMs(frames: ReplayFrame[]): number {
  if (frames.length < 2) return 0;
  return frames[frames.length - 1].timestamp - frames[0].timestamp;
}

function frameSample(f: ReplayFrame, done: boolean): ReplaySample {
  return {
    position: [...f.position],
    rotation: [...f.rotation],
    headRotation: { ...(f.headRotation ?? ZERO_HEAD) },
    done,
  };
}

/**
 * Sample the recording at `elapsedMs` of real time since playback started,
 * interpolating between the two frames that bracket that time. Returns null for
 * an empty recording. This makes playback duration depend on the recorded
 * timestamps, not the playback (or recording) frame rate.
 */
export function sampleReplay(frames: ReplayFrame[], elapsedMs: number): ReplaySample | null {
  if (frames.length === 0) return null;
  const t0 = frames[0].timestamp;
  const totalMs = frames[frames.length - 1].timestamp - t0;

  if (elapsedMs <= 0) return frameSample(frames[0], totalMs <= 0);
  if (elapsedMs >= totalMs) return frameSample(frames[frames.length - 1], true);

  // Binary search for the segment [lo, lo+1] with rel(lo) <= elapsedMs < rel(lo+1).
  // Timestamps are recorded monotonically, so relative time is sorted ascending.
  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].timestamp - t0 <= elapsedMs) lo = mid;
    else hi = mid;
  }

  const a = frames[lo];
  const b = frames[lo + 1];
  const span = b.timestamp - a.timestamp;
  const f = span > 0 ? (elapsedMs - (a.timestamp - t0)) / span : 0;
  const lerp = (x: number, y: number) => x + (y - x) * f;
  const ha = a.headRotation ?? ZERO_HEAD;
  const hb = b.headRotation ?? ZERO_HEAD;

  return {
    position: [lerp(a.position[0], b.position[0]), lerp(a.position[1], b.position[1]), lerp(a.position[2], b.position[2])],
    rotation: [lerp(a.rotation[0], b.rotation[0]), lerp(a.rotation[1], b.rotation[1]), lerp(a.rotation[2], b.rotation[2])],
    headRotation: { pitch: lerp(ha.pitch, hb.pitch), yaw: lerp(ha.yaw, hb.yaw), roll: lerp(ha.roll, hb.roll) },
    done: false,
  };
}
