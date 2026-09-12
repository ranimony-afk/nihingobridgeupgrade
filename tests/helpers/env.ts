/**
 * Test environment loading.
 *
 * Tests run as plain Node processes, so Next.js's automatic `.env` loading
 * does not apply. This module loads it once, explicitly, and exposes the two
 * values the integration/API/smoke layers need.
 *
 * Real environment variables always win over `.env` (CI overrides local).
 */

import path from "node:path";
import process from "node:process";

import { config as loadDotenv } from "dotenv";

let loaded = false;

/** Load `.env` exactly once per process. */
export function loadTestEnv(): void {
  if (loaded) return;
  loadDotenv({
    path: path.join(process.cwd(), ".env"),
    override: false,
    quiet: true,
  });
  loaded = true;
}

/**
 * PostgreSQL connection string for integration tests.
 * Throws with an actionable message rather than failing on a null later.
 */
export function databaseUrl(): string {
  loadTestEnv();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Integration tests need a database. " +
        "Copy .env.example to .env and set DATABASE_URL.",
    );
  }
  return url;
}

/**
 * Base URL of the server under test.
 *
 * The server lifecycle is owned by `scripts/run-server-tests.mjs`, which sets
 * this variable. Tests never spawn servers themselves — one owner, no orphans.
 */
export function baseUrl(): string {
  loadTestEnv();
  const url = process.env.NB_TEST_BASE_URL?.trim();
  if (!url) {
    throw new Error(
      "NB_TEST_BASE_URL is not set. Server-backed tests must be launched with:\n" +
        "  npm run test:api     (API layer)\n" +
        "  npm run test:smoke   (smoke layer)\n" +
        "  npm run test:server  (both)\n" +
        "These build the app, start it, run the tests, and shut it down.",
    );
  }
  return url.replace(/\/+$/, "");
}
