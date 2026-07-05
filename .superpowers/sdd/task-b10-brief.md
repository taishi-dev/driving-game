# Task B10 brief — Firebase auth + history (fail-soft)

Plan task (verbatim): **B10 Firebase.** Auth + history, fail-soft to guest (missing config must not crash at import). Acceptance: guest mode works with no config; history persists when configured.

## Scope

Port the original app's Firebase features into the Babylon product:

1. **Auth screen** (replace the StubScreens AuthScreen): login/register per the original `src/components/auth/*` components — rewrite DOM-native for the product shell; both languages. On success, store `user` (existing store field); PLAYER header on home shows the user (original shows GUEST vs user name; check `ClientApp.tsx`).
2. **History screen** (replace the stub): list saved mission results per the original `src/components/ui/HistoryScreen.tsx` (port its bilingual STRINGS — noted in a prior review); reads `missionHistory` from the store, loaded from Firestore when logged in.
3. **Save results**: after a graded run completes, persist the mission result to Firestore for logged-in users, exactly like the original `ui/FeedbackScreen.tsx`'s `saveResultToFirestore` (check what fields it writes and where — collection path matters: the deployed Firestore rules enforce OWNER ISOLATION on the same paths the original uses; do not invent new paths). Guests: no save, no crash.
4. **Fail-soft invariant** (QA-critical): `src/lib/firebase.ts` (in-tree, already fail-soft) must remain the single Firebase entry; nothing may crash at import or at runtime when `NEXT_PUBLIC_FIREBASE_*` config is missing — the whole product must work as guest with zero config. Auth/history screens must render a sensible "not available" or guest state rather than crash.
5. **Logout** if the original has it (check the header/auth components).

## Global constraints
- Frozen modules untouched: course.ts, missions.ts, checkpointEval.ts, scoring.ts, replay.ts, store.ts contract (user/missionHistory/addHistoryItem etc. already exist — use them).
- `src/lib/firebase.ts` may be reused as-is (it is engine-agnostic); do NOT fork it. If it genuinely lacks something, STOP and return NEEDS_CONTEXT.
- 135/135 tests must not regress; new pure logic (if any — e.g. history-item formatting) gets node --test coverage. Firebase-coupled code is exempt from unit tests.
- Both languages on all new UI.
- Preserve all prior invariants (mirror hook, loaders, Havok fresh-plugin, strict-mode teardown).

## Verification loop
- Dev server ALREADY RUNNING on http://localhost:3000 (hot reload). There is NO Firebase config in this worktree's env — that is the fail-soft case, verify it thoroughly: every screen incl. auth/history renders, login shows a sensible unavailable/guest state, completing a lesson works, no console errors mentioning Firebase crashes.
- Real-config login/save/history verification is NOT possible in this environment (no credentials) — verify code paths against the original's semantics by careful reading, state that limitation in your report, and make sure the guest path is bulletproof. Do NOT create or commit any Firebase config.
- NEVER issue a foreground Bash call >115s.
- Headed screenshots of auth + history screens in both languages; READ them.
- Gates: `npm run type-check`, `npm run lint`, `npm test`.

## Report contract
Write your full report to `.superpowers/sdd/task-b10-report.md` (what the original writes to Firestore and the paths used, fail-soft evidence, screenshots, gate outputs, the no-real-config limitation). Commit on the current branch. Return ONLY: status, commit sha(s), one-line test summary, concerns.
