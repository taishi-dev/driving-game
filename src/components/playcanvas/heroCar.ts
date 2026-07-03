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
function ensureDraco(): void {
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
): HeroCarHandle {
  ensureDraco();

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
          mat.useMetalness = true;
          mat.diffuse.set(0.67, 0, 0);
          mat.metalness = 1;
          mat.gloss = 0.78; // base coat roughness ~0.25
          mat.clearCoat = 1;
          mat.clearCoatGloss = 0.97; // clearcoat roughness ~0.03 (glassy)
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

    // The CarConcept model is authored facing +Z; rotate 180° so it faces -Z,
    // matching the coordinate contract (forward = -Z) that the P4+ drive scenes
    // reuse. In the showroom this also turns the +Z hero camera into a rear-3/4
    // view.
    entity.setLocalEulerAngles(0, 180, 0);

    app.root.addChild(entity);

    // Seat on the ground: centre X/Z on the origin and drop the lowest point to
    // y=0. Compute a world-space AABB by merging the mesh instances' bounds
    // (valid once the entity is parented and its transform is synced).
    app.root.syncHierarchy();
    const bounds = new BoundingBox();
    let first = true;
    for (const render of renders) {
      for (const mi of render.meshInstances) {
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
      const pos = entity.getPosition();
      entity.setPosition(pos.x - center.x, pos.y - min.y, pos.z - center.z);
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
