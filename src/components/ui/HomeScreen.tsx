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
    <div className="w-full h-full relative overflow-hidden bg-neutral-950 text-neutral-100 font-sans selection:bg-red-600 selection:text-white">
      {/* 3D Background - z-0 */}
      <div className="absolute inset-0 z-0">
        <GarageScene />
      </div>

      {/* Overlay UI - z-10 */}
      <div className="absolute inset-0 z-10 flex flex-col justify-between pointer-events-none">
        {/* Top Bar */}
        <div className="w-full p-8 flex justify-between items-start pointer-events-auto bg-gradient-to-b from-neutral-950/90 to-transparent">
          <div>
            <h1 className="text-5xl font-semibold not-italic tracking-tight text-neutral-100">
              VIRTUAL <span className="text-red-600">DRIVING</span> SCHOOL
            </h1>
            <p className="text-xs font-mono text-neutral-500 tracking-[0.3em] mt-2 tabular-nums">TELEMETRY SYSTEM · v2.0</p>

            <select
              aria-label="Select language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'ja' | 'en')}
              className="mt-4 bg-neutral-900/80 text-neutral-100 text-sm font-medium px-3 py-1.5 rounded-sm border border-neutral-700 hover:border-red-600 focus:border-red-600 focus:outline-none transition-colors cursor-pointer"
            >
              <option value="ja">日本語 (Japanese)</option>
              <option value="en">English (English)</option>
            </select>
          </div>
        </div>

        {/* Bottom Area: Carousel */}
        <div className="w-full p-8 pb-12 pointer-events-auto bg-gradient-to-t from-neutral-950/95 via-neutral-950/50 to-transparent flex flex-col justify-end">
          <div className="mb-4 flex items-end gap-4 border-b border-neutral-700 pb-2 max-w-4xl">
            <h2 className="text-xl font-semibold tracking-widest text-neutral-200 uppercase">Select Course</h2>
            <span className="text-xs text-red-500 font-mono mb-1 tabular-nums">/ SYSTEMS NOMINAL</span>
          </div>

          <div className="flex items-end gap-4 overflow-x-auto pb-4 pt-2 snap-x scrollbar-hide">
            {LESSONS.map((lesson, index) => (
              <button
                key={lesson.id}
                onClick={() => handleSelectLesson(lesson.id)}
                className="group relative flex-shrink-0 w-72 h-48 bg-neutral-900/80 rounded-sm border border-neutral-700 hover:border-red-600 transition-all duration-200 transform hover:-translate-y-1 snap-center overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-red-950/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

                <div className="absolute inset-0 p-6 flex flex-col justify-between text-left">
                  <div className="flex justify-between items-start">
                    <span className="text-[11px] font-mono tabular-nums text-neutral-400 bg-neutral-950 px-2 py-1 rounded-sm border border-neutral-800 group-hover:text-neutral-200 group-hover:border-neutral-600 transition-colors">
                      {lesson.sub}
                    </span>
                    <div className={`w-2.5 h-2.5 rounded-full ${index === 0 ? "bg-red-600" : "bg-neutral-700"}`} />
                  </div>

                  <div>
                    <h3 className="text-2xl font-semibold not-italic text-neutral-100 group-hover:text-white mb-1">{lesson.label[language]}</h3>
                    <p className="text-xs text-neutral-500 font-mono">{lesson.desc}</p>
                  </div>

                  <div className="flex justify-between items-end">
                    <div className="text-4xl font-mono tabular-nums font-bold text-neutral-800 group-hover:text-neutral-700 select-none">
                      0{index + 1}
                    </div>

                    <span className="text-sm font-semibold text-red-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      START <span className="text-lg">›</span>
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