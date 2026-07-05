# Task B10 report — Firebase auth + history (fail-soft)

Status: **COMPLETE** (guest path verified end-to-end; real-config path verified by code-reading only — see limitation).

## What was built

| Piece | File |
| --- | --- |
| Auth screen (login/register, fail-soft card) | `src/components/babylon/product/AuthScreen.tsx` (new) |
| History screen (Firestore fetch + guest card + list) | `src/components/babylon/product/HistoryScreen.tsx` (new) |
| Pure mission-log record builder + score rank | `src/lib/missionLog.ts` (new) + `tests/missionLog.test.ts` (7 tests, TDD red→green) |
| Save-on-completion | `src/components/babylon/product/FeedbackScreen.tsx` (mount effect → `saveResultToFirestore`) |
| Auth session restore on load | `src/components/babylon/product/BabylonApp.tsx` (`onAuthStateChanged`, null-guarded) |
| PLAYER header: guest/user, Login/Register vs History \| Logout | `src/components/babylon/product/HomeScreen.tsx` |
| Stubs removed | `src/components/babylon/product/StubScreens.tsx` deleted |

`src/lib/firebase.ts` reused as-is (single Firebase entry, untouched). Frozen modules untouched; store contract (`user` / `missionHistory` / `setUser` / `setMissionHistory` / `addHistoryItem`) used exactly as-is.

## What the original writes to Firestore (and what the port now writes)

Original `src/components/ui/FeedbackScreen.tsx` `saveResultToFirestore` → `addDoc(collection(db, "mission_logs"), logData)` with **exactly** these fields:

```
{ userId: user.uid, timestamp: Date.now(), lesson: state.currentLesson,
  score, clearTime, feedbackSummary }
```

- `score` = `max(0, 100 − Σ(KAIZEN meta.penalty, default 5 each) − floor(deviationPenalty))`
- `clearTime` = `mm:ss` (**no centiseconds in the saved record** — the on-screen display is mm:ss.cs; the port preserves this asymmetry)
- `feedbackSummary` = first KAIZEN message + `" 他"` / `" and more"`, else `"素晴らしい走行でした"` / `"A great drive"`
- After the write, `addHistoryItem({ id: docRef.id, ...logData })` caches it in the store (no refetch).

The port reproduces this via the pure `buildMissionLog` (`src/lib/missionLog.ts`), unit-tested field-for-field. **Collection path `mission_logs` and the `userId` field are unchanged** — the deployed owner-isolation rules key on exactly this path/shape (rules memory: owner isolation on `mission_logs`, `userId == request.auth.uid`), so no new paths were invented. History reads the original's exact query: `where("userId","==",user.uid), orderBy("timestamp","desc"), limit(10)` (matches the deployed composite index).

The original's history-fetch effect had localized error *text* trapped in state; the port stores an error *kind* (`"config" | "load"`) and localizes at render (review-proofing, same visible behavior). Lesson display names come from the pure `lessonCatalog` — this also fixes the original's missing `crosswalk` / `railroad-crossing` entries (noted in a prior review) — with the raw id as fallback for unknown stored values.

The original FeedbackScreen's save effect carries a `react-hooks/exhaustive-deps` warning; the port's save is a **module-level** function reading `useDrivingStore.getState()` with a genuinely dependency-free mount effect + `savedRef` (strict-mode-safe, saves once per completed run) — lint-clean, no warning replicated.

## Fail-soft invariant — evidence (this worktree has NO Firebase config)

Headed Chromium (Playwright, `headless: false`) against the running dev server, console + pageerror listeners active. Two scripted passes, **35/35 checks PASS**:

Pass 1 (guest, both languages) — per language ja/en:
- Home renders; PLAYER header shows `プレイヤー: ゲスト` / `PLAYER: GUEST`.
- Auth screen renders the fail-soft "sign-in temporarily unavailable / continue as guest" card (no form, no auth call), both languages; "continue as guest" returns Home.
- History renders the guest "login required" card; its login button routes to (fail-soft) auth; Back works.
- **Zero uncaught page errors; zero Firebase console errors**; the expected `[firebase] NEXT_PUBLIC_FIREBASE_* env vars are missing; running in guest-only mode` **warning** was logged (proves the fail-soft branch engaged, not merely nothing loaded).

Pass 1 (guest graded run): Home → straight → briefing → drive (W) → goal → **feedback screen reached** (score 100/100, replay renders) → store `user === null`, `missionHistory.length === 0` (**save correctly skipped for guest**) → Back to Home. No page errors, no Firebase errors.

Pass 2 (logged-in DOM states without config, via the e2e store hook injecting a structural user — `db`/`auth` stay null so no Firebase call can fire):
- PLAYER header shows `PLAYER: DEMO` (email prefix), Logout visible, Login hidden.
- History signed-in with no Firestore → clean empty state (fetch no-ops), no crash.
- Populated list renders ranks (S/B/D), localized lesson names en + ja (incl. 踏切/Railroad Crossing).
- Logout (auth null → pure store path) clears user + cached history; header returns to GUEST.

Screenshots (READ and visually confirmed; in `.claude/skills/run-driving/shots/`, gitignored): `b10-home-{en,ja}.png`, `b10-auth-{en,ja}.png`, `b10-history-{en,ja}.png`, `b10-feedback-guest.png`, `b10-home-loggedin.png`, `b10-history-loggedin.png`, `b10-history-loggedin-ja.png`.

## Gates

- `npm run type-check` — clean.
- `npm run lint` — 0 errors; 2 warnings, both pre-existing in the retired R3F files (`src/components/ui/FeedbackScreen.tsx`, `src/components/vision/VisionController.tsx`), none in new code.
- `npm run test:unit` — **142/142 pass** (135 baseline + 7 new `missionLog` tests; no regressions).

## Limitation (per brief)

There is **no Firebase config in this environment** — real login → Firestore write → history fetch could not be executed. Those paths were verified by line-level comparison against the original (`auth/AuthScreen.tsx`, `ui/HistoryScreen.tsx`, `ui/FeedbackScreen.tsx`, `ClientApp.tsx` session restore + logout): same APIs (`createUserWithEmailAndPassword` / `signInWithEmailAndPassword` / `onAuthStateChanged` / `signOut`), same collection path, same query, same record shape (the shape unit-tested). No Firebase config was created or committed. The guest path is verified end-to-end as above.

## Notes

- The dev server on :3000 was restarted with `NEXT_PUBLIC_E2E=1` to enable the store hook for verification (double-gated: build flag + `?e2e` URL param; product behavior otherwise unchanged).
- Prior invariants untouched: mirror hook, loaders, Havok fresh-plugin, strict-mode teardown (no changes to those modules; feedback's new save effect is strict-mode-safe by ref guard).
