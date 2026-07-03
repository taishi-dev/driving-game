/**
 * B9 — shared ja/en strings used by MORE THAN ONE product screen.
 *
 * Before this module, `appTitle` and the "back to Home" nav label were each
 * defined locally in 3+ screens' own `STRINGS` blocks and had drifted. This
 * module is now the single source of truth for the strings shared across
 * screens:
 *   - `appTitle` — the plain app name;
 *   - `backToHome` — the canonical "ホームに戻る" (に particle) used by
 *     FeedbackScreen / TutorialScreen / HistoryScreen, matching the original
 *     app's `ui/FeedbackScreen.tsx`, `ui/PauseMenu.tsx`, `ui/HistoryScreen.tsx`,
 *     `ui/TutorialScreen.tsx`;
 *   - `exitToHome` — the DrivingScreen exit button's "ホームへ戻る" (へ
 *     particle). This is a DELIBERATE per-screen wording difference (it matches
 *     the original DrivingScreen pause overlay), NOT drift — hence a separate
 *     key rather than folding it into `backToHome`.
 * Screen-specific strings that legitimately differ in wording per screen (e.g.
 * the tutorial's closing CTA "Return Home") stay local per the B9 brief's "keep
 * pragmatic" guidance.
 *
 * Pure (no @babylonjs / browser / firebase imports), following the
 * `lessonCatalog.ts` pattern so it is exercised by `node --test` directly.
 */

// Re-export types from lessonCatalog (single source of truth).
export type { Language, Localized } from "./lessonCatalog";

import type { Localized } from "./lessonCatalog";

export const COMMON_STRINGS = {
  /** Plain (non-stylized) app name, used wherever the title isn't split into
   * a two-tone heading (the Home/Language screens keep their own stylized
   * split for the colored-span branding treatment). */
  appTitle: { ja: "バーチャル教習所", en: "Virtual Driving School" },
  /** Canonical "return to Home" nav action, shared by FeedbackScreen,
   * TutorialScreen, and HistoryScreen (uses に particle per original app). */
  backToHome: { ja: "ホームに戻る", en: "Back to Home" },
  /** DrivingScreen exit button "Back to Home" — uses へ particle per original
   * DrivingScreen pause overlay (ClientApp.tsx), distinct from backToHome's に. */
  exitToHome: { ja: "ホームへ戻る", en: "Back to Home" },
} as const satisfies Record<string, Localized>;

/**
 * Localized display names for feedback's per-checkpoint result rows, keyed by
 * checkpoint id. The frozen `missions.ts` `label` field is MIXED language
 * ("一時停止" vs "Railroad Crossing Stop") and is display-unreliable in either
 * language, so — following the original app's resolved i18n approach for
 * checkpoint-derived text (type-and-language driven, docs plan 0005) — the
 * feedback list derives its own bilingual names and never renders `cp.label`.
 * Ids are shared across lessons with identical semantics (left/right turn both
 * use stop-1 / mirror-1). Kept here (pure) so the completeness test can assert
 * coverage of every scored checkpoint in the frozen missions table.
 */
export const CHECKPOINT_NAMES: Record<string, Localized> = {
  "stop-1": { ja: "一時停止", en: "Stop at the line" },
  "mirror-1": { ja: "安全確認", en: "Mirror safety check" },
  "cw-safety-1": { ja: "横断歩道の安全確認", en: "Crosswalk safety check" },
  "rr-stop-1": { ja: "踏切前の一時停止", en: "Stop before the crossing" },
};
