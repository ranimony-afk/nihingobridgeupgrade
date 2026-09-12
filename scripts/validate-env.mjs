#!/usr/bin/env node
/**
 * Environment validation gate.
 *
 * Runs automatically before `npm run build` (the `prebuild` hook) so a
 * production build fails immediately, and legibly, when required
 * configuration is absent — instead of failing deep inside page collection
 * with an opaque stack trace.
 *
 * Exit codes:
 *   0  configuration is usable (warnings may be printed)
 *   1  configuration is invalid; every problem is listed
 *
 * Usage:
 *   node scripts/validate-env.mjs
 *   node scripts/validate-env.mjs --quiet      only print on failure
 *   node scripts/validate-env.mjs --runtime    also apply production checks
 */

import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { config as loadDotenv } from "dotenv";

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const quiet = args.has("--quiet");
const runtime = args.has("--runtime");

// Next.js loads .env itself, but this script runs as a plain Node process,
// so the file has to be read explicitly. Real environment variables win.
loadDotenv({ path: path.join(ROOT, ".env"), override: false, quiet: true });

const envModule = await import(
  pathToFileURL(path.join(ROOT, "src", "config", "env.ts")).href
);
const { parseEnvironment, assertRuntimeReady, formatIssues } = envModule;

const result = parseEnvironment(process.env);

if (result.warnings.length > 0 && !quiet) {
  console.warn(formatIssues("Environment warnings:", result.warnings));
  console.warn("");
}

if (!result.ok) {
  console.error("");
  console.error("  Environment validation FAILED");
  console.error("  ------------------------------------------------------");
  console.error(formatIssues("  Errors:", result.errors));
  console.error("  ------------------------------------------------------");
  console.error("  Fix: copy .env.example to .env and provide the values above.");
  console.error("  No secrets are printed by this tool.");
  console.error("");
  process.exit(1);
}

if (runtime) {
  try {
    assertRuntimeReady(result.config);
  } catch (error) {
    console.error("");
    console.error("  Runtime readiness FAILED");
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    console.error("");
    process.exit(1);
  }
}

if (!quiet) {
  const { app, database, auth, ai, storage, search } = result.config;
  console.log("Environment validated:");
  console.log(`  app       ${app.name} (${app.nodeEnv})${app.url ? ` at ${app.url}` : ""}`);
  console.log(`  database  postgres, pool ${database.poolMax}, ssl ${database.ssl ? "on" : "off"}`);
  console.log(`  auth      ${auth.configured ? "session secret configured" : "ephemeral key (dev only)"}`);
  console.log(`  ai        ${ai.provider}${ai.enabled ? "" : " (no provider key)"}`);
  console.log(`  storage   ${storage.driver}`);
  console.log(`  search    ${search.driver}, trigram ${search.trigramThreshold}`);
}
