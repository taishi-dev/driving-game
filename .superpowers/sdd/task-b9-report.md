# Task B9 report — ja/en internationalization parity

Status: COMPLETE. All product surfaces switch fully with the store `language`, in both directions, verified by headed real-GPU screenshots of every screen in both languages.

## Known defects (from the brief) — all verified and fixed

1. **Home card `desc`/`sub` English-only** — `HomeEntry.desc` in `src/lib/lessonCatalog.ts` changed from `string` to `Localized` with Japanese one-liners for all 10 cards (操作を学ぶ / 基本操作 / 左折の練習 / 右折の練習 / S字カーブ走行 / クランク走行 / 信号機の練習 / 歩行者優先 / 踏切の通過 / 街を自由に走行); `HomeScreen` renders `entry.desc[language]`. `sub` (BASIC / LEVEL 01 / FREE) intentionally stays mono-English — it is a design tag identical to the original app's cards.
2. **ja label drift 信号 vs 信号機** — unified to **信号機**, the wording the original app's `ClientApp.tsx` MISSION_INFO uses for the traffic-light course title (the original HomeScreen card said 信号 — the briefing title was chosen as canonical since both surfaces show it side by side in the port; test locks card label === briefing title).
3. **EN tutorial step 1 hardcoded 、** — the two JSX-baked `、` separators are now `t.welcomeSep` (`、` in ja, `", "` in en). Verified in `b9-tutorial-step1-en.png` (English commas) and `b9-tutorial-step1-ja.png` (、 preserved).
4. **Home language dropdown** — exists (aria-label "Select language", under the title), wired to `setLanguage` (persists to localStorage). Live-switch verified without reload: `b9-toggle-before-en.png` → selectOption('ja') → `b9-toggle-after-ja.png` (entire home switches; localStorage.language === "ja").

## Defects found beyond the known four — fixed

5. **Feedback checkpoint rows leaked wrong-language text in BOTH directions** — rows rendered the frozen `missions.ts` `cp.label`, which is mixed-language ("一時停止" for turns, but "Railroad Crossing Stop"/"Crosswalk Safety Check" in English). EN mode showed "Stop 一時停止 / Mirror check 安全確認" (captured pre-fix); ja mode would show English labels on crosswalk/railroad and a duplicated "一時停止 一時停止". Fix: new `CHECKPOINT_NAMES` id-keyed Localized map in `src/lib/uiStrings.ts` (frozen missions.ts untouched); FeedbackScreen never renders `cp.label`. Completeness test asserts the map covers every scored, non-traffic-light checkpoint in the frozen missions table in both languages.
6. **Home PLAYER header stub English-only** — "PLAYER: GUEST" / "Login / Register" / "History" now localized (プレイヤー: ゲスト / ログイン / 登録 / 走行履歴).
7. **Loading placeholders English-only** — "Loading 3D scene…" (DriveScreenCanvas) and "Loading replay…" (ReplayCanvas) now localized (3Dシーンを読み込み中… / リプレイを読み込み中…).
8. **ErrorBoundary crash fallback English-only** — BabylonApp's boundary now shows 問題が発生しました。/ ページを再読み込みしてください。 in ja (store snapshot read; no hook in class component).
9. **backToHome wording drift** — the port had invented "ホームへ戻る" (StubScreens, DrivingScreen exit) alongside the canonical "ホームに戻る" used by the original app (ui/FeedbackScreen, PauseMenu, HistoryScreen, TutorialScreen). Unified to ホームに戻る via the shared module.

Kept intentionally (match the original app / design):
- Language picker screen is English-only by design (docs/superpowers/plans/0005-i18n-ja-en.md).
- "MISSION:" prefix, "AI Instructor Feedback" heading, "STATUS:" prefix, REPLAY badge context, km/h, FPS badge, card `sub` tags: identical English-in-both-languages treatment as the original components.
- Checkpoint toast strings come from frozen `checkpointEval.ts` (already language-driven via `st.language` in missionRuntime) — not forked.
- `/drive` and `/showroom` test routes stay English per the brief.

## Consolidation decisions

