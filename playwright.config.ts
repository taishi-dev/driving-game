import { defineConfig, devices } from "@playwright/test";

// E2E tests run against the production build (`next start`), matching what CI
// builds and what the smoke step uses. Build first (`npm run build`), then
// `npm run test:e2e`.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
