# Task B7b report — Babylon product app shell (screen flow + store wiring)

Status: **DONE**

## What was built

`/` is now the Babylon product shell (the old R3F `ClientApp` is retired from the
root route; `src/app/page.tsx` dynamically imports `BabylonApp` with `ssr:false`).
The shell is a pure store-driven screen router — it reads `screen` from the
engine-agnostic zustand store and renders one screen at a time. No R3F components
are imported anywhere in the new UI; no Firebase is touched (auth/history are B10
stubs), so the shell stays fail-soft.

New files, all under `src/components/babylon/product/` unless noted:

- `BabylonApp.tsx` — shell + `ScreenRouter` (language/home/driving/feedback/tutorial/auth/history) + an ErrorBoundary. This is what `/` renders.
- `HomeScreen.tsx` — rewritten Home: static Babylon **showroom** hero background (`HomeHeroCanvas`), title, language toggle, stubbed `PLAYER: GUEST` header (Login/History route to stubs), and lesson-select cards driven by the pure `lessonCatalog`. Selecting routes via the store: tutorial→tutorial, free-mode→driving (active), lesson→driving (briefing).
- `HomeHeroCanvas.tsx` — reuses `createShowroomScene` as a static, badge-free hero background (strict-mode-safe `disposed`-guard teardown).
- `LanguageScreen.tsx` — rewritten first-launch picker (persists via `setLanguage`→localStorage, then Home).
- `DrivingScreen.tsx` — the drive canvas plus overlays: pre-drive briefing (graded lessons only, both languages, via `getBriefing`), live HUD (speed km/h + gear + off-track flag), exit (button **and** Escape → mission `idle` + Home).
- `DriveScreenCanvas.tsx` — the **store-wired** Babylon drive canvas (see wiring below).
- `StubScreens.tsx` — `FeedbackScreen` (placeholder, retry+home; B8), `TutorialScreen` (placeholder shell; B7c), `AuthScreen`/`HistoryScreen` (stubs, back button, no Firebase; B10).
- `src/lib/lessonCatalog.ts` — **pure** lesson catalog + briefing strings (ported verbatim from the original `ClientApp` MISSION_INFO / `HomeScreen` LESSONS), `import type` only from the store so it carries no three/firebase runtime dep.
- `tests/lessonCatalog.test.ts` — 6 `node --test` cases (every graded lesson has non-empty ja+en title/desc; home entries cover tutorial+8 courses+free; `getBriefing` language + free-mode-null).

## Store wiring decisions

- **Store stays THE state container**, unchanged (no schema changes needed). Grading seams left intact for B7c: `missionState` transitions, `setOffTrack`, `feedbackLogs`, checkpoint state all untouched.
- **Keyboard → store**: WASD/arrows write `setPedals(gas, brake)` + `setSteering(steer)`; number keys 1/2/3 write `setGear(P/D/R)`. Key math reuses the pure `driveControls.ts` helpers (shared with the /drive route).
- **Store → scene each frame**: the render loop reads `throttle`/`brake`/`steeringAngle`/`gear`, applies the gear sign via `driveThrottleForGear`, and feeds `vehicle.setInput`.
- **Scene → store each frame**: writes rounded display speed (km/h, only on change) and off-track flag (only on change), matching the "only on change" requirement.
- **Fresh gear per drive**: `setGear("D")` on drive-canvas mount, since gear is global store state that otherwise persists across re-entry (a prior reverse would leave "R").
- **Test routes**: `/drive` and `/showroom` keep their local-input standalone components (`DriveCanvas.tsx`, `ShowroomCanvas.tsx`) unchanged. The product driving screen is a **separate** store-wired component (`DriveScreenCanvas.tsx`) so the test routes never regress. `__driveDebug` is exposed on the product canvas too (car telemetry only, no user data) for verification.

## Bug fixed (required for the flow to work)

`src/components/babylon/havok.ts` cached a single `HavokPlugin` instance. On drive-screen exit the scene disposes that plugin's Havok world, so re-entering driving (or lesson→home→free-mode) reused a dead world and threw `Cannot read properties of undefined (reading 'floatingOrigin')`. The `/drive` test route only mounts once, so this latent bug first surfaced in B7b. Fix: cache the WASM **module** (expensive, once) but return a **fresh** `HavokPlugin` per call — each scene gets its own live world. `/drive` regression-checked, still passes.

## Verification (headed, real GPU, 1920x1200)

Script: `.claude/skills/run-driving/shots/shot-babylon-flow.mjs`. Full flow walked with **no console errors**:

- `babylon-1-language.png` — first-launch language picker (fresh profile).
- `babylon-2-home.png` — Home: Babylon showroom hero (red car, studio lighting/shadows), title, language select, PLAYER header, lesson cards.
- `babylon-3-briefing.png` — "MISSION: Straight Driving" briefing overlay (English) over the dimmed drive scene; HUD reads 0 km/h / D.
- `babylon-4-driving-forward.png` — Quaternius world, red car, **rearview mirror (B5b) rendering** top-center, HUD "41 km/h D", Back-to-Home button.
- `babylon-5-freemode.png` — Free Mode: no briefing, gear D, mirror rendering, HUD 33 km/h.

`__driveDebug` numbers (store-wired drive):
- Forward (gear D, W): z 8.79 → -6.67 (decreases = forward −Z), HUD speed 40 km/h, **FPS 60**.
- Reverse (gear 3 + W): z 9.97 → 22.90 (increases = backward), gear "R".
- Free-mode drive (fresh gear D): z 8.75 → -1.61 (forward).
- Transitions: language→home, straight→briefing→driving, Escape→home, free-mode→driving (no briefing), exit button→home — all confirmed via visible testids.

## Gates

- `npm run type-check` — clean.
- `npm run lint` — 0 errors, 2 warnings (both pre-existing, in untouched `ui/FeedbackScreen.tsx` + `vision/VisionController.tsx`).
- `npm run test:unit` — **111/111 pass** (105 baseline + 6 new lessonCatalog tests; no regressions).

## Concerns / notes for B7c

- Grading, goal detection, scoring, and the real tutorial content flow are intentionally NOT built (B7c). `FeedbackScreen`/`TutorialScreen` are placeholders; the driving screen never transitions to success/failed yet — B7c hooks that into `missionState`.
- Speed is displayed as `round(|forwardVel| * 3.6)` km/h — a display value only; B7c/B8 own any scored speed semantics.
- The `/drive` B6 shot reports `yaw.sameSign:false` (D vs R steering yaw), a pre-existing B6 physics-script detail unaffected by the havok change — flagged, out of B7b scope.
