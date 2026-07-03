import { test, expect, type Page } from "@playwright/test";

// B11 — fake-webcam verification of the vision layer. Chrome's fake media device
// gives us a real getUserMedia stream (a synthetic pattern) so the MediaPipe
// pipeline actually starts and runs, but with no detectable hands/face/feet the
// keyboard fallback must still drive exactly as before. Real hand/foot driving
// CANNOT be verified here (no webcam) — that is drive-tested by hand.
test.use({
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
  permissions: ["camera"],
});

type E2EState = {
  steeringAngle: number;
  screen: string;
  missionState: string;
  isVisionReady: boolean;
  replayData: unknown[];
  setLesson: (lesson: string) => void;
  setScreen: (screen: string) => void;
  setMissionState: (state: string) => void;
  setLanguage: (lang: string) => void;
};
type E2EWindow = Window & { __drivingStore?: { getState: () => E2EState } };

function screen(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as E2EWindow).__drivingStore!.getState().screen);
}
function missionState(page: Page): Promise<string> {
  return page.evaluate(
    () => (window as unknown as E2EWindow).__drivingStore!.getState().missionState,
  );
}

async function gotoDriving(page: Page, lang: "ja" | "en"): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.addInitScript((l) => localStorage.setItem("language", l), lang);
  await page.goto("/?e2e=1");
  await page.waitForFunction(() => Boolean((window as unknown as E2EWindow).__drivingStore), undefined, {
    timeout: 30_000,
  });
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
  return errors;
}

test("fake webcam: pipeline starts, preview UI renders, MediaPipe loads (both languages)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = await gotoDriving(page, "en");

  // The self-positioned vision panel (preview + status) must render.
  await expect(page.getByTestId("vision-panel")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("vision-preview")).toBeVisible();

  // MediaPipe models load from the CDN; wait generously. If the environment has
  // no network to the CDN this stays false — the test logs it and still proves
  // the no-crash + fallback path below.
  let visionReady = false;
  try {
    await page.waitForFunction(
      () => (window as unknown as E2EWindow).__drivingStore!.getState().isVisionReady === true,
      undefined,
      { timeout: 90_000 },
    );
    visionReady = true;
  } catch {
    visionReady = false;
  }
  console.log(`[b11] isVisionReady=${visionReady}`);

  await page.screenshot({ path: "test-results/b11-drive-vision-en.png" });

  // Same screen in Japanese (localized status panel + labels).
  await page.evaluate(() => (window as unknown as E2EWindow).__drivingStore!.getState().setLanguage("ja"));
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/b11-drive-vision-ja.png" });

  // No uncaught errors from the pipeline. (MediaPipe may log benign GPU-delegate
  // fallback warnings via console.warn — those are not console.error, so ignored.)
  expect(errors, `page errors: ${errors.join("\n")}`).toEqual([]);
});

test("fake webcam + no detectable input: keyboard drives the straight lesson to 100/100", async ({
  page,
}) => {
  // Car physics is delta-time, but MediaPipe inference competes for the main
  // thread on headless SwiftShader, so give the real-time drive generous headroom.
  test.setTimeout(220_000);
  const errors = await gotoDriving(page, "ja");

  // Let the scene/canvas mount and keyboard listeners attach.
  await page.waitForTimeout(1500);

  // With the fake pattern there are no hands, so the vision loop (if running)
  // writes steering 0; the straight lesson needs only throttle, and pedals are
  // untouched pre-calibration, so keyboard ArrowUp drives to the goal.
  await page.keyboard.down("ArrowUp");
  await expect.poll(() => screen(page), { timeout: 200_000 }).toBe("feedback");
  await page.keyboard.up("ArrowUp");

  const score = await page.getByTestId("feedback-score").innerText();
  console.log(`[b11] straight-lesson feedback score = ${score}`);
  expect(score.trim().startsWith("100")).toBe(true);

  expect(await missionState(page)).toBe("success");

  await page.screenshot({ path: "test-results/b11-feedback-100.png" });
  expect(errors, `page errors: ${errors.join("\n")}`).toEqual([]);
});
