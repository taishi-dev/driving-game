# Asset Credits and Licenses

All shipped assets must be redistributable in this public repository and web build.
CC0 preferred; CC-BY only with the attribution recorded here. Every entry lists the
source URL and the exact license URL. Sizes measured after compression in Task A3.

---

## Hero Car

| Field | Value |
|---|---|
| Asset name | CarConcept |
| Source URL | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept |
| Direct download | https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb |
| License | CC-BY 4.0 International |
| License URL | https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/CarConcept/LICENSE.md |
| CC license text | https://creativecommons.org/licenses/by/4.0/legalcode |
| Attribution required | YES |
| Attribution text | "CarConcept" by Eric Chadwick / Darmstadt Graphics Group GmbH, licensed CC-BY 4.0. |
| Source author | Eric Chadwick |
| Source owner | Darmstadt Graphics Group GmbH |
| Source year | 2024 |
| Metadata source | https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/metadata.json |
| Extensions used | KHR_materials_clearcoat, KHR_materials_emissive_strength, KHR_materials_iridescence, KHR_materials_transmission, KHR_materials_variants, KHR_texture_transform |
| Source size | 11.23 MB (CarConcept.glb, uncompressed) |
| Shipped as | `public/models3d/CarConcept-draco.glb` and `public/models3d/CarConcept-draco-webp.glb` |
| Shipped sizes | `CarConcept-draco.glb` = **4.00 MB** (Draco geometry compression); `CarConcept-draco-webp.glb` = **1.26 MB** (Draco + WebP textures + mesh simplify) |

### Khronos branding note

The `KHR_materials_*` extension names and Khronos/3D Commerce logos embedded in the model file are trademark elements governed by `LicenseRef-LegalMark-Khronos`. The geometric model and PBR textures are CC-BY 4.0. The trademark elements are non-copyrightable and not separately rendered; this is noted for completeness per the `LICENSE.md` file.

---

## Environment — HDRI

| Field | Value |
|---|---|
| Asset name | Kloofendal 48d Partly Cloudy (Pure Sky) |
| Poly Haven slug | `kloofendal_48d_partly_cloudy_puresky` |
| Asset page | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky |
| Download URL (2K EXR, used) | https://dl.polyhaven.org/file/ph-assets/HDRIs/exr/2k/kloofendal_48d_partly_cloudy_puresky_2k.exr |
| License | CC0 1.0 Universal |
| License URL | https://polyhaven.com/license |
| Attribution required | No (CC0 — attribution appreciated but not required) |
| Authors | Greg Zaal (original); sky edits by Jarod Guest |
| Source size | 19.13 MB (2K EXR) |
| Shipped? | Source EXR is in `assets/source/hdri/` (not shipped). Per-engine Phase B: each engine branch will prefilter to its own IBL format (Babylon: .env; PlayCanvas: prefiltered cubemap; Cocos: native) during that branch's B2 task. The EXR itself is not part of the web build. |

---

## PBR Textures (ground / road / building)

