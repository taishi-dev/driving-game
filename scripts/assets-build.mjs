#!/usr/bin/env node
/**
 * assets:build — Compression pipeline for the engine-trial foundation branch.
 *
 * Reads source assets from assets/source/ (kept for reproducibility, not
 * shipped) and writes compressed outputs to public/models3d/.
 *
 * Hero car — two variants:
 *   CarConcept-draco.glb        — Draco geometry only (meshopt-free, PlayCanvas-safe)
 *   CarConcept-draco-webp.glb   — Full optimize: Draco + WebP textures + mesh simplify
 *
 * World kit (Quaternius Downtown City MegaKit Standard, CC0):
 *   public/models3d/world/quaternius/    — Draco + WebP per-piece GLBs (153 tiles)
 *   Textures capped at 1024px and compressed to WebP.
 *   Source: assets/source/world/quaternius/glTF/ (gitignored, 153 .gltf + .bin pairs)
 *           Textures are co-located in the glTF folder so relative URI paths resolve.
 *   License: CC0 1.0 Universal — Models by @Quaternius
 *            https://quaternius.itch.io/downtown-city-megakit
 *            https://creativecommons.org/publicdomain/zero/1.0/
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
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const SRC_CAR = join(root, 'assets/source/car/CarConcept.glb');
const OUT_DIR = join(root, 'public/models3d');
const OUT_DRACO = join(OUT_DIR, 'CarConcept-draco.glb');
const OUT_DRACO_WEBP = join(OUT_DIR, 'CarConcept-draco-webp.glb');

// Quaternius Downtown City MegaKit (Standard, CC0) — glTF source with co-located textures
const SRC_QUATERNIUS = join(root, 'assets/source/world/quaternius/glTF');
const OUT_QUATERNIUS = join(OUT_DIR, 'world/quaternius');

// Texture resolution cap for Quaternius pieces:
// Each GLB embeds its own copy of the shared textures (Godot glTF export style).
// 1024px keeps visual quality while staying within the 50 MB budget.
// Lower to 512 if total shipped size exceeds budget.
const QUATERNIUS_TEXTURE_SIZE = 512;

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + ' KB';
}

// Use the local @gltf-transform/cli entry point directly (avoids shell-wrapper
// issues on Windows where the .bin/ shim is a POSIX sh script).
const GLTF_TRANSFORM_CLI = join(root, 'node_modules/@gltf-transform/cli/bin/cli.js');

function run(args) {
  const quotedArgs = args.map(a => `"${a}"`).join(' ');
  const cmd = `node "${GLTF_TRANSFORM_CLI}" ${quotedArgs}`;
  console.log(`\n> gltf-transform ${args.join(' ')}`);
  execSync(cmd, { stdio: 'inherit', shell: true });
}

function size(path) {
  return existsSync(path) ? statSync(path).size : 0;
}

// Ensure output directories exist
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_QUATERNIUS, { recursive: true });

// ─────────────────────────────────────────────────────────────
// HERO CAR
// ─────────────────────────────────────────────────────────────
if (!existsSync(SRC_CAR)) {
  console.error(`ERROR: source asset not found: ${SRC_CAR}`);
  console.error(
    'Run: curl -L -o assets/source/car/CarConcept.glb \\\n' +
    '  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb"'
  );
  process.exit(1);
}

const srcSize = size(SRC_CAR);
console.log(`\n── Hero Car ──────────────────────────────────────────────────`);
console.log(`Source: CarConcept.glb  ${mb(srcSize)}`);

// Variant 1: Draco geometry only (PlayCanvas-safe, no meshopt)
run(['draco', SRC_CAR, OUT_DRACO]);
const dracoSize = size(OUT_DRACO);
console.log(`Output: CarConcept-draco.glb  ${mb(dracoSize)}  (Draco only)`);

// Variant 2: Full optimize — Draco + WebP textures + simplify
run([
  'optimize', SRC_CAR, OUT_DRACO_WEBP,
  '--compress', 'draco',
  '--texture-compress', 'webp',
]);
const dracoWebpSize = size(OUT_DRACO_WEBP);
console.log(`Output: CarConcept-draco-webp.glb  ${mb(dracoWebpSize)}  (Draco + WebP)`);

// ─────────────────────────────────────────────────────────────
// WORLD KIT — Quaternius Downtown City MegaKit (Standard, CC0)
// ─────────────────────────────────────────────────────────────
// Source: assets/source/world/quaternius/glTF/ (153 .gltf + .bin pairs)
// Textures are co-located in the glTF/ folder (copied from Textures/ at extract time)
// so relative URI paths in the .gltf files resolve correctly.
//
// Each output GLB is a self-contained piece (Draco + WebP + 1024px cap).
// The shared textures (29 unique PNGs) are re-embedded per piece — this is the
// standard glTF modular kit pattern. With 1024px cap the total stays under 50 MB.
// ─────────────────────────────────────────────────────────────
console.log(`\n── World Kit — Quaternius Downtown City MegaKit ─────────────`);

if (!existsSync(SRC_QUATERNIUS)) {
  console.error(`ERROR: Quaternius source not found: ${SRC_QUATERNIUS}`);
  console.error(
    'Extract the glTF (Godot) folder from the Quaternius Downtown City MegaKit zip into:\n' +
    '  assets/source/world/quaternius/glTF/\n' +
    'and copy all Textures/*.png files into that same glTF/ folder.'
  );
  process.exit(1);
}

const gltfFiles = readdirSync(SRC_QUATERNIUS)
  .filter(f => f.toLowerCase().endsWith('.gltf'))
  .sort();

console.log(`\nQuaternius: ${gltfFiles.length} gltf pieces from ${SRC_QUATERNIUS}`);
console.log(`Texture cap: ${QUATERNIUS_TEXTURE_SIZE}px (--texture-size ${QUATERNIUS_TEXTURE_SIZE})`);

let totalOutBytes = 0;

for (const filename of gltfFiles) {
  const srcPath = join(SRC_QUATERNIUS, filename);
  const outFilename = filename.replace(/\.gltf$/i, '.glb');
  const outPath = join(OUT_QUATERNIUS, outFilename);

  const srcBytes = size(srcPath);

  run([
    'optimize', srcPath, outPath,
    '--compress', 'draco',
    '--texture-compress', 'webp',
    '--texture-size', String(QUATERNIUS_TEXTURE_SIZE),
  ]);

  const outBytes = size(outPath);
  totalOutBytes += outBytes;
  console.log(`  ${filename} → ${outFilename}: ${kb(srcBytes)} → ${kb(outBytes)}`);
}

const worldTotalBytes = totalOutBytes;
console.log(`\nQuaternius world kit total: ${mb(worldTotalBytes)} (${gltfFiles.length} GLBs)`);

// ─────────────────────────────────────────────────────────────
// BUDGET CHECK
// ─────────────────────────────────────────────────────────────
const BUDGET_MB = 50;
const totalBytes = dracoSize + dracoWebpSize + worldTotalBytes;
const totalMB = totalBytes / 1024 / 1024;

console.log(`\n── Budget ────────────────────────────────────────────────────`);
console.log(`CarConcept-draco.glb:      ${mb(dracoSize)}`);
console.log(`CarConcept-draco-webp.glb: ${mb(dracoWebpSize)}`);
console.log(`World kit (Quaternius):    ${mb(worldTotalBytes)}  [${gltfFiles.length} pieces, ${QUATERNIUS_TEXTURE_SIZE}px WebP]`);
console.log(`─────────────────────────────────────────────────────────────`);
console.log(`Total shipped model size:  ${totalMB.toFixed(2)} MB (budget: ${BUDGET_MB} MB)`);

if (totalMB > BUDGET_MB) {
  console.error(`BUDGET EXCEEDED: ${totalMB.toFixed(2)} MB > ${BUDGET_MB} MB`);
  console.error(`Try lowering QUATERNIUS_TEXTURE_SIZE to 512 in scripts/assets-build.mjs`);
  process.exit(1);
} else {
  console.log(`Budget OK: ${totalMB.toFixed(2)} MB <= ${BUDGET_MB} MB`);
}

console.log('\nassets:build complete. Record sizes in assets/CREDITS.md.');
