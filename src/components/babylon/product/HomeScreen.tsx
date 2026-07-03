"use client";

import dynamic from "next/dynamic";
import { useDrivingStore } from "@/lib/store";
import { HOME_ENTRIES, type HomeEntry } from "@/lib/lessonCatalog";

// Babylon showroom hero as a static background. Client-only (WebGL/window).
const HomeHeroCanvas = dynamic(() => import("./HomeHeroCanvas"), { ssr: false });

const STRINGS = {
  ja: {
    title1: "バーチャル",
    title2: "教習所",
    subtitle: "シミュレーションシステム v2.0",
    select: "コースを選択",
    ready: "/ 全システム準備完了",
    start: "開始",
    player: "プレイヤー: ゲスト",
    loginRegister: "ログイン / 登録",
    history: "走行履歴",
  },
  en: {
    title1: "VIRTUAL",
    title2: "DRIVING SCHOOL",
    subtitle: "SIMULATION SYSTEM v2.0",
    select: "SELECT COURSE",
    ready: "/ ALL SYSTEMS READY",
    start: "START",
    player: "PLAYER: GUEST",
    loginRegister: "Login / Register",
    history: "History",
  },
} as const;

/**
 * B7b Home screen (rewritten for the Babylon port — does NOT import the old R3F
 * HomeScreen/GarageScene). Static Babylon showroom hero behind an overlay: title,
 * language toggle, a stubbed PLAYER header, and lesson-select cards driven by the
 * pure `lessonCatalog`. Selecting a card routes via the engine-agnostic store:
 *   - tutorial  -> tutorial screen
 *   - free-mode -> setLesson (store sets missionState "active") + driving
 *   - lesson    -> setLesson (store sets missionState "briefing") + driving
 */
export function HomeScreen() {
  const setLesson = useDrivingStore((s) => s.setLesson);
  const setScreen = useDrivingStore((s) => s.setScreen);
  const language = useDrivingStore((s) => s.language);
  const setLanguage = useDrivingStore((s) => s.setLanguage);
  const t = STRINGS[language];

  const handleSelect = (entry: HomeEntry) => {
    if (entry.kind === "tutorial") {
      setScreen("tutorial");
      return;
    }
    // setLesson resolves missionState: free-mode -> "active", else "briefing".
    setLesson(entry.id as Exclude<typeof entry.id, "tutorial">);
    setScreen("driving");
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-black text-white font-sans">
      {/* Babylon hero background */}
      <div className="absolute inset-0 z-0">
        <HomeHeroCanvas />
      </div>

      {/* PLAYER header stub (real auth is B10). */}
      <div className="absolute top-6 right-6 z-20 flex flex-col items-end gap-2 pointer-events-auto">
        <div className="px-5 py-2 bg-slate-800/90 border-l-4 border-blue-500 rounded-r text-sm font-mono tracking-widest">
          {t.player}
        </div>
        <div className="flex gap-3 text-xs font-mono">
          <button onClick={() => setScreen("auth")} className="text-cyan-400 hover:text-cyan-300 transition-colors">
            {t.loginRegister}
          </button>
          <span className="text-slate-600">|</span>
          <button onClick={() => setScreen("history")} className="text-cyan-400 hover:text-cyan-300 transition-colors underline">
            {t.history}
          </button>
        </div>
      </div>

      {/* Overlay UI */}
      <div className="absolute inset-0 z-10 flex flex-col justify-between pointer-events-none">
        {/* Top bar */}
        <div className="w-full p-8 pointer-events-auto bg-gradient-to-b from-black/80 to-transparent">
          <h1 className="text-5xl font-extrabold italic tracking-tighter drop-shadow-md">
            {t.title1} <span className="text-blue-500">{t.title2}</span>
          </h1>
          <p className="text-sm font-bold text-slate-400 tracking-[0.3em] mt-2">{t.subtitle}</p>
          <select
            aria-label="Select language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as "ja" | "en")}
            className="mt-4 bg-slate-800/80 text-white text-sm font-bold px-3 py-1.5 rounded border border-slate-700 hover:border-blue-500 focus:border-blue-500 focus:outline-none transition-colors cursor-pointer"
          >
            <option value="ja">日本語 (Japanese)</option>
            <option value="en">English (English)</option>
          </select>
        </div>

        {/* Lesson carousel */}
        <div className="w-full p-8 pb-12 pointer-events-auto bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col justify-end">
          <div className="mb-4 flex items-end gap-4 border-b border-white/20 pb-2 max-w-4xl">
            <h2 className="text-2xl font-bold tracking-wider">{t.select}</h2>
            <span className="text-sm text-blue-400 font-mono mb-1 animate-pulse">{t.ready}</span>
          </div>

          <div className="flex items-end gap-6 overflow-x-auto pb-4 pt-2 snap-x">
            {HOME_ENTRIES.map((entry, index) => (
              <button
                key={entry.id}
                onClick={() => handleSelect(entry)}
                data-testid={`lesson-${entry.id}`}
                className="group relative flex-shrink-0 w-72 h-48 bg-slate-900/80 border-t-4 border-slate-600 hover:border-blue-500 transition-all duration-300 transform hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] snap-center overflow-hidden"
                style={{ clipPath: "polygon(0 0, 100% 0, 100% 85%, 90% 100%, 0 100%)" }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-blue-900/0 to-blue-900/20 group-hover:to-blue-600/20 transition-all duration-300" />
                <div className="absolute inset-0 p-6 flex flex-col justify-between text-left">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-black text-slate-500 bg-slate-950 px-2 py-1 rounded border border-slate-800 group-hover:text-blue-400 group-hover:border-blue-500/50 transition-colors">
                      {entry.sub}
                    </span>
                    <div className={`w-3 h-3 rounded-full ${index === 0 ? "bg-green-500 shadow-[0_0_10px_#22c55e]" : "bg-slate-700"}`} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black italic group-hover:text-blue-300 mb-1">{entry.label[language]}</h3>
                    <p className="text-xs text-slate-400 font-mono">{entry.desc[language]}</p>
                  </div>
                  <div className="flex justify-between items-end">
                    <div className="text-4xl font-black text-slate-800 group-hover:text-slate-700 select-none">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <span className="text-sm font-bold text-blue-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transform translate-x-4 group-hover:translate-x-0 transition-all duration-300">
                      {t.start} <span className="text-lg">»</span>
                    </span>
                  </div>
                </div>
              </button>
            ))}
            <div className="w-12 flex-shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
}
