/**
 * P7a — shell chrome strings (ja/en) for the PlayCanvas product screens.
 * P9 — audited against E1's settled `uiStrings.ts` canon and extended with the
 * few genuinely-shared strings that were still embedded in component files
 * (CHECKPOINT_NAMES) or hardcoded English-only (the physics loading/error
 * placeholder, the top-level error-boundary fallback) — see the P9 report for
 * the full screen×language audit table.
 *
 * Content decisions follow the settled trial conventions (same as E1/original):
 *  • Driving screen's exit uses the へ form 「ホームへ戻る」; every OTHER screen's
 *    back-home action uses the に form 「ホームに戻る」.
 *  • Technical tokens (PLAYER, LEVEL, BASIC, FREE, MISSION, v2.0 …) stay English
 *    in both languages.
 *  • `exitHome`/`backHome` bake their icon glyph (✕) into the string, unlike
 *    E1's `uiStrings.ts` which renders the icon separately in JSX — a
 *    structural difference only; the localized wording underneath is
 *    identical to E1's canonical `exitToHome`/`backToHome` values, so this is
 *    NOT drift and is intentionally left as-is (changing it would touch every
 *    call site for zero user-visible or textual benefit).
 *
 * Pure data module (no react/browser/firebase imports) so `node --test`
 * exercises it directly — same pattern as `pcLessonCatalog.ts`.
 */

export type Language = "ja" | "en";

/** A ja/en string pair (mirrors `pcLessonCatalog.ts`'s `Localized`). */
export interface Localized {
  ja: string;
  en: string;
}

export const SHELL_STRINGS = {
  ja: {
    appTitleA: "バーチャル",
    appTitleB: "教習所",
    subtitle: "シミュレーションシステム v2.0",
    selectCourse: "コースを選択",
    systemsReady: "全システム準備完了",
    playerGuest: "プレイヤー: ゲスト",
    playerPrefix: "プレイヤー: ",
    login: "ログイン / 登録",
    history: "走行履歴",
    logout: "ログアウト",
    startMission: "ミッション開始",
    exitHome: "✕ ホームへ戻る", // へ form: DRIVING screen only (settled convention)
    backHome: "ホームに戻る", // に form: everywhere else
    speedUnit: "km/h",
    gearLabel: "ギア",
    feedbackTitle: "フィードバック",
    tutorialTitle: "チュートリアル",
    drivingHint: "W/S: アクセル・ブレーキ / A・D: ハンドル / 1・2・3: ギア P・D・R",
    // P9: the Ammo physics gate (DriveCanvas) is user-visible on every drive/
    // replay entry, so it must localize like the rest of the driving screen
    // (was English-only in both languages — an E1-precedented defect class).
    physicsLoading: "物理エンジンを読み込み中…",
    physicsFailedPrefix: "物理エンジン(Ammo)の読み込みに失敗しました: ",
    // P9: top-level error-boundary fallback (ProductApp) — rare, but was
    // English-only in both languages.
    errorTitle: "問題が発生しました。",
    errorBody: "ページを再読み込みしてください。問題が解決しない場合は、サポートにご連絡ください。",
  },
  en: {
    appTitleA: "VIRTUAL",
    appTitleB: "DRIVING SCHOOL",
    subtitle: "SIMULATION SYSTEM v2.0",
    selectCourse: "SELECT COURSE",
    systemsReady: "ALL SYSTEMS READY",
    playerGuest: "PLAYER: GUEST",
    playerPrefix: "PLAYER: ",
    login: "Login / Register",
    history: "History",
    logout: "Logout",
    startMission: "Start Mission",
    exitHome: "✕ Back to Home",
    backHome: "Back to Home",
    speedUnit: "km/h",
    gearLabel: "GEAR",
    feedbackTitle: "Feedback",
    tutorialTitle: "Tutorial",
    drivingHint: "W/S: gas & brake / A & D: steering / 1-2-3: gear P-D-R",
    physicsLoading: "Loading physics…",
    physicsFailedPrefix: "Failed to load physics (Ammo): ",
    errorTitle: "Something went wrong.",
    errorBody: "Please reload the page. If the problem persists, contact support.",
  },
} as const;

/**
 * Localized display names for the feedback screen's per-checkpoint result
 * rows, keyed by checkpoint id. Moved here from `FeedbackScreen.tsx` (P9) so
 * it is a pure, testable module — the frozen `missions.ts` `label` field is
 * MIXED language ("一時停止" vs "Railroad Crossing Stop") and
 * display-unreliable in either language, so — the settled trial approach (E1
 * precedent, `uiStrings.ts`) — the feedback list derives its own bilingual
 * names and NEVER renders `cp.label`. Covers every scored checkpoint id in
 * the frozen table; the type-name is the fallback for any future id.
 */
export const CHECKPOINT_NAMES: Record<string, Localized> = {
  "stop-1": { ja: "一時停止", en: "Stop at the line" },
  "mirror-1": { ja: "安全確認", en: "Mirror safety check" },
  "cw-safety-1": { ja: "横断歩道の安全確認", en: "Crosswalk safety check" },
  "rr-stop-1": { ja: "踏切前の一時停止", en: "Stop before the crossing" },
};