All textures from [ambientCG](https://ambientcg.com/) are released under **CC0 1.0 Universal** (https://creativecommons.org/publicdomain/zero/1.0/). No attribution is required. License verified at each asset page.

| Asset | Page URL | Download URL (1K JPG ZIP, used) | Description | Source ZIP size |
|---|---|---|---|---|
| Asphalt012 | https://ambientcg.com/view?id=Asphalt012 | https://ambientcg.com/get?file=Asphalt012_1K-JPG.zip | Dark cracked asphalt (procedural) | 8.11 MB |
| Concrete015 | https://ambientcg.com/view?id=Concrete015 | https://ambientcg.com/get?file=Concrete015_1K-JPG.zip | Clean dark smooth concrete (procedural) | 6.87 MB |
| PavingStones070 | https://ambientcg.com/view?id=PavingStones070 | https://ambientcg.com/get?file=PavingStones070_1K-JPG.zip | Old cobblestone pavement (photogrammetry, ~1.15m tile) | 8.62 MB |

These ZIPs are stored in `assets/source/textures/` (not shipped raw). Extracted PNG/JPG maps (color, normal, roughness, AO) will be referenced directly by each engine branch (Phase B) when building world materials. They are not compressed into `public/models3d/` at this stage because they are standalone textures, not glTF assets; per-engine texture atlasing and compression (WebP / KTX2) is a Phase B task.

---

## World Kit

The plan called for a CC0/CC-BY road/building kit. Status: **open sub-task; does not block A3–A5.**

- `public/models/city.glb` is the existing world geometry but has no recorded license or provenance in the repository; it is treated as unlicensed and off-limits for redistribution.
- No clean-licensed road/building kit was identified in the available time. Candidates for Phase B sourcing: Poly Haven surfaces (CC0, https://polyhaven.com/models), Kenney.nl assets (CC0, https://kenney.nl/assets), or KhronosGroup glTF-Sample-Assets city/road models if any exist with CC-BY.
- **Action for Phase B (B5):** each engine branch must either source a CC0/CC-BY world kit (recording it here) or build procedural geometry. No unlicensed geometry ships.

---

## Explicitly NOT Shipped

| Asset | Reason |
|---|---|
| `public/models/gtrrsas.glb` | 72.3 MB; no recorded license or provenance in the repo. Likely a branded GT-R model — redistribution and trademark risk in a public repo. Superseded as hero car by CarConcept (user decision, 2026-06-30). |
| `public/models/city.glb` | No recorded license or provenance. Off-limits for redistribution until sourced. |
| `public/models/bicycle.glb` | No recorded license. Off-limits for Phase A redistribution (may be re-evaluated per-branch in Phase B with provenance research). |
| `public/models/elementary_school_student.glb` | No recorded license. Off-limits for redistribution. |
| `public/models/women.glb` | No recorded license. Off-limits for redistribution. |
| `public/models/stop_sign.glb` | No recorded license. Off-limits for redistribution. |
| `public/models/traffic_light*.glb` | No recorded license. Off-limits for redistribution. |
| `public/models/railroad_crossing.glb` | No recorded license. Off-limits for redistribution. |
| `public/models/westren_traffic_light.glb` | No recorded license. Off-limits for redistribution. |
| `public/models/car.gltf` | No recorded license. Off-limits for redistribution. |

---

## Compression Provenance

Shipped meshes under `public/models3d/` are produced by `npm run assets:build`
(script: `scripts/assets-build.mjs`) using **@gltf-transform/cli** (MIT license,
https://gltf-transform.dev/).

| Variant | Command | Shipped size |
|---|---|---|
| `CarConcept-draco.glb` | `gltf-transform draco` | **4.00 MB** |
| `CarConcept-draco-webp.glb` | `gltf-transform optimize --compress draco --texture-compress webp` | **1.26 MB** |

Total shipped models in `public/models3d/`: **5.25 MB** (well within the ≤ 50 MB interactive budget).

### KTX2 note

KTX2 GPU texture compression (`gltf-transform uastc` / `gltf-transform etc1s`) requires
the external **KTX-Software** `ktx` CLI (https://github.com/KhronosGroup/KTX-Software,
Apache-2.0). It is not installed in this foundation environment. KTX2 is a Phase B
per-engine task:
- Babylon.js branch: UASTC (`gltf-transform uastc`)
- PlayCanvas branch: ETC1S/Basis (`gltf-transform etc1s`) — PlayCanvas does not support meshopt
- Cocos branch: KTX2 support is unconfirmed; see plan research note [D-ktx2]

### Budget accounting note (from plan Revision 2)

The ≤ 50 MB interactive budget must also count:
- MediaPipe vision WASM + model files (loaded by the webcam foot/hand control subsystem)
- Draco and KTX2 decoder payloads loaded at runtime by each engine

These are per-engine and measured in Phase B (B12). The 5.25 MB model figure above
covers only the glTF assets; decoder overhead is not yet counted.
