import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end configuration.
 *
 * This layer drives a real browser against a real production build, so it
 * catches what HTTP-level tests cannot: hydration errors, console exceptions,
 * layout, and accessibility.
 *
 * It is deliberately NOT part of `npm run verify`. Browser binaries are a
 * ~150MB prerequisite that a clean CI runner may not have, and the gate must
 * stay hermetic. Run it explicitly:
 *
 *   npx playwright install chromium   # once
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts$/,

  // Fail the run if a spec was accidentally committed with test.only.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: process.env.NB_TEST_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /**
   * Playwright owns the server for this layer. When NB_TEST_BASE_URL is set
   * (a server is already running), reuse it instead of starting another.
   */
  webServer: process.env.NB_TEST_BASE_URL
    ? undefined
    : {
        command: "npx next start --port 3100",
        url: "http://127.0.0.1:3100/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
