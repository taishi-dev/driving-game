# Plan 0003 — Firestore history load performance

Status: IMPLEMENTED 2026-06-21 (branch `perf/firestore-history-cache`). Verified by `tsc --noEmit` + `npm run build` (both clean); real-world latency to be confirmed in the app.

## Symptom
Opening the Driving History screen takes ~10 seconds, on the **first load AND every subsequent open** in a session.

## Investigation
- A 10-document query (`mission_logs` where `userId == me`, `orderBy timestamp desc`, `limit 10`) should return in well under 1s, so a *consistent* ~10s is a timeout, not query work.
- The composite index exists (the query succeeds; a missing index would error with `failed-precondition`, not load slowly).
- A general internet speed test was fast (≈395 Mbps, 36 ms). This does NOT rule out the network: Firestore's stall comes from its long-lived **streaming WebChannel**, which routers/proxies/VPNs/antivirus can break while leaving normal HTTP fast. The only conclusive test (history on a hotspot vs the campus network) was not run.
- `HistoryScreen` issues a fresh one-time `getDocs` on **every mount** with no cache, so each open re-attempts the connection and re-pays the timeout. That explains why every load, not just the first, is ~10s.

## Root cause (best supported)
Per-load WebChannel connection attempt timing out (~10s) before falling back to long-polling, compounded by no caching (every open re-queries the server from scratch). Exact trigger (network vs SDK default) is unconfirmed, but the fix below covers both, so precise diagnosis isn't required.

## Fix — three layers
1. **App-level instant display + background refresh** ([HistoryScreen.tsx](../../src/components/ui/HistoryScreen.tsx)): history already lives in the Zustand store (`missionHistory`). Show it immediately and refresh in the background; the spinner appears only when there is nothing cached, and a background-refresh failure keeps the cached view instead of replacing it with an error. Result: reopening History is instant.
2. **Firestore persistent local cache** ([firebase.ts](../../src/lib/firebase.ts)): `persistentLocalCache` (IndexedDB, browser-only via a `typeof window` guard) so reads survive reloads and serve offline.
3. **Long-polling** ([firebase.ts](../../src/lib/firebase.ts)): `experimentalAutoDetectLongPolling: true` via `initializeFirestore`, so the connection stops re-timing-out. Wrapped in try/catch that falls back to `getFirestore(app)` if Firestore was already initialized (HMR / double module eval).

## If it's still slow after this
The auto-detect path can still incur a detection cost. If the per-load ~10s persists, switch to `experimentalForceLongPolling: true` (skip the WebChannel attempt entirely). That removes the stall but is slightly less efficient on networks where WebChannel would have worked.

## Decision note
History intentionally shows cached data first and updates silently in the background (chosen over always-fresh-with-spinner). Trade-off: a brief window where displayed history could be one read stale, in exchange for instant perceived load. Acceptable because mission logs are append-only and personal.
