import { test, expect, type Page } from "@playwright/test";

// B11 — fake-webcam verification of the vision layer. Chrome's fake media device
// gives us a real getUserMedia stream (a synthetic pattern) so the MediaPipe
// pipeline actually starts and runs, but with no detectable hands/face/feet the
// keyboard fallback must still drive exactly as before. Real hand/foot driving
// CANNOT be verified here (no webcam) — that is drive-tested by hand.
//
// HEADED on purpose (the B11 brief prescribes headed + fake stream): headless
// Chromium uses SwiftShader + the TFLite CPU (XNNPACK) delegate, which starves
// the render loop to ~1 FPS; the scene's physics delta clamp (driveScene.ts,
// min(dt, 1/30)) then makes sim time ~30x slower than wall clock, so a
// real-time drive can never reach the goal. Headed runs on the real GPU
// (MediaPipe GPU delegate + normal frame rate).
test.use({
  headless: false,
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
  permissions: ["camera"],
});

// CI runners have no display server for a headed browser, and headless would
// reintroduce the 1 FPS SwiftShader problem — this spec is local-only.
// (The camera-DENIED path stays covered on CI by webcam-fallback.spec.ts.)
test.skip(!!process.env.CI, "headed-only spec: requires a display + real GPU");

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

// TFLite/MediaPipe write benign informational lines to stderr, which Chromium
// surfaces as console `error` messages (e.g. "INFO: Created TensorFlow Lite
// XNNPACK delegate for CPU."). Those are not failures — only real errors count.
function isBenignConsoleError(text: string): boolean {
  return /^(INFO|WARNING):/.test(text) || text.includes("TensorFlow Lite");
}

async function gotoDriving(page: Page, lang: "ja" | "en"): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !isBenignConsoleError(m.text())) errors.push(m.text());
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

  // MediaPipe models load from the CDN — the vision-ready flag must go true.
  await page.waitForFunction(
    () => (window as unknown as E2EWindow).__drivingStore!.getState().isVisionReady === true,
    undefined,
    { timeout: 90_000 },
  );

  // FPS with vision running (brief: check the readout). Give the loop a moment
  // to settle after model load, then log what the badge shows.
  await page.waitForTimeout(3_000);
  const fpsText = await page.getByTestId("drive-fps").innerText();
  console.log(`[b11] FPS with vision running: ${fpsText}`);

  await page.screenshot({ path: "test-results/b11-drive-vision-en.png" });

  // Same screen in Japanese (localized status panel + labels).
  await page.evaluate(() => (window as unknown as E2EWindow).__drivingStore!.getState().setLanguage("ja"));
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/b11-drive-vision-ja.png" });

  // No real uncaught errors from the pipeline (benign TFLite INFO lines filtered).
  expect(errors, `page errors: ${errors.join("\n")}`).toEqual([]);
});

test("fake webcam + no detectable input: keyboard drives the straight lesson to 100/100", async ({
  page,
}) => {
  // Physics sim time tracks wall clock only up to the 1/30 s per-frame clamp,
  // so keep generous headroom for slower frame rates.
  test.setTimeout(220_000);
  const errors = await gotoDriving(page, "ja");

  // Let the scene/canvas mount and keyboard listeners attach.
  await page.waitForTimeout(1500);

  // With the fake pattern there are no hands, so the vision loop (once running)
  // writes steering 0 every frame — the original behavior; the straight lesson
  // needs only throttle. Pedals are untouched pre-calibration (decidePedalActions
  // writes nothing in the idle stage), so keyboard ArrowUp drives to the goal.
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
