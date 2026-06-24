"use client";

import { useState } from 'react';
import { useDrivingStore } from '@/lib/store';
import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';

// User-facing strings are bilingual (ja/en).
const STRINGS = {
  ja: {
    loginTitle: '🚗 ログイン',
    registerTitle: '🚗 アカウント作成',
    signInUnavailableHeading: '🚗 ログイン',
    signInUnavailableBody1: '現在サインイン機能を一時的にご利用いただけません。',
    signInUnavailableBody2: 'ゲストとして練習を続けられます。',
    continueAsGuest: 'ゲストとして続ける',
    submitLoading: '処理中...',
    submitRegister: '登録して開始',
    submitLogin: 'ログイン',
    toggleToLogin: 'すでにアカウントをお持ちの方 (ログイン)',
    toggleToRegister: 'アカウントをお持ちでない方 (新規登録)',
    backAsGuest: '← ゲストとして戻る',
    errAuthUnavailable: '現在ログイン機能を利用できません。ゲストとしてご利用ください。',
    errGeneric: 'エラーが発生しました',
    errEmailInUse: 'このメールアドレスは既に登録されています',
    errWeakPassword: 'パスワードは6文字以上にしてください',
    errInvalidEmail: '無効なメールアドレスです',
    errInvalidCredentials: 'メールアドレスまたはパスワードが正しくありません',
  },
  en: {
    loginTitle: '🚗 Log In',
    registerTitle: '🚗 Create Account',
    signInUnavailableHeading: '🚗 Log In',
    signInUnavailableBody1: 'Sign-in is temporarily unavailable.',
    signInUnavailableBody2: 'You can keep practicing as a guest.',
    continueAsGuest: 'Continue as Guest',
    submitLoading: 'Processing...',
    submitRegister: 'Register & Start',
    submitLogin: 'Log In',
    toggleToLogin: 'Already have an account? (Log in)',
    toggleToRegister: "Don't have an account? (Sign up)",
    backAsGuest: '← Back as Guest',
    errAuthUnavailable: 'Sign-in is currently unavailable. Please continue as a guest.',
    errGeneric: 'An error occurred',
    errEmailInUse: 'This email address is already registered',
    errWeakPassword: 'Password must be at least 6 characters',
    errInvalidEmail: 'Invalid email address',
    errInvalidCredentials: 'Incorrect email address or password',
  },
} as const;

export function AuthScreen() {
  const setScreen = useDrivingStore(state => state.setScreen);
  const setUser = useDrivingStore(state => state.setUser);
  const language = useDrivingStore((s) => s.language);
  const t = STRINGS[language];

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
      setError(t.errAuthUnavailable);
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
      let errorMessage: string = t.errGeneric;
      if (err instanceof FirebaseError) {
        // Log the raw error for debugging, but never render it: Firebase messages
        // can leak internal detail (quotas, endpoints). Unrecognized codes fall
        // through to the generic localized message.
        console.error("Auth error:", err.code, err.message);
        if (err.code === 'auth/email-already-in-use') {
          errorMessage = t.errEmailInUse;
        } else if (err.code === 'auth/weak-password') {
          errorMessage = t.errWeakPassword;
        } else if (err.code === 'auth/invalid-email') {
          errorMessage = t.errInvalidEmail;
        } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          errorMessage = t.errInvalidCredentials;
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
          <h2 className="text-2xl font-bold mb-4 text-blue-400">{t.signInUnavailableHeading}</h2>
          <p className="text-slate-300 mb-6 leading-relaxed">
            {t.signInUnavailableBody1}<br />
            {t.signInUnavailableBody2}
          </p>
          <button
            onClick={() => setScreen('home')}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded font-bold transition-colors"
          >
            {t.continueAsGuest}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-900 text-white">
      <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 w-96 shadow-2xl">
        <h2 className="text-2xl font-bold mb-6 text-center text-blue-400">
          {isRegistering ? t.registerTitle : t.loginTitle}
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
            {loading ? t.submitLoading : (isRegistering ? t.submitRegister : t.submitLogin)}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-400">
          <button 
            onClick={() => setIsRegistering(!isRegistering)}
            className="hover:text-white underline"
            disabled={loading}
          >
            {isRegistering ? t.toggleToLogin : t.toggleToRegister}
          </button>
        </div>
        
        <button 
          onClick={() => setScreen('home')}
          className="mt-4 w-full text-xs text-slate-500 hover:text-slate-300"
          disabled={loading}
        >
          {t.backAsGuest}
        </button>
      </div>
    </div>
  );
}