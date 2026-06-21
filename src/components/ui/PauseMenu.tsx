import { useDrivingStore } from "@/lib/store";

const STRINGS = {
  ja: {
    resume: "再開する",
    backToHome: "ホームに戻る",
  },
  en: {
    resume: "Resume",
    backToHome: "Back to Home",
  },
} as const;

export function PauseMenu() {
  const isPaused = useDrivingStore(state => state.isPaused);
  const setIsPaused = useDrivingStore(state => state.setIsPaused);
  const setScreen = useDrivingStore(state => state.setScreen);
  const setMissionState = useDrivingStore(state => state.setMissionState);
  const language = useDrivingStore(state => state.language);
  const t = STRINGS[language];

  // Toggling pause with the Esc key is handled in Scene or a global event listener,
  // but if this menu is open, Esc should probably close it.

  if (!isPaused) return null;

  const handleHome = () => {
    setIsPaused(false);
    setMissionState('idle'); // Clear mission
    setScreen('home');
  };

  return (
    <div
        className="absolute top-0 left-0 w-full h-full z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 w-[400px] shadow-2xl animate-in fade-in zoom-in duration-200">
        <h2 className="text-3xl font-bold text-center mb-8 text-white">PAUSED</h2>

        <div className="flex flex-col gap-4">
          <button
            onClick={() => setIsPaused(false)}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors"
          >
            {t.resume}
          </button>

          <button
            onClick={handleHome}
            className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors border border-slate-600"
          >
            {t.backToHome}
          </button>
        </div>
      </div>
    </div>
  );
}
