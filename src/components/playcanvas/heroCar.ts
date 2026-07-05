import {
  Application,
  Asset,
  BoundingBox,
  ContainerResource,
  Entity,
  RenderComponent,
  StandardMaterial,
  dracoInitialize,
} from "playcanvas";
import { heroCarUniformScale } from "@/lib/pcHeroCarFit";

/** Shipped Draco+WebP hero car (see assets/CREDITS.md). */
export const HERO_CAR_URL = "/models3d/CarConcept-draco-webp.glb";

/** Local Draco decoder (no runtime CDN). Apache-2.0; see public/lib/draco/. */
const DRACO_GLUE_URL = "/lib/draco/draco_wasm_wrapper.js";
const DRACO_WASM_URL = "/lib/draco/draco_decoder.wasm";

let dracoConfigured = false;

/**
 * Configure PlayCanvas's Draco decoder once, pointing at the locally-shipped
 * decoder (glue JS + wasm). `dracoInitialize` is itself idempotent (guards on
 * an internal job queue), and this flag avoids re-posting the config under
 * React strict-mode double-mount. [C-draco]
 */
export function ensureDraco(): void {
  if (dracoConfigured) return;
  dracoInitialize({
    jsUrl: DRACO_GLUE_URL,
    wasmUrl: DRACO_WASM_URL,
    numWorkers: 1,
  });
  dracoConfigured = true;
}

export interface HeroCarHandle {
  /** The instantiated car entity, or null until the GLB finishes loading. */
  getEntity(): Entity | null;
  dispose(): void;
}

/**
 * Mount the loaded car on a vehicle chassis instead of free-standing in the
 * showroom. The visual is uniformly scaled to the chassis footprint
 * (`pcHeroCarFit`), seated so its underbody line sits on the rest-pose ground
 * plane (`groundLocalY`, chassis-local), and left facing local +Z — the
 * raycast-vehicle chassis' forward axis — so the loader's usual 180° flip is
 * NOT applied. The GLB's wheel meshes are hidden: they are merged
 * across-the-track primitives (see {@link SEATING_EXCLUDED_MATERIALS}) that
 * can never spin or steer per-wheel, so the Bullet-synced wheel entities stay
 * the moving wheels.
 */
export interface HeroCarMountOptions {
  /** Chassis entity to parent the visual under (scale 1, physics-owned). */
  parent: Entity;
  /** Full chassis collision-box width (m). */
  chassisWidth: number;
  /** Full chassis collision-box length (m). */
  chassisLength: number;
  /** Chassis-local Y of the ground plane at suspension rest. */
  groundLocalY: number;
  /** Called once the car is mounted (e.g. to remove a placeholder). */
  onMounted?: () => void;
}

/**
 * Overridable Paint-1 (body) tuning knobs. Defaults match the values this
 * loader has always used, which were tuned by eye against the SHOWROOM
 * scene's specific lighting rig (`showroomScene.ts`: `scene.skyboxIntensity
 * = 0.55`, `scene.exposure = 1.15`, and that scene's key/fill balance). This
 * loader is reused by the P4+ drive scenes, which will run under different
 * lighting (outdoor sun, time-of-day, etc.) — re-validate these defaults
 * (and override via this parameter if needed) whenever the car is dressed
 * under a lighting rig other than the showroom's. [P4+ note]
 */
export interface HeroCarPaintOptions {
  /** Body clearcoat base-coat metalness (0=dielectric diffuse, 1=fully metallic). */
  metalness?: number;
  /** Body base-coat gloss (specular highlight tightness). */
  gloss?: number;
  /** Body clearcoat layer intensity (0=none, 1=full mirror coat). */
  clearCoat?: number;
}

