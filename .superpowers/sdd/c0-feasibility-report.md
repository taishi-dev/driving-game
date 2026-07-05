# C0 — Cocos Creator Feasibility Spike (GATE)

**Branch:** `E3-cocos/feature/full-port`
**Date:** 2026-07-04
**Question:** Can the Cocos runtime power our existing Next.js 16 app *code-first* — no Cocos Creator editor in the build loop — at the fidelity the engine trial demands?

## VERDICT: EARLY-EXIT (infeasible code-first)

Two **independent, hard, primary-source-confirmed** blockers each kill the code-first path on their own:

1. There is **no runnable Cocos 3.8 web engine runtime distributed for code-first use** (no npm package, no supported standalone bundle). The engine is only obtainable as build output of the editor.
2. Even setting the engine aside, **Cocos does not support loading GLB/glTF at runtime** — models must be editor-imported and converted to Cocos' native asset format at edit-time. Our entire trial premise (runtime GLB load from `public/models3d/`) is unsupported.

Criteria 2–4 are gated behind criterion 1 per the plan; criterion 1 fails, so 3 (PBR+IBL) and 4 (physics) were not reached. Criterion 2 was investigated anyway because its failure is independent and reinforces the verdict. Criterion 5 (license) was recorded regardless.

Per the plan's honest-comparison mandate, this is a legitimate documented trial outcome, not a defect in the work. Pursuing a self-built engine from source would be thrashing: the README explicitly discourages standalone use, the bootstrap still needs editor-generated `settings.json`, and criterion 2 is dead regardless of how the engine is obtained.

---

## Criterion 1 — Engine embed (code-first, no editor scaffolding): **FAIL**

### What I tried / found (concrete, reproducible)

**npm has no Cocos 3.8 engine runtime.** Checked every candidate the research doc and community named:

| Package | `npm view` result |
|---|---|
| `cc` | v3.0.1 — *"Code style linter for C++ source files used in Node.js native addons"*. **Not the game engine.** |
| `cocos` | v0.0.2 — ancient `cocos2d-html5`. Not Creator 3.x. |
| `cocos-js` | **404 Not Found** — does not exist. |
| `@cocos-creator-3d/engine` | **404 Not Found** — removed/unpublished. |
| `@cocos/creator-types` | v3.8.7 — exists, but **TypeScript declarations only** (see below). |

**Proof `@cocos/creator-types` is not a runtime.** Installed `@cocos/creator-types@3.8.7` into a scratch project:
- **644 `.d.ts` files, 0 engine `.js` files.** (The only 2 `.js` files are `scripts/prepublish.js` / `scripts/postpublish.js` — npm lifecycle scripts, not engine code.)
- Empty `description`, no runtime `main` entry.
- Importing `cc` against this package gives you types for `tsc`; there is nothing executable to `game.init()`. The research doc's "npm `cc`/`cocos-js` engine build" hypothesis for criterion 1 is **falsified** — those packages do not exist as runnable engines.

**The open-source engine is explicitly not meant to be used standalone.** `cocos/cocos-engine` `README.md` (verified from raw source at tag `v3.8.6`):

> "This open-source repository is the runtime engine of Cocos Creator, the engine is naturally integrated within Cocos Creator, **designed to only be the essential runtime library and not to be used independently.**"

**The web build bootstrap is editor-generated.** Per the official Build Process guide (`docs.cocos.com/creator/3.8/manual/en/editor/publish/build-guide.html`): a web build produces `settings.json` (`designResolution; jsList; launchScene; moduleIds; platform; renderPipeline` — "will directly affect the initialization of the game package"), per-bundle `config.json` import maps (`importBase; deps; scenes; rawAssets; packs; versions`), the compiled engine files, and MD5-hashed asset bundles. `game.init()` loads `settings.json`, JS plugins, and project bundles at startup. The guide gives **no** documented path to produce these artifacts or boot the engine without the editor.

### Conclusion
There is no engine to `import` into a Next.js client component code-first. The only routes are (a) run the Cocos Creator editor and consume its build output — explicitly out of scope for this gate — or (b) fork+build `cocos-engine` from source, which the maintainers discourage for standalone use and which still requires editor-shaped `settings.json`/bundle config to boot. The "no editor-generated project scaffolding required at build time" requirement cannot be met. **FAIL.**

---

## Criterion 2 — Runtime GLB load (Draco+WebP): **FAIL** (independent of criterion 1)

Investigated because its failure stands alone and reinforces the verdict.

