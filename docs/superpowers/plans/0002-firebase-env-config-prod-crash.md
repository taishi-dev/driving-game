# Plan 0002 — Firebase env config & production crash fix

Status: ROOT CAUSE CONFIRMED 2026-06-20; fix not yet applied.
Severity: **production outage** — `driving-sigma.vercel.app` hard-crashes on load for all users.

## Symptom
Loading `driving-sigma.vercel.app` shows "Application error: a client-side exception has occurred." Browser console:
```
Uncaught FirebaseError: Firebase: Error (auth/invalid-api-key).
  ... at eE.initialize ... popupRedirectResolver ... module evaluation
```
The throw happens during `getAuth` initialization, at module evaluation (import) time.

## Root cause (confirmed, not assumed)
`firebase.ts` initializes Firebase at IMPORT time — `initializeApp` / `getAuth` / `getFirestore` run on module load ([firebase.ts:15-19](src/lib/firebase.ts#L15)). The config comes entirely from `NEXT_PUBLIC_FIREBASE_*` env vars ([firebase.ts:5-12](src/lib/firebase.ts#L5)), which Next.js **inlines at build time**. Vercel has no env vars (Production project scope shows "No Environment Variables Added") and no `.env*` file exists in the repo, so the production build baked in `undefined`. `getAuth()` with an undefined `apiKey` throws `auth/invalid-api-key`; because `firebase.ts` is imported by components, the throw crashes the entire app. The console error names `auth/invalid-api-key` explicitly, so this is the cause, not an unrelated client bug.

## The six values — source of truth is the Firebase console
Firebase console → Project Settings → General → "Your apps" → SDK setup and configuration. Map `firebaseConfig` → env var:
| firebaseConfig key | env var |
|---|---|
| `apiKey` | `NEXT_PUBLIC_FIREBASE_API_KEY` |
| `authDomain` | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (must be `driving-school-e862d`) |
| `storageBucket` | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` |
| `messagingSenderId` | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `NEXT_PUBLIC_FIREBASE_APP_ID` |

These are **public config**, not secrets — they ship in the client bundle by design; a Firebase web API key is an identifier, and security comes from rules + auth (plan 0001), not from hiding it. No Vercel "Sensitive" flag needed. If "Your apps" has no web app registered, register a Web app first to obtain the config.

## Fix
1. Copy the six values from the Firebase console (table above).
2. **Local dev**: create `.env.local` at repo root (gitignored via `.env*`) with the six `NEXT_PUBLIC_FIREBASE_*=...` lines. Enables `npm run dev` and plan 0001's Phase D.
3. **Production**: add the six vars in Vercel → Settings → Environment Variables, scoped to **Production + Preview** (Development not needed — local uses `.env.local`, not `vercel dev`).
4. **REDEPLOY — the step that's easy to miss**: `NEXT_PUBLIC_*` inlines at BUILD time, so adding the vars does NOT fix the current live deployment. Trigger a new build: Vercel → Deployments → Redeploy (rebuilds and re-inlines), or push a commit. The site stays broken until a fresh build runs.
5. **Verify**: reload `driving-sigma.vercel.app` → no crash, login works. History also needs the composite index (plan 0001's Index section).

## Sequencing vs plan 0001
Independent of, and a prerequisite for, plan 0001's Phase D — you cannot functionally test the rules against an app that won't run. Do this first. (The rules *deploy* doesn't need the app running; *verifying* it does.)

## Hardening — DONE (2026-06-20, ADR-0002)
`firebase.ts` no longer crashes the app when config is missing. It now checks `isFirebaseConfigured`, skips init when the config is absent, and exports `auth`/`db` as nullable; the app degrades to **guest mode** (driving works; sign-in and history show "temporarily unavailable"). Consumers guard the nullable exports (`AuthScreen`, `ClientApp`, `FeedbackScreen`, `HistoryScreen`). Verified: `tsc --noEmit` clean and `npm run build` succeeds with NO env vars present (previously the crash-producing condition). Rationale and the rejected alternatives are in `docs/adr/0002-firebase-fail-soft-guest-mode.md`.

This hardening contains the blast radius; it is NOT a substitute for the fix above. Until the env vars are set and the app redeployed, production runs guest-only (no login, no history).