/**
 * Materials that carry the exported GLB's merged-across-the-wheel-track
 * geometry: this model has only ONE node per wheel PART (rim, tire, brake
 * pad, brake disc) rather than four (one per wheel), so each of these
 * primitives' object-space vertices span from the front-left wheel position
 * all the way to the opposite corner of the wheelbase/track instead of a
 * single wheel's footprint. Verified directly against the GLB's own glTF
 * JSON (accessor min/max + node transforms, no runtime needed): ALL SIX of
 * these materials have near-identical, wheelbase-sized world AABBs (roughly
 * 3-5m per axis, with min.y around -1.25 to -1.63) — including `Brake`/
 * `Disc`, which an earlier pass assumed were harmless single-wheel-sized
 * meshes but are in fact just as inflated as the rim/tire pair. Excluding by
 * MATERIAL NAME (rather than by node name/position) survives a GLB
 * re-export reordering or renaming nodes, since these material names are
 * part of the model's authored material table, not a position-derived
 * fallback like an unnamed node's engine-assigned `node_20`-style name.
 */
const SEATING_EXCLUDED_MATERIALS = new Set([
  "Rim1",
  "Rim2",
  "Tireside",
  "Tiretread",
  "Brake",
  "Disc",
]);

/**
 * A seated car's lowest point (`min.y` of the seating-bounds union, before
 * the seating offset is applied) should sit close to this model's natural
 * ride height / wheel radius (baked in at ~0.38 per the seating comment
 * below) — comfortably under a metre in this model's units. If a future GLB
 * re-export introduces a NEW merged/oversized primitive not covered by
 * {@link SEATING_EXCLUDED_MATERIALS} (e.g. a renamed or added wheel-track
 * material), `min.y` will jump toward that primitive's inflated bounds
 * (empirically ~-1.25 to -1.63 for the known offenders above) instead. This
 * threshold sits safely between the known-good (~0.4) and known-bad
 * (~1.3+) ranges.
 */
const SEATING_MIN_Y_SANITY_THRESHOLD = 1.0;

/**
 * P3 hero car: load `CarConcept-draco-webp.glb` (Draco geometry + WebP textures)
 * via the container loader, seat it on the ground at the origin, and dress it to
 * the showroom bar.
 *
 * Materials: PlayCanvas 2.20.5's glTF parser natively imports
 * KHR_materials_clearcoat / _transmission / _ior / _iridescence, so the car's
 * PBR + clearcoat + glass survive the import. The clearcoat FLAG [C-pbr] is
 * RESOLVED: `StandardMaterial` has the full clearCoat* property set.
 *
 * The model ships Carmine/Pearl/Graphite paint variants (KHR_materials_variants);
 * PlayCanvas binds only each primitive's *base* material and doesn't auto-select
 * a variant. To deterministically match E1's RED hero regardless of which
 * variant is the base, we force the authored Carmine values onto the bound
 * "Paint 1/2" slots (red body + dark accent, both clearcoated).
 */