- **Cocos does not support runtime GLB/glTF loading.** glTF/GLB is an **edit-time import**: "When importing a glTF model into Creator, the assets in glTF will be converted to assets in Creator" (`docs.cocos.com/creator/3.8/manual/en/asset/model/glTF.html`). There is no runtime code path to parse a `.glb`.
- **`assetManager.loadRemote` cannot parse GLB.** It handles only native resource types (texture, audio, text, etc.), not `SpriteFrame`/mesh/glTF parsing (`docs.cocos.com/creator/3.8/manual/en/asset/dynamic-load-resources.html`).
- **Open feature request** confirms the gap: `cocos/cocos-engine` **Issue #16531 "Runtime GLB File Loading Support for Dynamic 3D Models"** — i.e. the community is *asking for* what the trial requires; it does not exist.
- **Draco:** the glTF manual makes no mention of Draco at all — consistent with research `[D-gltf FLAG]`. Moot given GLB itself can't be runtime-loaded.

Our asset pipeline (`public/models3d/CarConcept-draco-webp.glb` loaded at runtime from code) is exactly the unsupported case. Per the plan: *"if runtime glTF loading itself requires editor-preprocessed assets, that is a FAIL."* **FAIL.**

---

## Criterion 3 — PBR + IBL floor: **NOT TESTED** (gated behind criterion 1)

Cocos does have `builtin-standard` PBR + prefiltered-GGX IBL skybox `[D-pbr][D-ibl]`, and clearcoat would require a custom Surface Shader `[D-cc]` — but none of this is reachable code-first without the engine booting. Not evaluated.

## Criterion 4 — Bullet physics code-first: **NOT TESTED** (gated behind criterion 1)

Cocos ships Bullet as default backend with rigidbody + raycast `[D-phys]` and no built-in vehicle `[D-veh]`, but this cannot be exercised without the engine booting code-first. Not evaluated.

---

## Criterion 5 — License (recorded, not adjudicated)

- **Runtime engine:** open-source under the license in the `cocos/cocos-engine` repo (MIT for the engine framework per the research doc's `[D-lic]`; the User Agreement itself only says open-source portions "should comply with the corresponding open source license agreement").
- **Editor / product use — the constraint:** the *Cocos User Service Agreement* (`download.cocos.com/CocosUdc/agreement/Cocos_User_Service_Agreement_en_20220901.html`) states:
  - "Users can use this software and service free of charge **for the purpose of developing games**."
  - "If Users use Cocos Products and Services **for developing applications other than games, they should obtain the Company's written authorization and consent. The Company may charge Users certain fees** according to factors such as the scenario, purpose, and actions of such use."
- **Relevance to us:** a "Virtual Driving School" training simulator is plausibly a *non-game application*. Under these terms, using Cocos for it may require written authorization and fees. This matches research risk `[D-lic]` and remains a live risk even if the technical blockers did not exist. (Fact only — no adjudication here.)

---

## Evidence index

- npm probes: `cc` (C++ linter), `cocos` (cocos2d-html5 0.0.2), `cocos-js` 404, `@cocos-creator-3d/engine` 404, `@cocos/creator-types@3.8.7` = 644 `.d.ts` / 0 engine `.js`.
- `cocos/cocos-engine` README (raw, tag v3.8.6): "not to be used independently."
- Build guide: settings.json / config.json / MD5 bundles are editor build output; `game.init` loads them.
- glTF manual: glTF is edit-time import → native asset conversion; no runtime GLB.
- `dynamic-load-resources`: `loadRemote` = native types only.
- `cocos/cocos-engine` Issue #16531: open request for runtime GLB loading.
- Cocos User Service Agreement (2022-09-01): free for games; non-game needs written authorization + possible fees.

## What proceeding WOULD require (for the record)
1. Install and run the **Cocos Creator editor** (out of scope for this code-first gate) to produce the web build bootstrap (`settings.json`, bundle `config.json`, compiled `cc.js`, MD5 asset bundles), and adopt an editor-in-the-loop build — a fundamentally different pipeline from E1/E2's code-first npm embed.
2. **Pre-import every model through the editor** at edit-time (no runtime GLB); rebuild the asset pipeline around Cocos' native asset format and its own texture compression (ASTC/ETC; KTX2 unsupported `[D-ktx2]`), abandoning the shared Draco+WebP GLB pipeline used by E1/E2.
3. Author a **custom Surface Shader** for clearcoat and a **hand-built raycast vehicle** on Bullet.

The editor dependency (1) alone breaks parity with the E1/E2 code-first comparison basis. Combined with (2), the trial's core premise is unmet. **Branch ends here as a valid, documented trial datum.**
