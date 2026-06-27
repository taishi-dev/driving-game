import { useDrivingStore } from "@/lib/store";
import { GarageScene } from "../simulation/GarageScene";

// Added level 7+. Labels are bilingual (ja/en); `desc` is already English.
const LESSONS = [
  { id: "tutorial", label: { ja: "チュートリアル", en: "Tutorial" }, sub: "BASIC", desc: "LEARN CONTROLS", icon: "TUTORIAL" },
  { id: "straight", label: { ja: "直線走行", en: "Straight Driving" }, sub: "LEVEL 01", desc: "BASIC CONTROL", icon: "START" },
  { id: "left-turn", label: { ja: "左折", en: "Left Turn" }, sub: "LEVEL 02", desc: "TURNING LEFT", icon: "LEFT" },
  { id: "right-turn", label: { ja: "右折", en: "Right Turn" }, sub: "LEVEL 03", desc: "TURNING RIGHT", icon: "RIGHT" },
  { id: "s-curve", label: { ja: "S字カーブ", en: "S-Curve" }, sub: "LEVEL 04", desc: "S-CURVE", icon: "S" },
  { id: "crank", label: { ja: "クランク", en: "Crank" }, sub: "LEVEL 05", desc: "CRANK", icon: "C" },
  { id: "traffic-light", label: { ja: "信号", en: "Traffic Light" }, sub: "LEVEL 06", desc: "TRAFFIC LIGHT PRACTICE", icon: "TL" },
  { id: "crosswalk", label: { ja: "横断歩道", en: "Crosswalk" }, sub: "LEVEL 07", desc: "STOP FOR PEDESTRIANS", icon: "CW" },
  { id: "railroad-crossing", label: { ja: "踏切", en: "Railroad Crossing" }, sub: "LEVEL 08", desc: "RAILROAD CROSSING", icon: "RC" },
  { id: "free-mode", label: { ja: "フリーモード", en: "Free Mode" }, sub: "FREE", desc: "EXPLORE THE CITY", icon: "FREE" },
] as const;

export function HomeScreen() {
  const setLesson = useDrivingStore((state) => state.setLesson);
  const setScreen = useDrivingStore((state) => state.setScreen);
  const setMissionState = useDrivingStore((state) => state.setMissionState);
  const language = useDrivingStore((state) => state.language);
  const setLanguage = useDrivingStore((state) => state.setLanguage);

  const handleSelectLesson = (lessonId: (typeof LESSONS)[number]["id"]) => {
    // チュートリアルは特別扱い
    if (lessonId === "tutorial") {
        setScreen("tutorial");
        return;
    }

    setLesson(lessonId);

    // free-mode はブリーフィング/ゴール判定なしで即運転
    if (lessonId === "free-mode") {
      setMissionState("active");
      setScreen("driving");
      return;
    }

    setMissionState("briefing");
    setScreen("driving");
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-black text-white font-sans selection:bg-amber-500 selection:text-black">
      {/* 3D Background - z-0 */}
      <div className="absolute inset-0 z-0">
        <GarageScene />
      </div>

      {/* Overlay UI - z-10 */}
      <div className="absolute inset-0 z-10 flex flex-col justify-between pointer-events-none">
        {/* Top Bar */}
        <div className="w-full p-8 flex justify-between items-start pointer-events-auto bg-gradient-to-b from-black/85 to-transparent">
          <div>
            <h1 className="text-6xl font-black italic tracking-tighter text-white drop-shadow-[0_0_18px_rgba(0,0,0,0.7)]">
              VIRTUAL{" "}
              <span className="text-amber-400 drop-shadow-[0_0_25px_rgba(251,191,36,0.85)]">DRIVING</span>{" "}
              SCHOOL
            </h1>
            <p className="text-sm font-black italic text-amber-300/80 tracking-[0.35em] mt-2">NITRO SIMULATION v2.0</p>

            <select
              aria-label="Select language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'ja' | 'en')}
              className="mt-4 bg-black/70 text-white text-sm font-bold px-3 py-1.5 rounded border border-amber-500/40 hover:border-amber-400 focus:border-amber-400 focus:outline-none transition-colors cursor-pointer"
            >
              <option value="ja">日本語 (Japanese)</option>
              <option value="en">English (English)</option>
            </select>
          </div>
        </div>

        {/* Bottom Area: Carousel */}
        <div className="w-full p-8 pb-12 pointer-events-auto bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col justify-end">
          <div className="mb-4 flex items-end gap-4 border-b border-amber-400/30 pb-2 max-w-4xl">
            <h2 className="text-2xl font-black italic tracking-wider text-white">SELECT COURSE</h2>
            <span className="text-sm text-amber-400 font-mono mb-1 animate-pulse">/ ALL SYSTEMS READY</span>
          </div>

          <div className="flex items-end gap-6 overflow-x-auto pb-4 pt-2 snap-x scrollbar-hide">
            {LESSONS.map((lesson, index) => (
              <button
                key={lesson.id}
                onClick={() => handleSelectLesson(lesson.id)}
                className="group relative flex-shrink-0 w-72 h-48 bg-slate-900/80 border-t-4 border-amber-500/60 hover:border-amber-400 transition-all duration-200 transform hover:-translate-y-3 hover:scale-[1.03] hover:shadow-[0_0_45px_rgba(251,191,36,0.5)] snap-center overflow-hidden"
                style={{ clipPath: "polygon(0 0, 100% 0, 100% 85%, 90% 100%, 0 100%)" }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-amber-900/0 to-amber-600/25 opacity-60 group-hover:opacity-100 transition-all duration-200" />

                <div className="absolute inset-0 p-6 flex flex-col justify-between text-left">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-black text-amber-200/70 bg-slate-950 px-2 py-1 rounded border border-amber-500/30 group-hover:text-amber-300 group-hover:border-amber-400/60 transition-colors">
                      {lesson.sub}
                    </span>
                    <div className={`w-3 h-3 rounded-full ${index === 0 ? "bg-amber-400 shadow-[0_0_12px_#fbbf24]" : "bg-slate-700"}`} />
                  </div>

                  <div>
                    <h3 className="text-2xl font-black italic text-white group-hover:text-amber-300 mb-1">{lesson.label[language]}</h3>
                    <p className="text-xs text-amber-200/60 font-mono">{lesson.desc}</p>
                  </div>

                  <div className="flex justify-between items-end">
                    <div className="text-4xl font-black italic text-slate-800 group-hover:text-amber-500/40 select-none">
                      0{index + 1}
                    </div>

                    <span className="text-sm font-black italic text-amber-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transform translate-x-4 group-hover:translate-x-0 transition-all duration-200">
                      START <span className="text-lg">»</span>
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