- New pure module `src/lib/uiStrings.ts` (lessonCatalog pattern, no babylon/browser/firebase imports): `COMMON_STRINGS` (`appTitle`, `backToHome` — the two strings that had actually drifted across 3+ screens) + `CHECKPOINT_NAMES`. Deliberately NOT an i18n framework; screen-specific strings stay screen-local per the brief.
- Removed dead `freeMode` key from DrivingScreen STRINGS (duplicated lessonCatalog's `FREE_MODE_TITLE`, never referenced).
- `HomeEntry.desc` type moved to `Localized` (single source for card text stays in lessonCatalog).

## Tests

- New `tests/uiStrings.test.ts` (6 tests, written first per TDD): COMMON_STRINGS ja/en completeness + expected keys + canonical values; CHECKPOINT_NAMES completeness against frozen `MISSION_CHECKPOINTS` (both languages) — this is the parity/completeness test the brief requires.
- `tests/lessonCatalog.test.ts` +2: every HOME_ENTRIES desc localized both ways; traffic-light card label === briefing title === 信号機 (locks defect 2).
- Frozen modules untouched: course.ts, missions.ts, checkpointEval.ts, scoring.ts, replay.ts, store contract. All prior invariants preserved (mirror RTT + bezel, loaders, Havok, strict-mode teardown, no new Firebase imports).

## Gates

- `npm run type-check` — clean.
- `npm run lint` — 0 errors; 2 pre-existing warnings in old R3F files (`src/components/ui/FeedbackScreen.tsx`, `src/components/vision/VisionController.tsx`), identical to baseline, untouched by B9.
- `npm run test:unit` — **134/134 pass** (126 baseline + 8 new; no regressions).

## Screenshot evidence (headed Chromium, 1920x1200, real GPU; all in `.claude/skills/run-driving/shots/`)

| Screen | en | ja |
| --- | --- | --- |
| Language picker (first launch) | b9-language-picker.png (English by design) | — |
| Home (cards + header + toggle) | b9-home-en.png | b9-home-ja.png |
| Briefing (left-turn) | b9-briefing-en.png | b9-briefing-ja.png |
| Driving HUD (title, key hint, speed/throttle/brake/steer, exit) | b9-driving-hud-en.png | b9-driving-hud-ja.png |
| Feedback (score, AI feedback, checkpoints, replay labels) | b9-feedback-en.png | b9-feedback-ja.png |
| Feedback driver-cam toggle | b9-feedback-driver-en.png | b9-feedback-driver-ja.png |
| Tutorial step 1 (separator fix) | b9-tutorial-step1-en.png | b9-tutorial-step1-ja.png |
| Tutorial step 4 (calibration) | b9-tutorial-step4-en.png | b9-tutorial-step4-ja.png |
| Auth stub | b9-auth-en.png | b9-auth-ja.png |
| History stub | b9-history-en.png | b9-history-ja.png |
| Live toggle (no reload) | b9-toggle-before-en.png | b9-toggle-after-ja.png |

All PNGs were read back and confirmed free of residual wrong-language strings. Feedback screens were re-captured after the checkpoint-name fix (the pre-fix EN capture showing "Stop 一時停止" was the discovery evidence for defect 5).

Verification scripts: `shot-b9-light.mjs` (picker/home/tutorial/stubs/toggle, both languages) and `shot-b9-drive.mjs` (briefing/HUD/feedback per language, teleport hook) in `.claude/skills/run-driving/shots/`.

## Concerns

- An earlier single-monolithic sweep script hung mid-run and left an orphaned headed Chromium (node crashed silently); it was replaced by the two smaller scripts above. No product impact.
- The `sub` card tags and technical HUD tokens (km/h, FPS, STATUS:, MISSION:) remain English in ja mode by deliberate fidelity to the original app; flag if the product owner wants them localized too.
- History/Auth are B10 stubs; the original HistoryScreen's rich strings (loading/error/rank UI) will need porting with B10 — its bilingual STRINGS block in `src/components/ui/HistoryScreen.tsx` is the reference.

## Fix round (review findings)

Three defects identified in the B9 i18n commit review were fixed:

1. **Important: Wrong canonical Japanese for DrivingScreen exit button** — added `exitToHome: { ja: "ホームへ戻る", en: "Back to Home" }` to `COMMON_STRINGS` in `src/lib/uiStrings.ts` (with a comment noting へ for DrivingScreen vs に for FeedbackScreen/TutorialScreen per the original app). Updated `src/components/babylon/product/DrivingScreen.tsx:212` to use `COMMON_STRINGS.exitToHome[language]` instead of `backToHome`. Added test assertion in `tests/uiStrings.test.ts` to verify both keys and their canonical values.

2. **Minor: Duplicated type definitions** — removed duplicate `Language` and `Localized` type declarations from `src/lib/uiStrings.ts` (lines 18-23) and replaced with `export type { Language, Localized } from "./lessonCatalog"` to maintain the public API while sourcing from the single definition in lessonCatalog.ts.

3. **Minor: Untyped LOADING_TEXT objects** — added `satisfies Localized` to `LOADING_TEXT` constants in `src/components/babylon/product/DriveScreenCanvas.tsx:20` and `src/components/babylon/product/ReplayCanvas.tsx:11`, importing `Localized` type from uiStrings. Missing keys now fail at compile time.

### Gates

- `npm run type-check` — clean.
- `npm run lint` — 0 errors; 2 pre-existing warnings (unchanged).
- `npm run test:unit` — **135/135 pass** (134 baseline + 1 new; no regressions).

### Changed files

- `src/lib/uiStrings.ts` — added `exitToHome` key; de-duplicated `Language` and `Localized` types via re-export.
- `src/components/babylon/product/DrivingScreen.tsx` — updated exit button to use `COMMON_STRINGS.exitToHome`.
- `src/components/babylon/product/DriveScreenCanvas.tsx` — added `satisfies Localized` to LOADING_TEXT.
- `src/components/babylon/product/ReplayCanvas.tsx` — added `satisfies Localized` to LOADING_TEXT.
- `tests/uiStrings.test.ts` — updated expected keys test; added canonical-value test for `exitToHome`.
