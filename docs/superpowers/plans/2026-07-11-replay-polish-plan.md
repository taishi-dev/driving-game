# Implementation plan — replay polish (placeholder flash + feedback consistency)

Branch: `fix/drive-camera-and-vision` (drive-test findings; alongside the replay
euler-wrap fix 7608fcb).

## Global Constraints

- **Do NOT edit the frozen pure core** (`scoring.ts`, `store.ts`, `replay.ts`
  logic contract, `checkpointEval`, `missions`, `course`). Task B is UI-only +
  a NEW pure helper module; scoring numbers are unchanged.
- **Pure/engine split:** new decision logic goes in a pure `src/lib/*` module
  exercised by `node --test` (no `playcanvas`/browser/react imports). Engine
  wiring stays in the scene/component.
- **Bilingual:** every user-facing string has both `en` and `ja`, matching the
  existing FeedbackScreen `STRINGS` / `pcVisionStatus` pattern.
- **Tests:** `node --test`. Do not weaken existing tests. Existing replay tests
  (tests/replay.test.ts, incl. the ±180° wrap guard) must still pass.

## Task 1 — Replay: hide the car placeholder until the GLB mounts

**File:** `src/components/playcanvas/replayScene.ts` only.

Today the replay builds a red box `body` + `cab` + cosmetic `wheelEntities`
(all enabled) as a streaming placeholder; `loadHeroCar`'s `onMounted` disables
them once the GLB lands. On the short replay scene the box is visible for the
whole decode → the reported "square, not the car".

Change:
1. Create `body`, `cab`, and each `wheelEntities[i]` with `.enabled = false` so
   NOTHING shows during the decode (the world/road/terrain still render).
2. Keep `onMounted` disabling them (now a no-op for the box, still disables the
   cosmetic wheels per its existing note) — the hero car shows when ready.
3. **Failure fallback** (so a failed/never-mounting GLB doesn't leave a car-less
   replay): track a `heroMounted` flag set true in `onMounted`. Start a
   `PLACEHOLDER_FALLBACK_MS = 4000` timer (use the engine clock, not wall-clock —
   accumulate `dt` in the existing `onUpdate`, or `setTimeout`); if the timer
   elapses and `!heroMounted`, re-enable `body`/`cab`/`wheelEntities` as the
   fallback placeholder. `onMounted` cancels it. Clear it in `dispose()`.
   (Prefer `setTimeout` + clear in dispose for simplicity; guard on
   `isDisposed()` in the callback.)

Do not change camera logic, playback, or anything else.

**Verification:** `npm run type-check` + `npm run lint` clean. No unit test covers
engine scene wiring; state in the report that the change is mechanical
(enabled-flag + fallback timer) and that the controller will visually confirm
(replay start shows no red box, car appears when decoded; a forced load-failure
still shows the fallback box). Do NOT attempt a headless GPU run.

## Task 2 — Feedback text reflects the score (path-deviation aware)

**Files:** `src/lib/pcFeedbackSummary.ts` (new, pure), `tests/pcFeedbackSummary.test.ts`
(new), `src/components/playcanvas/product/FeedbackScreen.tsx` (wire in + strings).

Problem: FeedbackScreen shows "excellent drive" whenever `kaizenLogs.length === 0`,
but the score also subtracts `floor(deviationPenalty)` (path wander), which
generates NO kaizen log. So a wander-heavy run shows score 0 + "excellent drive".

New pure module `pcFeedbackSummary.ts`:
```ts
export const DEVIATION_FEEDBACK_THRESHOLD = 5; // points lost to deviation before we call it out
/** Localized "you drifted from the course" point, or null if deviation is minor. */
export function deviationFeedbackPoint(deviationPenalty: number, lang: "ja" | "en"): string | null;
/** True only when there are no kaizen logs AND deviation is below the threshold. */
export function isCleanRun(kaizenCount: number, deviationPenalty: number): boolean;
```
- `deviationFeedbackPoint`: returns null when `Math.floor(deviationPenalty) < DEVIATION_FEEDBACK_THRESHOLD`; else a bilingual message (en: "You drifted from the course — try to stay centered in your lane."; ja: 「コースから外れて走行しました。車線の中央を維持しましょう。」).
- `isCleanRun`: `kaizenCount === 0 && Math.floor(deviationPenalty) < DEVIATION_FEEDBACK_THRESHOLD`.

FeedbackScreen wiring:
- Compute `const devPoint = deviationFeedbackPoint(deviationPenalty, language);`
- Replace the `kaizenLogs.length === 0` branch condition with
  `isCleanRun(kaizenLogs.length, deviationPenalty)` for the "perfect" headline.
- In the non-clean branch, render the kaizen messages AND `devPoint` (if non-null)
  as list items in `feedback-kaizen`. Keep existing `data-testid`s.
- Score/clearTime/checkpoints logic unchanged.

**Tests** (`tests/pcFeedbackSummary.test.ts`, pure):
1. clean run — `isCleanRun(0, 0) === true`; `deviationFeedbackPoint(0,'en') === null`.
2. below threshold — `deviationFeedbackPoint(3,'en') === null`; `isCleanRun(0,3) === true`.
3. at/above threshold — `deviationFeedbackPoint(5,'en')` and `(20,'en')` are non-null (en) and non-null (ja); `isCleanRun(0,20) === false`.
4. kaizen present — `isCleanRun(2, 0) === false`.
5. bilingual — en and ja messages differ and are non-empty.

**Verification:** `node --test tests/pcFeedbackSummary.test.ts` (new) + the full
suite green; `npm run type-check` + scoped lint clean.

## Out of scope
- Any change to numeric scoring or the frozen core.
- Cross-scene GLB resource caching (A uses the simpler hide-until-loaded approach).
