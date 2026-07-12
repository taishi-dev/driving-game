// Populates the self-hosted MediaPipe vision assets under public/ so the app
// loads them SAME-ORIGIN instead of from external CDNs (see ADR 0004 / the
// vision-layer design). Runs in `predev`/`prebuild`.
//
//   - WASM runtime: copied from the INSTALLED @mediapipe/tasks-vision (so the
//     WASM version always matches the JS we bundle — fixes the old CDN skew).
//   - .task models: downloaded from the pinned Google Storage URLs and verified
//     against a SHA-256 so a corrupted/substituted download fails the build.
//
// Idempotent: a present file with the right size/hash is left untouched, so
// repeat dev/build runs don't re-download ~20 MB. public/mediapipe + public/models
// are gitignored.
//
// Pinning a new model: set its `sha256` to "" and run `node
// scripts/fetch-vision-assets.mjs` — it downloads, prints the computed hash, and
// you paste it back here.

import { mkdir, copyFile, readdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WASM_SRC = join(ROOT, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const WASM_DEST = join(ROOT, "public", "mediapipe", "wasm");
const MODELS_DEST = join(ROOT, "public", "models");

const MODEL_BASE = "https://storage.googleapis.com/mediapipe-models";
const MODELS = [
  {
    file: "face_landmarker.task",
    url: `${MODEL_BASE}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
    sha256: "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
  },
  {
    file: "hand_landmarker.task",
    url: `${MODEL_BASE}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
    sha256: "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1",
  },
  {
    file: "pose_landmarker_full.task",
    url: `${MODEL_BASE}/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
    sha256: "5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1",
  },
];

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function copyWasm() {
  if (!existsSync(WASM_SRC)) {
    throw new Error(`WASM source missing: ${WASM_SRC} — run \`npm install\` first`);
  }
  await mkdir(WASM_DEST, { recursive: true });
  const files = await readdir(WASM_SRC);
  for (const f of files) {
    await copyFile(join(WASM_SRC, f), join(WASM_DEST, f));
  }
  console.log(`[vision-assets] WASM: copied ${files.length} file(s) -> public/mediapipe/wasm`);
}

async function fetchModel(m) {
  await mkdir(MODELS_DEST, { recursive: true });
  const dest = join(MODELS_DEST, m.file);

  if (existsSync(dest) && m.sha256) {
    const have = sha256(await readFile(dest));
    if (have === m.sha256) {
      console.log(`[vision-assets] ${m.file}: present + hash OK, skip`);
      return;
    }
    console.log(`[vision-assets] ${m.file}: hash mismatch, re-downloading`);
  } else if (existsSync(dest) && !m.sha256) {
    console.log(`[vision-assets] ${m.file}: present (no pinned hash), skip`);
    return;
  }

  console.log(`[vision-assets] ${m.file}: downloading…`);
  const res = await fetch(m.url);
  if (!res.ok) throw new Error(`${m.file}: HTTP ${res.status} from ${m.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = sha256(buf);

  if (m.sha256 && hash !== m.sha256) {
    throw new Error(`${m.file}: SHA-256 mismatch\n  expected ${m.sha256}\n  got      ${hash}`);
  }
  await writeFile(dest, buf);
  const mb = (buf.length / 1048576).toFixed(2);
  if (!m.sha256) {
    console.log(`[vision-assets] ${m.file}: ${mb} MB — PIN THIS sha256: ${hash}`);
  } else {
    console.log(`[vision-assets] ${m.file}: ${mb} MB, hash verified`);
  }
}

async function main() {
  await copyWasm();
  for (const m of MODELS) await fetchModel(m);
  console.log("[vision-assets] done.");
}

main().catch((e) => {
  console.error("[vision-assets] FAILED:", e.message);
  process.exit(1);
});
