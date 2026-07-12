import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// A11y regression scan (PR-3). Drives every product screen via the `?e2e`
// debug store hook and runs axe-core against the rendered DOM, asserting no
// serious/critical WCAG 2 A/AA violations. Excludes the WebGL <canvas> and the
// live webcam <video>/<canvas> — axe cannot read pixel content, and the camera
// preview has no captionable media (see eslint media-has-caption note).
//
// Requires the app built with NEXT_PUBLIC_E2E=1 (so `?e2e` exposes
// window.__drivingStore); the config's webServer runs `next start`.

type E2EState = { setScreen: (s: string) => void; setLesson: (l: string) => void };
type E2EWindow = Window & { __drivingStore?: { getState: () => E2EState } };

const SCREENS = ["language", "home", "auth", "tutorial", "history", "feedback", "driving"] as const;

const VIEWPORTS = [
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

// Seed a language so the first-launch picker doesn't hijack routing, and load
// with ?e2e to expose the store hook.
async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem("language", "en"));
  await page.goto("/?e2e", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as E2EWindow).__drivingStore), null, {
    timeout: 30_000,
  });
}

async function gotoScreen(page: Page, screen: string): Promise<void> {
  await page.evaluate((s) => {
    const store = (window as E2EWindow).__drivingStore?.getState();
    if (!store) throw new Error("store hook missing");
    if (s === "driving") store.setLesson("straight"); // driving needs a lesson
    store.setScreen(s);
  }, screen);
  await page.waitForTimeout(800); // let the screen mount/settle
}

for (const vp of VIEWPORTS) {
  test.describe(`a11y @ ${vp.name}`, () => {
    for (const screen of SCREENS) {
      test(`${screen} has no serious/critical axe violations`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await boot(page);
        await gotoScreen(page, screen);

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .exclude("canvas")
          .exclude("video")
          .analyze();

        const blocking = results.violations.filter(
          (v) => v.impact === "serious" || v.impact === "critical",
        );
        const summary = blocking
          .map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.map((n) => n.target.join(" ")).join("; ")}`)
          .join("\n");
        expect(blocking, `axe violations on "${screen}":\n${summary}`).toEqual([]);
      });
    }
  });
}
