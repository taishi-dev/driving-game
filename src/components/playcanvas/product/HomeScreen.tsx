"use client";

import dynamic from "next/dynamic";
import { useDrivingStore } from "@/lib/store";
import { HOME_CARDS, type HomeCard } from "@/lib/pcLessonCatalog";
import { auth } from "@/lib/firebase";
import { SHELL_STRINGS } from "./productStrings";

// The hero background is the P2/P3 PlayCanvas showroom scene (static camera, no
// rotation) — client-only for the same WebGL/SSR reason as every canvas here.
const ShowroomHero = dynamic(() => import("./ShowroomHero"), { ssr: false });

/**
 * P7a — product Home: the showroom hero as backdrop, lesson-select cards for
 * all nine LessonIds + the tutorial card + free mode, a live language dropdown,
 * and the PLAYER/GUEST header with Login/History/Logout links.
 *
 * P10: auth is real. `user` is populated by AuthScreen on sign-in and restored
 * on reload by ProductApp's onAuthStateChanged listener; a signed-in user sees
 * their name + History|Logout, a guest sees GUEST + Login|History (original
 * ClientApp UserProfileHeader semantics).
 *
 * Routing semantics follow the original HomeScreen: tutorial → tutorial screen;
 * free-mode → setLesson (store puts missionState straight to "active") →
 * driving; graded lesson → setLesson (store puts missionState to "briefing",
 * the DrivingScreen shows the overlay) → driving.
 */
export function HomeScreen() {
  const setLesson = useDrivingStore((s) => s.setLesson);
  const setScreen = useDrivingStore((s) => s.setScreen);
  const language = useDrivingStore((s) => s.language);
  const setLanguage = useDrivingStore((s) => s.setLanguage);
  const user = useDrivingStore((s) => s.user);
  const setUser = useDrivingStore((s) => s.setUser);
  const setMissionHistory = useDrivingStore((s) => s.setMissionHistory);
  const t = SHELL_STRINGS[language];

  // Original ClientApp logout semantics: sign out (fail-soft: `auth` is null
  // when unconfigured — but then nobody can be logged in anyway), then clear
  // the store's user + cached history.
  const handleLogout = async () => {
    if (auth) await auth.signOut();
    setUser(null);
    setMissionHistory([]);
  };

  const handleSelect = (card: HomeCard) => {
    if (card.kind === "tutorial") {
      setScreen("tutorial");
      return;
    }
    // Lesson + free mode: setLesson drives the missionState machine in the
    // frozen store ("briefing" for graded lessons, "active" for free-mode).
    setLesson(card.id as Exclude<HomeCard["id"], "tutorial">);
    setScreen("driving");
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-black text-white selection:bg-blue-500 selection:text-white">
      {/* 3D showroom hero background — z-0 */}
      <div className="absolute inset-0 z-0">
        <ShowroomHero />
      </div>

      {/* Overlay UI — z-10 */}
      <div className="absolute inset-0 z-10 flex flex-col justify-between pointer-events-none">
        {/* Top bar */}
        <div className="w-full p-8 flex justify-between items-start pointer-events-auto bg-gradient-to-b from-black/80 to-transparent">
          <div>
            <h1 className="text-5xl font-extrabold italic tracking-tighter text-white drop-shadow-md">
              {t.appTitleA} <span className="text-blue-500">{t.appTitleB}</span>
            </h1>
            <p className="text-sm font-bold text-slate-400 tracking-[0.3em] mt-2">{t.subtitle}</p>

            {/* Live language selector, persisted by the store. */}
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

          {/* Player header: name/GUEST + Login|History or Logout|History (P10). */}
          <div className="flex flex-col items-end gap-2">
            <div
              data-testid="player-header"
              className="px-6 py-2 bg-slate-800/90 border-l-4 border-blue-500 rounded-r text-sm font-mono tracking-widest"
            >
              {user
                ? t.playerPrefix + (user.email?.split("@")[0]?.toUpperCase() || "DRIVER")
                : t.playerGuest}
            </div>
            <div className="flex gap-3 text-xs font-mono">
              {user ? (
                <button
                  data-testid="home-logout"
                  onClick={handleLogout}
                  className="text-slate-400 hover:text-red-400 transition-colors"
                >
                  {t.logout}
                </button>
              ) : (
                <button
                  data-testid="home-login"
                  onClick={() => setScreen("auth")}
                  className="text-cyan-400 hover:text-cyan-300 transition-colors underline"
                >
                  {t.login}
                </button>
              )}
              <span className="text-slate-600">|</span>
              <button
                data-testid="home-history"
                onClick={() => setScreen("history")}
                className="text-cyan-400 hover:text-cyan-300 transition-colors underline"
              >
                {t.history}
              </button>
            </div>
          </div>
        </div>

        {/* Bottom: course cards */}
        <div className="w-full p-8 pb-12 pointer-events-auto bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col justify-end">
          <div className="mb-4 flex items-end gap-4 border-b border-white/20 pb-2 max-w-4xl">
            <h2 className="text-2xl font-bold tracking-wider text-white">{t.selectCourse}</h2>
            <span className="text-sm text-blue-400 font-mono mb-1 animate-pulse">/ {t.systemsReady}</span>
          </div>

          <div className="flex items-end gap-6 overflow-x-auto pb-4 pt-2 snap-x scrollbar-hide">
            {HOME_CARDS.map((card, index) => (
              <button
                key={card.id}
                data-testid={`lesson-${card.id}`}
                onClick={() => handleSelect(card)}
                className="group relative flex-shrink-0 w-72 h-48 bg-slate-900/80 border-t-4 border-slate-600 hover:border-blue-500 transition-all duration-300 transform hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] snap-center overflow-hidden"
                style={{ clipPath: "polygon(0 0, 100% 0, 100% 85%, 90% 100%, 0 100%)" }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-blue-900/0 to-blue-900/20 group-hover:to-blue-600/20 transition-all duration-300" />

                <div className="absolute inset-0 p-6 flex flex-col justify-between text-left">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-black text-slate-500 bg-slate-950 px-2 py-1 rounded border border-slate-800 group-hover:text-blue-400 group-hover:border-blue-500/50 transition-colors">
                      {card.sub}
                    </span>
                    <div
                      className={`w-3 h-3 rounded-full ${index === 0 ? "bg-green-500 shadow-[0_0_10px_#22c55e]" : "bg-slate-700"}`}
                    />
                  </div>

                  <div>
                    <h3 className="text-2xl font-black italic text-white group-hover:text-blue-300 mb-1">
                      {card.label[language]}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">{card.desc[language]}</p>
                  </div>

                  <div className="flex justify-between items-end">
                    <div className="text-4xl font-black text-slate-800 group-hover:text-slate-700 select-none">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <span className="text-sm font-bold text-blue-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transform translate-x-4 group-hover:translate-x-0 transition-all duration-300">
                      START <span className="text-lg">»</span>
                    </span>
                  </div>
                </div>
              </button>
            ))}

            {/* Scroll-padding spacer */}
            <div className="w-12 flex-shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
}