export function loadHeroCar(
  app: Application,
  isDisposed: () => boolean,
  paint?: HeroCarPaintOptions,
  mount?: HeroCarMountOptions,
): HeroCarHandle {
  ensureDraco();

  const {
    metalness: paintMetalness = 0.6,
    gloss: paintGloss = 0.93,
    clearCoat: paintClearCoat = 0.55,
  } = paint ?? {};

  let carRoot: Entity | null = null;
  let rafId = 0;

  const asset = new Asset("hero-car", "container", { url: HERO_CAR_URL });

  asset.on("load", () => {
    if (isDisposed()) return;

    const resource = asset.resource as ContainerResource;
    const entity = resource.instantiateRenderEntity({ castShadows: true });

    // Dress materials to the showroom bar. Materials are shared across mesh
    // instances, so mutate each once.
    const touched = new Set<StandardMaterial>();
    const renders = entity.findComponents("render") as RenderComponent[];
    for (const render of renders) {
      render.receiveShadows = true;
      for (const mi of render.meshInstances) {
        const mat = mi.material as StandardMaterial;
        if (!mat || touched.has(mat)) continue;
        touched.add(mat);
        const name = mat.name ?? "";

        if (name.startsWith("Paint 1")) {
          // Main body: carmine red, mirror-clearcoat.
          //
          // [round-2 fix] clearCoat is an ACHROMATIC dielectric layer over the
          // tinted base coat -- physically correct for real automotive
          // lacquer, but at clearCoat=1/clearCoatGloss=0.97 (near-mirror) the
          // curved body mirrors wide swaths of the (bright, hazy) sky HDRI
          // as a colourless wash, desaturating the whole car toward pink
          // instead of reading as deep red with a tight bright highlight.
          // Softening the coat and backing off scene.skyboxIntensity (see
          // showroomScene.ts) keeps a punchy specular hotspot from the key
          // light while letting the tinted base coat read through.
          //
          // [round-2 fix 2] `metalness=1` is a FULLY metallic BRDF: it has NO
          // diffuse/Lambertian term at all, so every bit of the body's colour
          // comes only from tinted specular reflections of the environment.
          // With a mostly-grey/hazy HDRI that reads as a flat, desaturated
          // salmon rather than a vivid red -- there is no "flat red paint"
          // term feeding off the key light directly. Real automotive
          // metallic lacquer is closer to a low-metalness base coat (colour
          // flake suspended in a dielectric binder) with the achromatic
          // clearcoat layered on top for the mirror-like gloss. Dropping
          // metalness lets the saturated diffuse red respond to the key
          // light directly (the warm, bright highlight in the reference),
          // while the clearcoat above still supplies the glassy sheen.
          //
          // [hardening] metalness/gloss/clearCoat are overridable via the
          // `paint` param (defaults below == the values this scene has
          // always used) — see the {@link HeroCarPaintOptions} doc comment:
          // they were tuned against THIS showroom's lighting rig and must
          // be re-validated for the P4+ drive scenes' different lighting.
          mat.useMetalness = true;
          mat.diffuse.set(0.5, 0.009, 0.016);
          mat.metalness = paintMetalness;
          mat.gloss = paintGloss; // tighter, brighter hotspot
          mat.clearCoat = paintClearCoat;
          mat.clearCoatGloss = 0.93;
          mat.update();
        } else if (name.startsWith("Paint 2")) {
          // Secondary panels / lower trim: dark carmine accent, light clearcoat.
          mat.useMetalness = true;
          mat.diffuse.set(0.05, 0.05, 0.05);
          mat.metalness = 1;
          mat.gloss = 0.72;
          mat.clearCoat = 0.3;
          mat.clearCoatGloss = 0.85;
          mat.update();
        }
        // Glass ("Glass") keeps the material the glTF parser produced from
        // KHR_materials_transmission (dynamic refraction). The camera's
        // scene-colour grab pass (enabled in showroomScene) is what lets it
        // actually refract; no per-material tweak needed here.
      }
    }

    // The CarConcept model is authored facing +Z. Free-standing (showroom):
    // rotate 180° so it faces -Z, matching the world coordinate contract
    // (forward = -Z); the hero camera sits on the -Z side for a front-3/4 view.
    // Mounted on a chassis: leave it at 0° — the raycast-vehicle chassis'
    // LOCAL +Z is its forward axis (the chassis itself spawns yaw-180).
    entity.setLocalEulerAngles(0, mount ? 0 : 180, 0);

    app.root.addChild(entity);

    // Seat on the ground: centre X/Z on the origin and drop the lowest point to
    // y=0. Compute a world-space AABB by merging the mesh instances' bounds
    // (valid once the entity is parented and its transform is synced).
    //
    // Mesh instances whose material is in SEATING_EXCLUDED_MATERIALS are
    // skipped (see that constant's doc comment for the full story): the
    // exported GLB bakes each wheel PART (rim, tire, brake pad, brake disc)
    // into a single merged primitive spanning the whole wheel track/
    // wheelbase rather than one wheel's footprint, so its object-space AABB
    // is far larger than the actual part. Feeding any of those into the
    // per-instance world-transform union inflates the box to bigger than the
    // whole car and drags min.y down to roughly -1.3 to -1.6, which used to
    // seat the car floating well over a metre above the studio floor. The
    // remaining body/interior meshes are ordinary single-part meshes and
    // give a sane, reliable footprint; using their underbody line as the
    // ground offset is consistent with the wheel hub height baked into the
    // model (~0.38, i.e. close to a plausible wheel radius), which indicates
    // this model already ships close to its own natural ride height.
    app.root.syncHierarchy();
    const bounds = new BoundingBox();
    let first = true;
    for (const render of renders) {
      for (const mi of render.meshInstances) {
        const matName = (mi.material as StandardMaterial | null)?.name ?? "";
        if (SEATING_EXCLUDED_MATERIALS.has(matName)) continue;
        if (first) {
          bounds.copy(mi.aabb);
          first = false;
        } else {
          bounds.add(mi.aabb);
        }
      }
    }
    if (!first) {
      const min = bounds.getMin();
      const center = bounds.center;
      // Cheap re-export sanity check (see SEATING_MIN_Y_SANITY_THRESHOLD's
      // doc comment): don't throw — a warning still lets the showroom (and
      // any P4+ scene reusing this loader) render rather than hard-fail,
      // but flags that the car likely looks like it's floating/sunken.
      if (Math.abs(min.y) > SEATING_MIN_Y_SANITY_THRESHOLD) {
        console.warn(
          `[heroCar] seating bounds min.y=${min.y.toFixed(3)} is farther ` +
            `from 0 than expected (>${SEATING_MIN_Y_SANITY_THRESHOLD}); the ` +
            "car may render floating or sunken into the floor. This usually " +
            "means a GLB re-export introduced a new merged/oversized " +
            "primitive not covered by SEATING_EXCLUDED_MATERIALS.",
        );
      }
      if (mount) {
        // Chassis mount: fit the body to the chassis footprint with ONE
        // uniform factor and seat the underbody line on the rest-pose ground
        // plane in chassis space. The GLB's own wheels STAY VISIBLE (they seat
        // perfectly with the body, exactly like the showroom) — they are
        // merged across-the-track primitives that can never spin or steer, an
        // accepted visual deviation; the scene hides its placeholder wheel
        // cylinders via `onMounted` (mismatched arches looked far worse than
        // non-spinning wheels at chase-camera distance).
        const size = bounds.halfExtents;
        const s = heroCarUniformScale(
          size.x * 2,
          size.z * 2,
          mount.chassisWidth,
          mount.chassisLength,
        );
        app.root.removeChild(entity);
        mount.parent.addChild(entity);
        entity.setLocalScale(s, s, s);
        entity.setLocalPosition(-center.x * s, mount.groundLocalY - min.y * s, -center.z * s);
        mount.onMounted?.();
      } else {
        const pos = entity.getPosition();
        entity.setPosition(pos.x - center.x, pos.y - min.y, pos.z - center.z);
      }
    }

    carRoot = entity;
  });

  // Defer the heavy container load one frame. Under React strict-mode's dev
  // double-mount, the throwaway first Application is created and destroyed
  // synchronously before any rAF fires; deferring means that dead app never
  // starts parsing the GLB (the parser builds GPU buffers + texture sub-assets
  // regardless of our own load callback, so a mid-parse destroy would hit a
  // null device / deregistered handlers — exactly the strict-mode hazard the
  // plan flags). The live mount's rAF runs normally.
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    if (isDisposed()) return;
    app.assets.add(asset);
    app.assets.load(asset);
  });

  return {
    getEntity: () => carRoot,
    dispose() {
      if (rafId) cancelAnimationFrame(rafId);
      carRoot?.destroy();
      carRoot = null;
      asset.unload();
      app.assets.remove(asset);
    },
  };
}
