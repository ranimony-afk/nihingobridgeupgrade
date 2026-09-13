import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright runs the dictionary journey against a PRODUCTION build served by
 * `next start`, not `next dev`, so the gate exercises the deployable artefact.
 *
 * `npm run build` must have completed before `npx playwright test`.
 */
const PORT = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? "3100", 10);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "reports/playwright" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npx next start --port ${PORT}`,
        url: `${BASE_URL}/api/health`,
        // Never reuse a pre-existing server: a leftover process started with
        // different env would silently invalidate the gate. Always spawn our
        // own, with exactly the env declared below.
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          ...process.env,
          // The gate runs a PRODUCTION build against the Phase 04 FIXTURE
          // corpus. Fixture-derived enrichments (furigana, conjugation, JLPT)
          // are hidden under NODE_ENV=production by design; this explicit
          // opt-in surfaces them so the journey can assert on them. It is
          // scoped to this test server and must never be set in a real deploy.
          DICTIONARY_SHOW_FIXTURE_ENRICHMENTS: "true",
        },
      },
});
