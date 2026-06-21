import { test, expect, type Page } from "@playwright/test";

// Shape of the opt-in debug hook exposed on `window.__drivingStore` when the
// page is loaded with `?e2e` (see src/lib/store.ts).
type E2EStore = { getState: () => { steeringAngle: number; screen: string } };
type E2EWindow = Window & { __drivingStore?: E2EStore };

const STEER_AMOUNT = 0.6; // mirrors KeyboardControls.tsx

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
  await page.goto("/?e2e=1");
  await page.getByRole("button", { name: /フリーモード/ }).click();
  await page.waitForFunction(
    () => (window as unknown as E2EWindow).__drivingStore?.getState().screen === "driving",
    undefined,
    { timeout: 30_000 },
  );
  // Let KeyboardControls' effect attach its window keydown/keyup listeners.
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

// Note: the camera-error overlay only renders after MediaPipe models finish
// loading from their CDN (then getUserMedia is called and rejected). It is
// therefore network-dependent and given a generous timeout. If the CDN is
// unreachable this is expected to be the flaky one — quarantine it before the
// keyboard-fallback test above if that ever happens.
test("camera-denied shows the keyboard-fallback overlay", async ({ page }) => {
  await denyCamera(page);
  await startFreeDrive(page);

  await expect(page.getByText("📷 カメラを利用できません")).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByText("カメラへのアクセスが拒否されました", { exact: false }),
  ).toBeVisible();
});
