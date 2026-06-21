"use client";

import { useDrivingStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';

const STRINGS = {
  ja: {
    loginRequiredTitle: '🔒 ログインが必要です',
    loginRequiredBody: '履歴を見るにはログインしてください',
    loginButton: 'ログイン / 新規登録',
    back: '戻る',
    drivingRecordSuffix: ' の走行記録',
    backToHome: '← ホームに戻る',
    dbConfigError: 'データベースの設定が必要です。管理者にお問い合わせください。',
    loadFailed: '履歴の読み込みに失敗しました',
    noHistory: '履歴はまだありません',
    noHistorySub: 'ミッションをクリアすると記録が残ります',
    challengeMission: 'ミッションに挑戦する',
    totalRecords: (n: number) => `全 ${n} 件の記録`,
    sortedByLatest: '最新順に表示',
    loadingRecords: 'Loading records...',
    reload: '再読み込み',
    lessons: {
      'straight': '直線走行',
      'left-turn': '左折',
      'right-turn': '右折',
      's-curve': 'S字カーブ',
      'crank': 'クランク',
      'traffic-light': '信号交差点',
    } as Record<string, string>,
  },
  en: {
    loginRequiredTitle: '🔒 Login Required',
    loginRequiredBody: 'Please log in to view your history',
    loginButton: 'Log In / Sign Up',
    back: 'Back',
    drivingRecordSuffix: "'s driving records",
    backToHome: '← Back to Home',
    dbConfigError: 'Database setup is required. Please contact the administrator.',
    loadFailed: 'Failed to load history',
    noHistory: 'No history yet',
    noHistorySub: 'Clear a mission to start recording your progress',
    challengeMission: 'Take on a Mission',
    totalRecords: (n: number) => `${n} records total`,
    sortedByLatest: 'Sorted by latest',
    loadingRecords: 'Loading records...',
    reload: 'Reload',
    lessons: {
      'straight': 'Straight Driving',
      'left-turn': 'Left Turn',
      'right-turn': 'Right Turn',
      's-curve': 'S-Curve',
      'crank': 'Crank',
      'traffic-light': 'Traffic Light',
    } as Record<string, string>,
  },
} as const;

export function HistoryScreen() {
  const setScreen = useDrivingStore(state => state.setScreen);
  const user = useDrivingStore(state => state.user);
  const missionHistory = useDrivingStore(state => state.missionHistory);
  const setMissionHistory = useDrivingStore(state => state.setMissionHistory);
  const language = useDrivingStore(state => state.language);
  const t = STRINGS[language];
  // Spinner only when there is nothing cached to show; cached history renders instantly.
  const [loading, setLoading] = useState(() => useDrivingStore.getState().missionHistory.length === 0);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchHistory() {
      if (!user || !db) {
        setLoading(false);
        return;
      }

      // Background refresh: only show the spinner when nothing is cached yet.
      const hadCache = useDrivingStore.getState().missionHistory.length > 0;
      if (!hadCache) setLoading(true);
      setError('');
      try {
        const q = query(
          collection(db, "mission_logs"),
          where("userId", "==", user.uid),
          orderBy("timestamp", "desc"),
          limit(10),
        );
        
        const querySnapshot = await getDocs(q);
        const historyData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          timestamp: doc.data().timestamp,
          lesson: doc.data().lesson,
          score: doc.data().score,
          clearTime: doc.data().clearTime,
          feedbackSummary: doc.data().feedbackSummary,
        }));
        
        setMissionHistory(historyData);
      } catch (e: unknown) {
        console.error("Error fetching history:", e);
        // Keep showing cached history if a background refresh fails; only surface
        // an error when there is nothing cached to display.
        if (useDrivingStore.getState().missionHistory.length === 0) {
          if (e instanceof Error && 'code' in e && e.code === 'failed-precondition') {
            setError(t.dbConfigError);
          } else {
            setError(t.loadFailed);
          }
        }
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [user, setMissionHistory, t]);

  // When the user is not logged in
  if (!user) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-blue-400 mb-4">{t.loginRequiredTitle}</h2>
          <p className="text-slate-400 mb-6">{t.loginRequiredBody}</p>
          <div className="space-x-4">
            <button
              onClick={() => setScreen('auth')}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded font-bold"
            >
              {t.loginButton}
            </button>
            <button
              onClick={() => setScreen('home')}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded"
            >
              {t.back}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getLessonName = (lesson: string) => {
    return t.lessons[lesson] || lesson;
  };

  const getScoreRank = (score: number) => {
    if (score >= 90) return { rank: 'S', color: 'text-yellow-400', bg: 'bg-yellow-400/20' };
    if (score >= 80) return { rank: 'A', color: 'text-green-400', bg: 'bg-green-400/20' };
    if (score >= 70) return { rank: 'B', color: 'text-blue-400', bg: 'bg-blue-400/20' };
    if (score >= 60) return { rank: 'C', color: 'text-orange-400', bg: 'bg-orange-400/20' };
    return { rank: 'D', color: 'text-red-400', bg: 'bg-red-400/20' };
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 text-white p-8 overflow-hidden">
      <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-700">
        <h2 className="text-2xl font-bold text-blue-400">📊 Driving History</h2>
        <p className="text-sm text-slate-400 mt-1">
          {user.email?.split('@')[0]}{t.drivingRecordSuffix}
        </p>
        <button onClick={() => setScreen('home')} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded">
          {t.backToHome}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center text-slate-500 mt-10">
            <div className="animate-pulse">{t.loadingRecords}</div>
          </div>
        ) : error ? (
          <div className="text-center mt-10">
            <div className="text-red-400 mb-4">{error}</div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded"
            >
              {t.reload}
            </button>
          </div>
        ) : missionHistory.length === 0 ? (
          <div className="text-center mt-10">
            <div className="text-6xl mb-4">🏎️</div>
            <div className="text-slate-500 mb-4">{t.noHistory}</div>
            <p className="text-slate-600 text-sm mb-6">{t.noHistorySub}</p>
            <button
              onClick={() => setScreen('home')}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded font-bold"
            >
              {t.challengeMission}
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm text-slate-400">
                {t.totalRecords(missionHistory.length)}
              </div>
              <div className='text-xs text-slate-500'>
                {t.sortedByLatest}
              </div>
            </div>
            <div className="grid gap-3">
            {missionHistory.map((item, index) => {
              const scoreInfo = getScoreRank(item.score);
              return (
                <div
                key={item.id}
                className="bg-slate-800 p-4 rounded-lg flex items-center gap-4 border border-slate-700 hover:border-slate-600 transition-colors"
                >
                <div className="text-xl font-bold text-slate-600 w-10 text-center">
                  #{missionHistory.length - index}
                </div>
              {/* Main info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-bold text-lg text-white">
                          {getLessonName(item.lesson)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(item.timestamp).toLocaleString(language === 'en' ? 'en-US' : 'ja-JP', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <div className="text-sm text-slate-400">{item.feedbackSummary}</div>
                    </div>
                    
                    {/* Time */}
                    <div className="text-center px-3">
                      <div className="text-xs text-slate-500">TIME</div>
                      <div className="text-lg font-mono text-white">{item.clearTime}</div>
                    </div>
                    
                    {/* Score */}
                    <div className="text-center px-3">
                      <div className="text-xs text-slate-500">SCORE</div>
                      <div className={`text-2xl font-bold ${
                        item.score >= 80 ? 'text-green-400' : 
                        item.score >= 60 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {item.score}
                      </div>
                    </div>
                    
                    {/* Rank */}
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${scoreInfo.bg}`}>
                      <span className={`text-2xl font-black ${scoreInfo.color}`}>
                        {scoreInfo.rank}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
