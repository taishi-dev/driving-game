import { test, expect, type Page } from "@playwright/test";

// Shape of the opt-in debug hook exposed on `window.__drivingStore` when the
// page is loaded with `?e2e` (see src/lib/store.ts).
type E2EState = {
  steeringAngle: number;
  screen: string;
  missionState: string;
  replayData: unknown[];
  setLesson: (lesson: string) => void;
  setScreen: (screen: string) => void;
  setMissionState: (state: string) => void;
};
type E2EStore = { getState: () => E2EState };
type E2EWindow = Window & { __drivingStore?: E2EStore };

const STEER_AMOUNT = 0.6; // keyboard partial-lock (pcDriveControls)

// Force getUserMedia to reject with NotAllowedError BEFORE app scripts run, so:
//  (1) the vision loop never starts and therefore never overrides steering, and
//  (2) the camera-denied fallback path is exercised.
async function denyCamera(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const reject = () =>
      Promise.reject(new DOMException("denied by e2e test", "NotAllowedError"));
    try {
      if (!navigator.mediaDevices) {
        Object.defineProperty(navigator, "mediaDevices", {
          value: {},
          configurable: true,
        });
      }
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: reject,
        configurable: true,
      });
    } catch {
      // If the property cannot be redefined in this browser, the test that
      // depends on it will surface the failure clearly.
    }
  });
}

// Navigate from a fresh load into the driving screen via Free Mode, which goes
// straight to active driving (no briefing overlay to dismiss).
async function startFreeDrive(page: Page): Promise<void> {
  // Skip the first-launch language picker: a fresh browser has no saved
  // language, so the store routes to the LanguageScreen picker instead of Home
  // and the Free Mode button is absent. Seed "ja" so it goes straight to Home
  // with the button labelled フリーモード. (P11: the camera-denied overlay is
  // now localized via pcVisionStatus, so the overlay assertions below use the
  // Japanese strings.)
  await page.addInitScript(() => localStorage.setItem("language", "ja"));
  await page.goto("/?e2e=1");
  await page.getByRole("button", { name: /フリーモード/ }).click();
  await page.waitForFunction(
    () => (window as unknown as E2EWindow).__drivingStore?.getState().screen === "driving",
    undefined,
    { timeout: 30_000 },
  );
  // Let the driving screen's keyboard effect attach its window keydown/keyup listeners.
  await page.waitForTimeout(500);
}

function steeringAngle(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as E2EWindow).__drivingStore!.getState().steeringAngle,
  );
}

test("keyboard steering works as the fallback when the camera is unavailable", async ({
  page,
}) => {
  await denyCamera(page);
  await startFreeDrive(page);

  expect(await steeringAngle(page)).toBe(0);

  await page.keyboard.down("ArrowRight");
  await expect.poll(() => steeringAngle(page)).toBe(STEER_AMOUNT);
  await page.keyboard.up("ArrowRight");
  await expect.poll(() => steeringAngle(page)).toBe(0);

  await page.keyboard.down("ArrowLeft");
  await expect.poll(() => steeringAngle(page)).toBe(-STEER_AMOUNT);
  await page.keyboard.up("ArrowLeft");
  await expect.poll(() => steeringAngle(page)).toBe(0);
});

// Camera acquisition is decoupled from MediaPipe model loading (see
// VisionController.acquireCamera), so the denial overlay appears promptly and
// independently of the CDN — this test is deterministic, no network dependency.
test("camera-denied shows the keyboard-fallback overlay", async ({ page }) => {
  await denyCamera(page);
  await startFreeDrive(page);

  // P11: the overlay is localized (pcVisionStatus.ts); the page runs in Japanese.
  await expect(page.getByText("📷 カメラを利用できません")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText("カメラへのアクセスが拒否されました", { exact: false }),
  ).toBeVisible();
});

// End-to-end proof that mission grading fires: enter the straight lesson, place
// the car just short of the goal (the productDriveScene `__driveDebug.teleport`
// aid — zero-velocity chassis placement), then DRIVE the last stretch with the
// keyboard until the goal triggers success + feedback.
//
// P11 note: the driving screen now (faithfully to the original) mounts the
// vision layer even when the camera is denied, and its MediaPipe model
// loading/contexts cut headless-SwiftShader frame rates to a few FPS. The scene
// clamps the physics delta (productDriveScene), so below that clamp sim time
// runs slower than wall clock and a FULL real-time drive can no longer finish
// inside any sane headless budget. Teleporting near the goal keeps this test's
// actual subject — goal detection -> success -> feedback -> replay frames —
// while making the wall clock FPS-independent. The full-length real-time
// keyboard drive to 100/100 is covered by the HEADED fake-webcam spec
// (webcam-vision.spec.ts), per the P11 brief's headed verification loop.
test("reaching a lesson goal triggers success + feedback (grading relocation)", async ({
  page,
}) => {
  test.setTimeout(160_000);
  await denyCamera(page);
  await page.addInitScript(() => localStorage.setItem("language", "ja"));
  await page.goto("/?e2e=1");
  await page.waitForFunction(() => Boolean((window as unknown as E2EWindow).__drivingStore), undefined, {
    timeout: 30_000,
  });

  // Start the lesson programmatically (avoids i18n button navigation).
  await page.evaluate(() => {
    const s = (window as unknown as E2EWindow).__drivingStore!.getState();
    s.setLesson("straight");
    s.setScreen("driving");
    s.setMissionState("active");
  });
  await page.waitForFunction(
    () => (window as unknown as E2EWindow).__drivingStore!.getState().screen === "driving",
    undefined,
    { timeout: 30_000 },
  );
  // Wait for the scene + debug hook (set once the PlayCanvas scene resolves),
  // then let the keyboard effect attach its listeners.
  await page.waitForFunction(
    () => Boolean((window as unknown as { __driveDebug?: unknown }).__driveDebug),
    undefined,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(800);

  // Place the car just short of the straight goal (goal box center z=-150 —
  // missions.ts), then drive the last stretch forward (the car faces -z;
  // ArrowUp = throttle) until the goal fires.
  await page.evaluate(() => {
    (window as unknown as { __driveDebug: { teleport: (x: number, z: number) => void } })
      .__driveDebug.teleport(0, -138);
  });
  await page.keyboard.down("ArrowUp");
  await expect
    .poll(() => page.evaluate(() => (window as unknown as E2EWindow).__drivingStore!.getState().screen), {
      timeout: 140_000,
    })
    .toBe("feedback");
  await page.keyboard.up("ArrowUp");

  const state = await page.evaluate(() => {
    const s = (window as unknown as E2EWindow).__drivingStore!.getState();
    return { missionState: s.missionState, frames: s.replayData.length };
  });
  expect(state.missionState).toBe("success");
  expect(state.frames).toBeGreaterThan(0);
});
