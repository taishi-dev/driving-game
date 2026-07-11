import { test } from "node:test";
import assert from "node:assert/strict";

import {
  VISION_ASSET_PATHS,
  VISION_WASM_PATH,
  VISION_MODEL_PATHS,
  withDelegateFallback,
} from "../src/lib/vision/modelSources.ts";

// ── Availability guard: assets must be same-origin, never an external CDN ──

test("every vision asset path is same-origin (no external host)", () => {
  assert.ok(VISION_ASSET_PATHS.length >= 4);
  for (const p of VISION_ASSET_PATHS) {
    assert.ok(p.startsWith("/"), `not same-origin relative: ${p}`);
    assert.doesNotMatch(p, /^https?:\/\//, `external URL leaked back in: ${p}`);
    assert.doesNotMatch(p, /cdn\.jsdelivr\.net|storage\.googleapis\.com|unpkg\.com/, `known CDN host: ${p}`);
  }
});

test("wasm + all three model paths are present", () => {
  assert.equal(VISION_WASM_PATH, "/mediapipe/wasm");
  assert.deepEqual(Object.keys(VISION_MODEL_PATHS).sort(), ["face", "hand", "pose"]);
});

// ── Delegate fallback (the failure path for the resilient loader) ──

test("withDelegateFallback: GPU succeeds -> no CPU attempt, no onFallback", async () => {
  const calls: string[] = [];
  let fellBack = false;
  const r = await withDelegateFallback(
    async (d) => { calls.push(d); return `made-on-${d}`; },
    () => { fellBack = true; },
  );
  assert.equal(r, "made-on-GPU");
  assert.deepEqual(calls, ["GPU"]);
  assert.equal(fellBack, false);
});

test("withDelegateFallback: GPU throws -> retries CPU, fires onFallback", async () => {
  const calls: string[] = [];
  let fallbackErr: unknown = null;
  const r = await withDelegateFallback(
    async (d) => {
      calls.push(d);
      if (d === "GPU") throw new Error("gpu unsupported");
      return `made-on-${d}`;
    },
    (e) => { fallbackErr = e; },
  );
  assert.equal(r, "made-on-CPU");
  assert.deepEqual(calls, ["GPU", "CPU"]);
  assert.ok(fallbackErr instanceof Error);
});

test("withDelegateFallback: both throw -> rejects (caller shows error overlay)", async () => {
  await assert.rejects(
    withDelegateFallback(async (d) => { throw new Error(`fail-${d}`); }),
    /fail-CPU/,
  );
});
