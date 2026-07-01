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
 * World kit (Kenney City Kit Roads 2.0 + City Kit Commercial 2.1, CC0):
 *   public/models3d/world/roads/         — Draco + WebP per-tile GLBs
 *   public/models3d/world/buildings/     — Draco + WebP per-building GLBs
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

const SRC_ROADS = join(root, 'assets/source/world/kenney_city-kit-roads/Models/GLB format');
const SRC_BUILDINGS = join(root, 'assets/source/world/kenney_city-kit-commercial/Models/GLB format');
const OUT_ROADS = join(OUT_DIR, 'world/roads');
const OUT_BUILDINGS = join(OUT_DIR, 'world/buildings');

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
mkdirSync(OUT_ROADS, { recursive: true });
mkdirSync(OUT_BUILDINGS, { recursive: true });

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
// WORLD KIT — Kenney City Kit Roads + Commercial (CC0)
// ─────────────────────────────────────────────────────────────
console.log(`\n── World Kit ─────────────────────────────────────────────────`);

/**
 * Process all GLBs in srcDir → outDir using Draco + WebP optimize.
 * Returns total bytes of all output files.
 */
function processWorldKit(srcDir, outDir, label) {
  if (!existsSync(srcDir)) {
    console.error(`ERROR: world kit source not found: ${srcDir}`);
    console.error(`Download from https://kenney.nl/assets and place in assets/source/world/`);
    process.exit(1);
  }

  const glbFiles = readdirSync(srcDir)
    .filter(f => f.toLowerCase().endsWith('.glb'))
    .sort();

  console.log(`\n${label}: ${glbFiles.length} GLBs from ${srcDir}`);

  let totalSrcBytes = 0;
  let totalOutBytes = 0;

  for (const filename of glbFiles) {
    const srcPath = join(srcDir, filename);
    const outPath = join(outDir, filename);

    const srcBytes = size(srcPath);
    totalSrcBytes += srcBytes;

    run([
      'optimize', srcPath, outPath,
      '--compress', 'draco',
      '--texture-compress', 'webp',
    ]);

    const outBytes = size(outPath);
    totalOutBytes += outBytes;
    console.log(`  ${filename}: ${kb(srcBytes)} → ${kb(outBytes)}`);
  }

  console.log(`${label} total: ${kb(totalSrcBytes)} → ${kb(totalOutBytes)}`);
  return totalOutBytes;
}

const roadsBytes = processWorldKit(SRC_ROADS, OUT_ROADS, 'Roads (kenney_city-kit-roads 2.0)');
const buildingsBytes = processWorldKit(SRC_BUILDINGS, OUT_BUILDINGS, 'Buildings (kenney_city-kit-commercial 2.1)');

const worldTotalBytes = roadsBytes + buildingsBytes;
console.log(`\nWorld kit shipped total: ${mb(worldTotalBytes)}`);

// ─────────────────────────────────────────────────────────────
// BUDGET CHECK
// ─────────────────────────────────────────────────────────────
const BUDGET_MB = 50;
const totalBytes = dracoSize + dracoWebpSize + worldTotalBytes;
const totalMB = totalBytes / 1024 / 1024;

console.log(`\n── Budget ────────────────────────────────────────────────────`);
console.log(`CarConcept-draco.glb:     ${mb(dracoSize)}`);
console.log(`CarConcept-draco-webp.glb: ${mb(dracoWebpSize)}`);
console.log(`World kit (roads):         ${mb(roadsBytes)}`);
console.log(`World kit (buildings):     ${mb(buildingsBytes)}`);
console.log(`─────────────────────────────────────────────────────────────`);
console.log(`Total shipped model size:  ${totalMB.toFixed(2)} MB (budget: ${BUDGET_MB} MB)`);

if (totalMB > BUDGET_MB) {
  console.error(`BUDGET EXCEEDED: ${totalMB.toFixed(2)} MB > ${BUDGET_MB} MB`);
  process.exit(1);
} else {
  console.log(`Budget OK: ${totalMB.toFixed(2)} MB <= ${BUDGET_MB} MB`);
}

console.log('\nassets:build complete. Record sizes in assets/CREDITS.md.');
