// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// --- ダミー設定用のフラグ ---
// 本番環境用のキーがない場合でも、強制的にアプリを起動させるための処理です
const isMockMode = !process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

let auth: any;
let db: any;

if (isMockMode) {
  console.warn("⚠️ Firebase APIキーが見つからないため、モックモードで起動します。ログイン機能は使用できません。");
  
  // ダミーのAuthオブジェクト
  auth = {
    currentUser: null,
    signOut: async () => console.log("Mock signOut"),
    onAuthStateChanged: (callback: any) => {
      callback(null); // 常に未ログイン状態
      return () => {}; // unsubscribe関数
    }
  };

  // ダミーのDBオブジェクト
  db = {
    // 必要に応じてメソッドをダミー化
  };
} else {
  // 通常の初期化処理
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  auth = getAuth(app);
  db = getFirestore(app);
}

export { auth, db };