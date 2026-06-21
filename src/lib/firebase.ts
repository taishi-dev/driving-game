import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Fail soft. If the public Firebase config is missing (e.g. the
// NEXT_PUBLIC_FIREBASE_* env vars were never set on this deployment), DO NOT
// initialize at import time: initializeApp/getAuth with an undefined apiKey
// throws `auth/invalid-api-key` during module evaluation, which crashes the
// whole app BEFORE any React error boundary can mount (boundaries only catch
// render-time errors, not import-time ones). So instead we export nulls plus a
// flag, letting the app run in guest mode while the auth/history surfaces show
// "temporarily unavailable". See docs/adr/0002 and
// docs/superpowers/plans/0002-firebase-env-config-prod-crash.md.
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
);

let auth: Auth | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured) {
  try {
    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    try {
      // initializeFirestore (once, before any getFirestore) tunes two things:
      // - experimentalAutoDetectLongPolling: avoids the ~10s WebChannel timeout
      //   on networks/proxies that interfere with Firestore's streaming connection
      //   (the per-load history stall). See docs/superpowers/plans/0003.
      // - persistentLocalCache (browser only; IndexedDB): repeat reads are served
      //   instantly and survive reloads/offline.
      db = initializeFirestore(app, {
        experimentalAutoDetectLongPolling: true,
        ...(typeof window !== "undefined"
          ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }
          : {}),
      });
    } catch {
      // Firestore already initialized (e.g. HMR / double module eval) — reuse it.
      db = getFirestore(app);
    }
  } catch (e) {
    // Defensive: any unexpected init failure also degrades to guest mode
    // rather than taking down the app.
    console.error("[firebase] initialization failed; running in guest-only mode.", e);
    auth = null;
    db = null;
  }
} else {
  console.warn(
    "[firebase] NEXT_PUBLIC_FIREBASE_* env vars are missing; running in guest-only mode. " +
      "Set them in .env.local (local dev) and Vercel (deploy), then redeploy. " +
      "See docs/superpowers/plans/0002-firebase-env-config-prod-crash.md",
  );
}

export { auth, db };
