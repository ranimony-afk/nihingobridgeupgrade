import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration for the dictionary journey.
 *
 * The webServer is started and stopped by Playwright on a dedicated port so no
 * long-lived server process is left behind.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "off",
  },
  webServer: {
    command: "npx next start -p 3100",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    // The local corpus is a synthetic fixture; enrichments are deliberately
    // visible so the UI journey exercises every section.
    env: { ...process.env, KNOWLEDGE_ALLOW_FIXTURE_ENRICHMENTS: "true" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
