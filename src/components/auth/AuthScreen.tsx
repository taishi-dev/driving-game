"use client";

import { useState } from 'react';
import { useDrivingStore } from '@/lib/store';
import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';

export function AuthScreen() {
  const setScreen = useDrivingStore(state => state.setScreen);
  const setUser = useDrivingStore(state => state.setUser);
  
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!auth) {
      setError('現在ログイン機能を利用できません。ゲストとしてご利用ください。');
      setLoading(false);
      return;
    }

    try {
      let userCredential;
      if (isRegistering) {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      }
      
      setUser(userCredential.user);
      setScreen('home');
      
    } catch (err: unknown) {
      let errorMessage = 'エラーが発生しました';
      if (err instanceof FirebaseError) {
        errorMessage = err.message;
        if (err.code === 'auth/email-already-in-use') {
          errorMessage = 'このメールアドレスは既に登録されています';
        } else if (err.code === 'auth/weak-password') {
          errorMessage = 'パスワードは6文字以上にしてください';
        } else if (err.code === 'auth/invalid-email') {
          errorMessage = '無効なメールアドレスです';
        } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          errorMessage = 'メールアドレスまたはパスワードが正しくありません';
        }
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Fail soft: Firebase is not configured on this deployment, so sign-in cannot
  // work. Don't render the form (it would call auth APIs with a null client);
  // offer guest play instead.
  if (!isFirebaseConfigured) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-white">
        <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 w-96 shadow-2xl text-center">
          <h2 className="text-2xl font-bold mb-4 text-blue-400">🚗 ログイン</h2>
          <p className="text-slate-300 mb-6 leading-relaxed">
            現在サインイン機能を一時的にご利用いただけません。<br />
            ゲストとして練習を続けられます。
          </p>
          <button
            onClick={() => setScreen('home')}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded font-bold transition-colors"
          >
            ゲストとして続ける
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-900 text-white">
      <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 w-96 shadow-2xl">
        <h2 className="text-2xl font-bold mb-6 text-center text-blue-400">
          {isRegistering ? '🚗 アカウント作成' : '🚗 ログイン'}
        </h2>
        
        {error && <div className="mb-4 p-2 bg-red-900/50 text-red-300 text-sm rounded">{error}</div>}
        
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded p-2 focus:border-blue-500 outline-none"
              required
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded p-2 focus:border-blue-500 outline-none"
              required
              disabled={loading}
              minLength={6}
            />
          </div>
          
          <button 
            type="submit" 
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? '処理中...' : (isRegistering ? '登録して開始' : 'ログイン')}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-400">
          <button 
            onClick={() => setIsRegistering(!isRegistering)}
            className="hover:text-white underline"
            disabled={loading}
          >
            {isRegistering ? 'すでにアカウントをお持ちの方 (ログイン)' : 'アカウントをお持ちでない方 (新規登録)'}
          </button>
        </div>
        
        <button 
          onClick={() => setScreen('home')}
          className="mt-4 w-full text-xs text-slate-500 hover:text-slate-300"
          disabled={loading}
        >
          ← ゲストとして戻る
        </button>
      </div>
    </div>
  );
}