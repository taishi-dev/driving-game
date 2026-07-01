# Asset Credits and Licenses

All shipped assets must be redistributable in this public repository and web build.
CC0 preferred; CC-BY only with the attribution recorded here. Every entry lists the
source URL and the exact license. Sizes are filled in during Task A3 after compression.

## Hero car

| Asset | Source | License | Attribution required | Shipped? |
|---|---|---|---|---|
| CarConcept (glTF) | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept | CC-BY 4.0 (https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/CarConcept/LICENSE.md) | YES — "Eric Chadwick" and "Darmstadt Graphics Group GmbH" | Yes (hero) |
| ToyCar (glTF) | https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/ToyCar/README.md | CC0 1.0 | No | Only as a compression-test asset, not shipped as hero |

## Environment and textures (to be added during A2)

| Asset | Source | License | Attribution required | Shipped? |
|---|---|---|---|---|
| Outdoor HDRI (TBD) | https://polyhaven.com/hdris (license https://polyhaven.com/license) | CC0 | No | Yes |
| PBR ground/road/building textures (TBD) | https://ambientcg.com/ (license https://docs.ambientcg.com/license/) and/or https://polyhaven.com/textures | CC0 | No | Yes |

## Explicitly NOT shipped

| Asset | Reason |
|---|---|
| `public/models/gtrrsas.glb` | 72.3 MB and no recorded license/provenance in the repo; a branded GT-R model is a redistribution/trademark risk in a public repo. Superseded as hero car by CarConcept (user decision, 2026-06-30). |

## Compression provenance

Shipped meshes/textures are produced by `npm run assets:build` (gltf-transform, MIT — https://gltf-transform.dev/) from the source files under `assets/source/` (kept for reproducibility, not shipped). Measured shipped sizes recorded in Task A3.
