"use client";

import { useDrivingStore } from "@/lib/store";

// First-launch language selection page. Presented in English. It is shown only
// when no language has been chosen yet (see the `screen` init in store.ts);
// choosing a language persists it and proceeds to Home, and returning visitors
// skip this page. See docs/superpowers/plans/0005-i18n-ja-en.md.
export function LanguageScreen() {
  const setLanguage = useDrivingStore((s) => s.setLanguage);
  const setScreen = useDrivingStore((s) => s.setScreen);

  const choose = (lang: "ja" | "en") => {
    setLanguage(lang);
    setScreen("home");
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white">
      <div className="text-center px-6">
        <h1 className="text-4xl font-extrabold italic tracking-tight mb-2">
          VIRTUAL <span className="text-blue-500">DRIVING</span> SCHOOL
        </h1>
        <p className="text-slate-400 mb-10 tracking-wide">Select your language</p>

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => choose("ja")}
            className="w-48 py-5 bg-slate-800 hover:bg-blue-600 border border-slate-700 hover:border-blue-500 rounded-xl text-xl font-bold transition-colors"
          >
            日本語
            <span className="block text-xs font-normal text-slate-400 mt-1">Japanese</span>
          </button>
          <button
            onClick={() => choose("en")}
            className="w-48 py-5 bg-slate-800 hover:bg-blue-600 border border-slate-700 hover:border-blue-500 rounded-xl text-xl font-bold transition-colors"
          >
            English
            <span className="block text-xs font-normal text-slate-400 mt-1">英語</span>
          </button>
        </div>

        <p className="text-slate-600 text-xs mt-8">You can change this later from the Home screen.</p>
      </div>
    </div>
  );
}
