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
| Babylon branch runtime file | `public/env/kloofendal_48d_partly_cloudy_puresky_2k.hdr` — **5.20 MB** (2K Radiance .hdr, CC0). Downloaded from https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr and set as `scene.environmentTexture` via Babylon `HDRCubeTexture` (prefiltered on load). B2 of the E1-babylon full port. |

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

### Downtown City MegaKit — Quaternius (Standard, FREE)

| Field | Value |
|---|---|
| Asset name | Downtown City MegaKit |
| Edition | Standard (FREE) |
| Source URL | https://quaternius.itch.io/downtown-city-megakit |
| License | CC0 1.0 Universal |
| License URL | https://creativecommons.org/publicdomain/zero/1.0/ |
| License verified from | `License_Standard.txt` inside the downloaded ZIP (text states CC0 1.0 Universal) |
| Attribution required | No (CC0 — attribution appreciated: "Models by @Quaternius") |
| Creator | @Quaternius |
| glTF piece count | 153 .gltf files (Godot glTF export, each with a paired .bin buffer) |
| Texture count | 29 unique PNGs (co-located in `glTF/` folder so relative URI paths resolve) |
| Source archive | `Downtown City MegaKit[Standard].zip` (234 MB; stored locally, not in git) |
| Source format used | `Exports/glTF (Godot)/` — 153 .gltf + .bin pairs |
| Textures folder | `Textures/` — 29 PNG textures (BaseColor, Normal, ORM/roughness sets) |
| Extracted to | `assets/source/world/quaternius/` (gitignored) |
| Shipped as | `public/models3d/world/quaternius/*.glb` — Draco + WebP, 512px texture cap |
| Shipped size | **~15 MB** (all 153 pieces combined) |

Content: modular brick building components (columns, walls, windows, cornices, trims), 3 pre-assembled buildings (large/medium/small), street decals, road pieces (straight, curve, intersection, T-junction, sidewalks), props (bollards, planters, AC units, drains, manhole covers), doors, entrances, floor tiles, roof pieces, stairs.

Texture sets (29 unique PNGs, all at 2048×2048 in source, capped at 512px in shipped GLBs):
`T_Concrete_*`, `T_RedBrick_*`, `T_MetalConcrete_*`, `T_Ornaments_*`, `T_RoofSlate_*`, `T_Trim_*`, `T_MarbleFloor_*`, `T_Dirt_*`, `T_Street_Decals`, `T_dark_interior`, `T_lit_interior_1/2`

### Stylized Fallback Note

Kenney City Kit (CC0, https://kenney.nl/assets) remains available as a stylized low-poly fallback if a simpler visual style is needed. The Kenney source files are retained in `assets/source/world/` (gitignored). The Kenney compressed outputs (`public/models3d/world/roads/` and `public/models3d/world/buildings/`) have been removed from this branch as Quaternius is now the primary world kit.

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
| `world/quaternius/*.glb` (153 files) | `gltf-transform optimize --compress draco --texture-compress webp --texture-size 512` | **~15 MB** total |

Total shipped models in `public/models3d/`: **~20 MB** (car: 5.26 MB + world: ~15 MB — within the ≤ 50 MB interactive budget).

Note: The 153 Quaternius GLBs each embed their own copy of the shared textures (this is the standard Godot glTF export pattern). At 512px WebP the total shipped models are ~20 MB, leaving ~30 MB headroom under the 50 MB budget for the MediaPipe files and the Draco decoder (counted per-engine in Phase B). Drop QUATERNIUS_TEXTURE_SIZE to 256 for more headroom.

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
