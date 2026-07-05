# Phase 1 Research — Realistic 3D Engine Trial (cited)

**Date:** 2026-06-30
**Purpose:** Ground the plan to rebuild the driving app as a realistic 3D world, tried as full ports in three engines (Babylon.js, PlayCanvas, Cocos Creator), on separate branches, in the V1/V2/V3 style. Every external claim below carries a source URL. Items that could not be verified from a primary source are marked FLAG.

Target device (measured locally, not assumed): Intel Core Ultra 7 255H (16 cores), 31.5 GB RAM, Intel Arc 140T integrated GPU, 1920x1200, Windows 11. Pass line: steady 60 fps at 1920x1200. Proposed download budget: <= ~25 MB to first interactive scene.

---

## 1. Reference sites and the showroom technique stack

Verified libraries:
- renaultespace.littleworkshop.fr uses three.js (studio's own project page lists "WebGL / Three.js Development"): https://www.littleworkshop.fr/projects/renaultespace/
- carvisualizer.plus360degrees.com/threejs/ uses three.js (page title "Car Visualizer - Three.js"): https://experiments.withgoogle.com/car-visualizer-classics
- dyadstudios.com Porsche and vr.ff.com are single-page apps; the rendering library could not be verified from fetched HTML. FLAG (not guessed).

Showroom realism technique stack (applies to any PBR web engine), cited:
- HDRI image-based lighting: three.js `RGBELoader` + `PMREMGenerator` -> `scene.environment`. https://redstapler.co/three-js-realistic-material-reflection-tutorial/
- Car paint: `MeshPhysicalMaterial` metalness/roughness + clearcoat (official three.js car example values `clearcoat:1.0, clearcoatRoughness:0.03`). https://threejs.org/docs/pages/MeshPhysicalMaterial.html and https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_materials_car.html
- Glass: `transmission:1.0, roughness:0`. (same car example)
- Tone mapping + color: `ACESFilmicToneMapping`, `outputColorSpace = SRGBColorSpace`. https://threejs.org/docs/#api/en/renderers/WebGLRenderer.toneMapping
- Soft shadows: `PCFSoftShadowMap` / `VSMShadowMap`. https://threejs.org/docs/#api/en/renderers/WebGLRenderer
- Optional post: SSAO/GTAO, UnrealBloom, SMAA via EffectComposer. https://threejs.org/docs/#examples/en/postprocessing/EffectComposer
- Camera: `OrbitControls` with `maxPolarAngle: Math.PI/2` floor clamp. (car example)

Key point: the canonical three.js `webgl_materials_car` reaches showroom quality with HDR + IBL and NO post-processing; post is additive. The same approach (PBR + clearcoat + HDR IBL + ACES) is available in Babylon.js.

---

## 2. Engine comparison (cited; FLAG = not verified from a primary source)

| Dimension | Babylon.js | PlayCanvas | Cocos Creator 3.8 |
|---|---|---|---|
| License | Apache 2.0 (Havok WASM MIT) [B-lic] | MIT [C-lic] | Runtime MIT; editor free for games, **non-game/training-sim may need authorization + fees** [D-lic] |
| npm / code-first, no editor | Yes [B-npm] | Yes [C-standalone] | Editor underpins build pipeline (CLI exists but editor required) [D-editor] |
| React integration | useEffect pattern + community react-babylonjs [B-react] | Official `@playcanvas/react` [C-react] | Not documented for HTML/React overlay [D-embed] FLAG |
| PBR materials | PBRMaterial [B-pbr] | StandardMaterial metalness workflow [C-pbr] | builtin-standard PBR [D-pbr] |
| Clearcoat car paint | Native `material.clearCoat.*` [B-cc] | clearCoat props exist FLAG (not verified this run) | **Not documented; custom Surface Shader required** [D-cc] |
| HDR IBL | `.env` or `.hdr` -> scene.environmentTexture [B-ibl] | HDR cubemap; **prefilter offline** (no runtime prefilter API found) [C-ibl] | HDR skybox + prefiltered GGX IBL + reflection probes [D-ibl] |
| glTF Draco | Yes [B-gltf] | Yes [C-draco] | Not documented FLAG [D-gltf] |
| glTF meshopt | Yes [B-gltf] | **Not supported** (issue open since 2020) [C-meshopt] | Not documented FLAG |
| KTX2 / Basis textures | Yes [B-ktx2] | Standalone .basis yes; KHR_texture_basisu-in-GLB likely FLAG [C-basis] | **Not supported** (open issue) [D-ktx2] |
| Built-in vehicle physics | **No official** raycast vehicle (Havok V2 = rigid bodies; community port unmaintained/buggy) [B-veh] | **Official `btRaycastVehicle` tutorial** (Ammo/Bullet) [C-veh] | **None built-in**; custom wheel/suspension required [D-veh] |
| Physics backend | Havok (V2, MIT WASM) [B-phys] | Ammo/Bullet (load via settings) [C-phys] | Bullet(default)/cannon/PhysX/builtin [D-phys] |
| WebGL2 | Default since v3 [B-webgl2] | Stable min in Engine 2.x [C-webgl2] | Stable [D-web] |
| WebGPU | Production since v5 [B-webgpu] | Beta (fallback to WebGL2) [C-webgpu] | Experimental (Chromium+flags) [D-web] |
| iGPU tuning | SceneOptimizer + HardwareScalingOptimization [B-opt] | draw-call/DPR/texture-compression guidance [C-opt] | No published iGPU benchmarks FLAG [D-size] |
| Core bundle size | FLAG: no primary gzip figure v9.x; tree-shakeable ES6 [B-size] | FLAG: no published figure; tree-shakeable [C-size] | Empty project ~1.8 MB + Bullet ~1.5 MB (community) [D-size] |

Source keys:
- [B-lic] https://github.com/BabylonJS/Babylon.js/blob/master/license.md
- [B-npm] https://doc.babylonjs.com/setup/frameworkPackages/npmSupport
- [B-react] https://doc.babylonjs.com/communityExtensions/Babylon.js+ExternalLibraries/BabylonJS_and_ReactJS
- [B-pbr] https://doc.babylonjs.com/features/featuresDeepDive/materials/using/masterPBR/
- [B-cc] https://doc.babylonjs.com/typedoc/classes/BABYLON.PBRClearCoatConfiguration
- [B-ibl] https://doc.babylonjs.com/features/featuresDeepDive/materials/using/HDREnvironment
- [B-gltf] https://doc.babylonjs.com/features/featuresDeepDive/importers/glTF
- [B-ktx2] https://doc.babylonjs.com/features/featuresDeepDive/materials/using/ktx2Compression
- [B-veh] https://forum.babylonjs.com/t/havok-physics-raycast-vehicle-support/40180
- [B-phys] https://doc.babylonjs.com/features/featuresDeepDive/physics/havokPlugin
- [B-webgl2] https://doc.babylonjs.com/setup/support/webGL2
- [B-webgpu] https://doc.babylonjs.com/setup/support/webGPU
- [B-opt] https://doc.babylonjs.com/features/featuresDeepDive/scene/sceneOptimizer
- [B-size] https://doc.babylonjs.com/setup/frameworkPackages/es6Support
- [C-lic] https://github.com/playcanvas/engine/blob/main/LICENSE
- [C-standalone] https://developer.playcanvas.com/user-manual/engine/standalone/
- [C-react] https://developer.playcanvas.com/user-manual/react/
- [C-pbr] https://api.playcanvas.com/engine/classes/StandardMaterial.html
- [C-ibl] https://developer.playcanvas.com/user-manual/graphics/physical-rendering/image-based-lighting/
- [C-draco] https://developer.playcanvas.com/tutorials/loading-draco-compressed-glbs/
- [C-meshopt] https://github.com/playcanvas/engine/issues/2630
- [C-basis] https://developer.playcanvas.com/user-manual/optimization/texture-compression/
- [C-veh] https://developer.playcanvas.com/tutorials/vehicle-physics/
- [C-phys] https://developer.playcanvas.com/user-manual/physics/physics-basics/
- [C-webgl2] https://developer.playcanvas.com/user-manual/engine/supported-browsers/
- [C-webgpu] https://github.com/playcanvas/engine/issues/3986
- [C-opt] https://developer.playcanvas.com/user-manual/optimization/guidelines/
- [C-size] https://playcanvas.com/products/engine
- [D-lic] https://download.cocos.com/CocosUdc/agreement/Cocos_User_Service_Agreement_en_20220901.html and runtime MIT https://github.com/cocos/cocos-engine
- [D-editor] https://docs.cocos.com/creator/3.8/manual/en/editor/publish/build-guide.html
- [D-embed] https://docs.cocos.com/creator/3.8/manual/en/editor/publish/custom-project-build-template.html
- [D-pbr] https://docs.cocos.com/creator/3.8/manual/en/shader/effect-builtin-pbr.html
- [D-cc] https://docs.cocos.com/creator/3.8/manual/en/shader/surface-shader/lighting-mode.html
- [D-ibl] https://docs.cocos.com/creator/3.8/manual/en/concepts/scene/skybox.html
- [D-gltf] https://docs.cocos.com/creator/3.8/manual/en/asset/model/glTF.html
- [D-ktx2] https://github.com/cocos/cocos-engine/issues/16296
- [D-veh] https://docs.cocos.com/creator/3.8/manual/en/physics/
- [D-phys] https://docs.cocos.com/creator/3.8/manual/en/physics/physics-engine.html
- [D-web] https://docs.cocos.com/creator/3.8/manual/en/editor/publish/publish-web.html
- [D-size] https://forum.cocosengine.org/t/cocos-creator-3-build-size/53154

Unreal Engine (excluded, confirmed): HTML5/WebGL export deprecated UE 4.23; no built-in web export in UE5; only server-side Pixel Streaming. https://forums.unrealengine.com/t/html5-deprecation-sadness/130748 and https://dev.epicgames.com/documentation/en-us/unreal-engine/pixel-streaming-in-unreal-engine

---

## 3. Assets and compression (cited)

- HDRIs: Poly Haven, CC0 (no attribution). https://polyhaven.com/license ; outdoor skies https://polyhaven.com/hdris/skies
- PBR textures: ambientCG CC0 https://docs.ambientcg.com/license/ ; Poly Haven textures CC0 (same license page).
- Car models:
  - Khronos ToyCar, CC0, stylized, demonstrates clearcoat/transmission/sheen: https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/ToyCar/README.md
  - Khronos CarConcept, CC-BY 4.0 (attribution to Eric Chadwick + Darmstadt Graphics Group): https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept
  - Quaternius: CC0 claimed by third parties but NOT stated on quaternius.com; verify per-pack before public redistribution. FLAG
  - Sketchfab CC0 filter for more hero cars: https://sketchfab.com/search?features=downloadable&licenses=322a749bcfa841b29dff1e8a1bb74b0b&type=models&q=car
- Compression:
  - Draco (KHR_draco_mesh_compression): up to ~12x geometry compression. https://www.khronos.org/news/press/khronos-announces-gltf-geometry-compression-extension-using-google-draco
  - meshopt (EXT_meshopt_compression), MIT: https://github.com/zeux/meshoptimizer
  - KTX2 / Basis Universal (KHR_texture_basisu), GPU-compressed textures: https://www.khronos.org/ktx/
- Tools (both MIT):
  - gltf-transform (Draco + meshopt + KTX2): https://gltf-transform.dev/
  - gltfpack (meshopt + KTX2, no Draco): https://meshoptimizer.org/gltf/

Compatibility for hitting the size budget:
- Babylon: Draco + meshopt + KTX2 all supported -> most flexible.
- PlayCanvas: Draco yes, meshopt NO, Basis yes -> use Draco + Basis (not meshopt/gltfpack for meshes).
- Cocos: KTX2/Draco not documented -> rely on its own GPU texture formats (ASTC/ETC) + zlib/quantization; largest risk of missing the download budget. FLAG

---

## 4. Existing repo assets (verified locally, 2026-06-30)

`public/models/` totals 164 MB, uncompressed. Notable: `gtrrsas.glb` 72.3 MB (candidate hero car), `bicycle.glb` 24.9 MB, `city.glb` 22.7 MB, `elementary_school_student.glb` 17.9 MB, `women.glb` 12.8 MB. The single hero car alone is ~3x the entire proposed download budget, so compression (or lighter replacement assets) is mandatory. Loader already present: `src/components/simulation/ThreeModelLoader.tsx` (useGLTF).

---

## 5. Risks and flags carried into the plan

1. Cocos licensing: a "virtual driving school" may be read as a non-game training simulator, which the Cocos agreement says may require written authorization and fees. Must be resolved before a full Cocos port. [D-lic]
2. Vehicle physics (9.B) is uneven: PlayCanvas has an official raycast-vehicle tutorial; Babylon and Cocos require a hand-built wheel/suspension model. This is real, unequal effort across branches. [B-veh][C-veh][D-veh]
3. Clearcoat car paint: native in Babylon; a custom shader in Cocos; unverified in PlayCanvas this run (verify). [B-cc][D-cc]
4. Compression to <=25 MB: easy in Babylon, workable in PlayCanvas (Draco+Basis), hardest in Cocos. [section 3]
5. Three full photoreal ports at 60 fps on an integrated Arc GPU is ambitious; each branch must budget explicit performance-tuning work (SceneOptimizer / DPR scaling / draw-call batching / texture compression). [B-opt][C-opt]
6. Engine bundle sizes are not published as primary figures; measure with bundlephobia/bundlejs and the actual build. FLAG [B-size][C-size]
7. IBL prefiltering in PlayCanvas must be done offline, not at runtime. [C-ibl]
