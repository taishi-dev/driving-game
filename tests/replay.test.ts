import { test } from "node:test";
import assert from "node:assert/strict";

import { sampleReplay, replayDurationMs } from "../src/lib/replay.ts";
import type { ReplayFrame } from "../src/lib/store.ts";

// Build a recording of a STRAIGHT motion (x grows linearly with time) sampled at
// a given frame rate over a fixed wall-clock duration. startMs offsets the
// absolute timestamps to prove only RELATIVE time matters.
function recordLinear({
  fps,
  durationMs,
  startMs = 0,
}: {
  fps: number;
  durationMs: number;
  startMs?: number;
}): ReplayFrame[] {
  // Compute by index so the endpoints are exact (i=0 -> 0ms, i=n -> durationMs),
  // mirroring how real integer Date.now() timestamps avoid accumulation drift.
  const n = Math.round((durationMs * fps) / 1000);
  const frames: ReplayFrame[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * durationMs;
    const x = (t / durationMs) * 100; // 0 -> 100 over the whole recording
    frames.push({
      timestamp: startMs + t,
      position: [x, 0, 0],
      rotation: [0, t / durationMs, 0],
      steering: 0,
      speed: 0,
      headRotation: { pitch: 0, yaw: 0, roll: 0 },
    });
  }
  return frames;
}

// THE BUG THIS GUARDS: replay used to play one recorded frame per render frame,
// so a recording made at a higher frame rate (more frames) played back longer.
// Sampling by ELAPSED TIME must return the same pose for the same elapsed time
// regardless of how densely the path was recorded.
test("same elapsed time yields the same pose regardless of recording frame rate", () => {
  const dense = recordLinear({ fps: 60, durationMs: 1000 });
  const sparse = recordLinear({ fps: 20, durationMs: 1000 });
  for (const e of [0, 100, 250, 500, 750, 1000]) {
    const a = sampleReplay(dense, e)!;
    const b = sampleReplay(sparse, e)!;
    assert.ok(
      Math.abs(a.position[0] - b.position[0]) < 1e-9,
      `x mismatch at ${e}ms: dense=${a.position[0]} sparse=${b.position[0]}`,
    );
  }
});

test("replay duration is the recorded wall-clock span, independent of frame count", () => {
  const dense = recordLinear({ fps: 60, durationMs: 1000 });
  const sparse = recordLinear({ fps: 20, durationMs: 1000 });
  assert.equal(replayDurationMs(dense), 1000);
  assert.equal(replayDurationMs(sparse), 1000);
});

test("interpolates linearly between two frames", () => {
  const frames: ReplayFrame[] = [
    { timestamp: 1000, position: [0, 0, 0], rotation: [0, 0, 0], steering: 0, speed: 0, headRotation: { pitch: 0, yaw: 0, roll: 0 } },
    { timestamp: 1100, position: [10, 0, 20], rotation: [0, 2, 0], steering: 0, speed: 0, headRotation: { pitch: 1, yaw: 4, roll: 0 } },
  ];
  // Absolute timestamps start at 1000; elapsed is RELATIVE, so 50ms = halfway.
  const s = sampleReplay(frames, 50)!;
  assert.ok(Math.abs(s.position[0] - 5) < 1e-9);
  assert.ok(Math.abs(s.position[2] - 10) < 1e-9);
  assert.ok(Math.abs(s.rotation[1] - 1) < 1e-9);
  assert.ok(Math.abs(s.headRotation.yaw - 2) < 1e-9);
  assert.equal(s.done, false);
});

test("clamps before the start to the first frame", () => {
  const frames = recordLinear({ fps: 30, durationMs: 500 });
  const s = sampleReplay(frames, -100)!;
  assert.equal(s.position[0], 0);
  assert.equal(s.done, false);
});

test("clamps past the end to the last frame and reports done", () => {
  const frames = recordLinear({ fps: 30, durationMs: 500 });
  const s = sampleReplay(frames, 999999)!;
  assert.ok(Math.abs(s.position[0] - 100) < 1e-9);
  assert.equal(s.done, true);
});

test("empty recording returns null", () => {
  assert.equal(sampleReplay([], 100), null);
});

test("binary search lands in the correct segment for many frames", () => {
  // 1000 frames over 10s; sampling at 3333ms must fall in the segment around x=33.33.
  const frames = recordLinear({ fps: 100, durationMs: 10000 });
  const s = sampleReplay(frames, 3333)!;
  assert.ok(Math.abs(s.position[0] - 33.33) < 0.1, `got x=${s.position[0]}`);
});
