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

Two complementary Kenney kits ship together: one covers all road tile types; the other covers commercial buildings and skyscrapers. Both are **CC0 — no attribution required**.

### Roads — Kenney City Kit (Roads) 2.0

| Field | Value |
|---|---|
| Asset name | City Kit (Roads) |
| Version | 2.0 |
| Source URL | https://kenney.nl/assets/city-kit-roads |
| Download URL (used) | https://kenney.nl/media/pages/assets/city-kit-roads/74288c9459-1741864740/kenney_city-kit-roads.zip |
| License | CC0 1.0 Universal |
| License URL | https://creativecommons.org/publicdomain/zero/1.0/ |
| License verified from | `License.txt` inside the downloaded ZIP (text: "License: (Creative Commons Zero, CC0) http://creativecommons.org/publicdomain/zero/1.0/") |
| Attribution required | No (CC0) |
| Creator | Kenney (www.kenney.nl) |
| GLB count | 72 GLBs |
| Source ZIP size | 1.7 MB |
| Source GLB total | ~1.3 MB |
| Shipped as | `public/models3d/world/roads/*.glb` (Draco + WebP, one file per tile) |
| Shipped size | **0.30 MB** (all 72 tiles combined) |

Content: straight, bend, crossroad, intersection, roundabout, bridge, driveway, side-road, slant, barriers, light posts, construction cones, highway signs, terrain tiles.

### Buildings — Kenney City Kit (Commercial) 2.1

| Field | Value |
|---|---|
| Asset name | City Kit (Commercial) |
| Version | 2.1 |
| Source URL | https://kenney.nl/assets/city-kit-commercial |
| Download URL (used) | https://kenney.nl/media/pages/assets/city-kit-commercial/a742d900eb-1753115042/kenney_city-kit-commercial_2.1.zip |
| License | CC0 1.0 Universal |
| License URL | https://creativecommons.org/publicdomain/zero/1.0/ |
| License verified from | `License.txt` inside the downloaded ZIP (text: "License: (Creative Commons Zero, CC0) http://creativecommons.org/publicdomain/zero/1.0/") |
| Attribution required | No (CC0) |
| Creator | Kenney (www.kenney.nl) |
| GLB count | 41 GLBs |
| Source ZIP size | 4.0 MB |
| Source GLB total | ~3.7 MB |
| Shipped as | `public/models3d/world/buildings/*.glb` (Draco + WebP, one file per building) |
| Shipped size | **0.29 MB** (all 41 buildings combined) |

Content: 14 commercial buildings (a–n), 5 skyscrapers (a–e), 20 low-detail buildings (a–n, wide a–b), awnings, overhang details, parasols.

### Visual Style Note

Both kits are **stylized low-poly** with flat-shaded or lightly textured surfaces. They are cohesive with each other (same Kenney city series). However, they do **not match the photoreal quality of the hero car** (CarConcept, CC-BY 4.0). This is expected for a mid-fidelity driving world: the car is the hero asset; the world provides recognizable urban context without competing with it.

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
| `world/roads/*.glb` (72 files) | `gltf-transform optimize --compress draco --texture-compress webp` | **0.30 MB** total |
| `world/buildings/*.glb` (41 files) | `gltf-transform optimize --compress draco --texture-compress webp` | **0.29 MB** total |

Total shipped models in `public/models3d/`: **5.84 MB** (car: 5.26 MB + world: 0.59 MB — well within the ≤ 50 MB interactive budget).

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
