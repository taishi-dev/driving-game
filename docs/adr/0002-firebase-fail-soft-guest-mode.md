# Firebase initializes fail-soft; the app degrades to guest mode on missing config

`src/lib/firebase.ts` checks the `NEXT_PUBLIC_FIREBASE_*` config before initializing. If it's absent, it does NOT call `initializeApp`/`getAuth`/`getFirestore`; it exports `auth = null`, `db = null`, and `isFirebaseConfigured = false`. Consumers guard those nullable exports, so a misconfigured deployment runs in **guest-only mode** (driving works; sign-in and history show "temporarily unavailable") instead of crashing.

## Why (the non-obvious part)
Firebase init throws `auth/invalid-api-key` at **module-evaluation time** when the API key is undefined. `ClientApp` already has a React `ErrorBoundary`, but boundaries only catch errors thrown *while rendering their children* — an error thrown as a module is imported happens before any boundary mounts, so it escapes to Next.js's global handler and white-screens the entire app (observed: `driving-sigma.vercel.app` "Application error"). The only place to stop it is the init site itself: don't throw at import.

## Considered Options
- **Fail-fast (status quo)** — let init throw. Rejected: a single missing env var takes down the whole app for every user, including the core driving game that doesn't need Firebase at all.
- **Whole-app "service unavailable" gate** — render one error screen when unconfigured. Simpler, but also blocks guest driving during an outage.
- **Fail-soft to guest mode (chosen)** — preserve the core experience; only auth/history surfaces degrade. The app already supported guest play, so this keeps the most value with the least user-visible loss.

## Consequences
- `auth` and `db` are `Auth | null` / `Firestore | null`; the type system now forces every consumer to guard them, which prevents re-introducing the crash.
- This is a resilience layer, not a substitute for configuration: the real fix is still setting the env vars (plan 0002). Without them, sign-in and history remain unavailable — failure is now visible and contained rather than catastrophic.
