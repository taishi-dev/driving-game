/**
 * P7a — shell chrome strings (ja/en) for the PlayCanvas product screens.
 *
 * Content decisions follow the settled trial conventions (same as E1/original):
 *  • Driving screen's exit uses the へ form 「ホームへ戻る」; every OTHER screen's
 *    back-home action uses the に form 「ホームに戻る」.
 *  • Technical tokens (PLAYER, LEVEL, BASIC, FREE, MISSION, v2.0 …) stay English
 *    in both languages.
 * P9 (i18n pass) will consolidate every screen's strings; until then the shell
 * keeps its own table here (pure data, no imports).
 */

export type Language = "ja" | "en";

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
    stubComingSoon: "この画面は次のタスクで実装されます。",
    feedbackTitle: "フィードバック",
    tutorialTitle: "チュートリアル",
    authTitle: "ログイン / 登録",
    historyTitle: "走行履歴",
    drivingHint: "W/S: アクセル・ブレーキ / A・D: ハンドル / 1・2・3: ギア P・D・R",
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
    stubComingSoon: "This screen is implemented in the next task.",
    feedbackTitle: "Feedback",
    tutorialTitle: "Tutorial",
    authTitle: "Login / Register",
    historyTitle: "History",
    drivingHint: "W/S: gas & brake / A & D: steering / 1-2-3: gear P-D-R",
  },
} as const;
