#!/usr/bin/env node
/**
 * assets:build — Compression pipeline for the engine-trial foundation branch.
 *
 * Reads source assets from assets/source/ (kept for reproducibility, not
 * shipped) and writes compressed outputs to public/models3d/.
 *
 * Produces two variants:
 *   CarConcept-draco.glb        — Draco geometry only (meshopt-free, PlayCanvas-safe)
 *   CarConcept-draco-webp.glb   — Full optimize: Draco + WebP textures + mesh simplify
 *
 * KTX2 (UASTC/ETC1S) texture compression is intentionally omitted here
 * because it requires the external `ktx` CLI from KTX-Software
 * (https://github.com/KhronosGroup/KTX-Software). Each engine branch (Phase B)
 * will install KTX-Software and run per-engine KTX2 compression as appropriate.
 * PlayCanvas uses ETC1S/Basis; Babylon.js and Cocos use UASTC.
 *
 * Usage: npm run assets:build
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const SRC_CAR = join(root, 'assets/source/car/CarConcept.glb');
const OUT_DIR = join(root, 'public/models3d');
const OUT_DRACO = join(OUT_DIR, 'CarConcept-draco.glb');
const OUT_DRACO_WEBP = join(OUT_DIR, 'CarConcept-draco-webp.glb');

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

// Use the local .bin/gltf-transform binary (works cross-platform)
const GLTF_TRANSFORM = join(root, 'node_modules/.bin/gltf-transform');

function run(args) {
  const cmd = `"${GLTF_TRANSFORM}" ${args.join(' ')}`;
  console.log(`\n> gltf-transform ${args.join(' ')}`);
  execSync(cmd, { stdio: 'inherit', shell: true });
}

function size(path) {
  return existsSync(path) ? statSync(path).size : 0;
}

// Ensure output directory exists
mkdirSync(OUT_DIR, { recursive: true });

if (!existsSync(SRC_CAR)) {
  console.error(`ERROR: source asset not found: ${SRC_CAR}`);
  console.error(
    'Run: curl -L -o assets/source/car/CarConcept.glb \\\n' +
    '  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb"'
  );
  process.exit(1);
}

const srcSize = size(SRC_CAR);
console.log(`Source: CarConcept.glb  ${mb(srcSize)}`);

// --- Variant 1: Draco geometry only (PlayCanvas-safe, no meshopt) ---
run(['draco', SRC_CAR, OUT_DRACO]);
const dracoSize = size(OUT_DRACO);
console.log(`Output: CarConcept-draco.glb  ${mb(dracoSize)}  (Draco only)`);

// --- Variant 2: Full optimize — Draco + WebP textures + simplify ---
run([
  'optimize', SRC_CAR, OUT_DRACO_WEBP,
  '--compress', 'draco',
  '--texture-compress', 'webp',
]);
const dracoWebpSize = size(OUT_DRACO_WEBP);
console.log(`Output: CarConcept-draco-webp.glb  ${mb(dracoWebpSize)}  (Draco + WebP)`);

// --- Budget check ---
const BUDGET_MB = 50;
const totalMB = (dracoSize + dracoWebpSize) / 1024 / 1024;
console.log(`\nTotal shipped model size: ${totalMB.toFixed(2)} MB (budget: ${BUDGET_MB} MB)`);
if (totalMB > BUDGET_MB) {
  console.error(`BUDGET EXCEEDED: ${totalMB.toFixed(2)} MB > ${BUDGET_MB} MB`);
  process.exit(1);
} else {
  console.log(`Budget OK: ${totalMB.toFixed(2)} MB <= ${BUDGET_MB} MB`);
}

console.log('\nassets:build complete. Record sizes in assets/CREDITS.md.');
