import test from "node:test";
import assert from "node:assert/strict";

import {
  assertRuntimeReady,
  formatIssues,
  parseEnvironment,
  type EnvIssue,
} from "../../../src/config/env.ts";

const DB = "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
const STRONG_SECRET = "a".repeat(32);

function keys(issues: EnvIssue[]): string[] {
  return issues.map((issue) => issue.key);
}

// ── Minimal viable configuration ──────────────

test("the platform is valid with only DATABASE_URL", () => {
  const result = parseEnvironment({ DATABASE_URL: DB });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("defaults are applied across every section", () => {
  const { config } = parseEnvironment({ DATABASE_URL: DB });
  assert.ok(config);
  assert.equal(config.app.nodeEnv, "development");
  assert.equal(config.app.logLevel, "info");
  assert.equal(config.database.poolMax, 10);
  assert.equal(config.auth.cookieName, "nb_session");
  assert.equal(config.ai.provider, "mock");
  assert.equal(config.storage.driver, "none");
  assert.equal(config.search.driver, "postgres");
});

// ── Database ──────────────────────────────────

test("a missing DATABASE_URL is a fatal, actionable error", () => {
  const result = parseEnvironment({});
  assert.equal(result.ok, false);
  assert.equal(result.config, null);
  const issue = result.errors.find((error) => error.key === "DATABASE_URL");
  assert.ok(issue);
  assert.match(issue.message, /required/i);
  assert.match(issue.message, /\.env\.example/);
});

test("a blank DATABASE_URL counts as missing", () => {
  assert.equal(parseEnvironment({ DATABASE_URL: "   " }).ok, false);
});

test("a non-postgres DATABASE_URL is rejected", () => {
  const result = parseEnvironment({ DATABASE_URL: "mysql://localhost/db" });
  assert.equal(result.ok, false);
  assert.ok(keys(result.errors).includes("DATABASE_URL"));
});

test("ssl defaults off for local hosts and on for remote hosts", () => {
  const local = parseEnvironment({ DATABASE_URL: DB }).config;
  const remote = parseEnvironment({
    DATABASE_URL: "postgresql://u:p@db.example.com:5432/app",
  }).config;
  assert.equal(local?.database.ssl, false);
  assert.equal(remote?.database.ssl, true);
});

test("an out-of-range pool size is reported", () => {
  const result = parseEnvironment({ DATABASE_URL: DB, DATABASE_POOL_MAX: "500" });
  assert.equal(result.ok, false);
  assert.ok(keys(result.errors).includes("DATABASE_POOL_MAX"));
});

// ── Application ───────────────────────────────

test("a malformed application URL is rejected", () => {
  const result = parseEnvironment({ DATABASE_URL: DB, NEXT_PUBLIC_APP_URL: "not-a-url" });
  assert.equal(result.ok, false);
  assert.ok(keys(result.errors).includes("NEXT_PUBLIC_APP_URL"));
});

test("a non-http application URL is rejected", () => {
  const result = parseEnvironment({ DATABASE_URL: DB, NEXT_PUBLIC_APP_URL: "ftp://x.com" });
  assert.equal(result.ok, false);
});

test("a trailing slash is normalised away", () => {
  const { config } = parseEnvironment({
    DATABASE_URL: DB,
    NEXT_PUBLIC_APP_URL: "https://nihongobridge.app/",
  });
  assert.equal(config?.app.url, "https://nihongobridge.app");
});

test("an invalid LOG_LEVEL is reported", () => {
  assert.equal(parseEnvironment({ DATABASE_URL: DB, LOG_LEVEL: "verbose" }).ok, false);
});

// ── Authentication ────────────────────────────

test("a missing session secret warns in development but still builds", () => {
  const result = parseEnvironment({ DATABASE_URL: DB });
  assert.equal(result.ok, true);
  assert.ok(keys(result.warnings).includes("AUTH_SESSION_SECRET"));
  assert.equal(result.config?.auth.configured, false);
});

test("a short session secret is fatal", () => {
  const result = parseEnvironment({ DATABASE_URL: DB, AUTH_SESSION_SECRET: "too-short" });
  assert.equal(result.ok, false);
  assert.ok(keys(result.errors).includes("AUTH_SESSION_SECRET"));
});

test("a strong session secret marks auth as configured", () => {
  const { config } = parseEnvironment({ DATABASE_URL: DB, AUTH_SESSION_SECRET: STRONG_SECRET });
  assert.equal(config?.auth.configured, true);
});

test("production refuses to start without a session secret", () => {
  const { config } = parseEnvironment({ DATABASE_URL: DB, NODE_ENV: "production" });
  assert.ok(config);
  assert.throws(() => assertRuntimeReady(config), /AUTH_SESSION_SECRET/);
});

test("production starts when auth is configured", () => {
  const { config } = parseEnvironment({
    DATABASE_URL: DB,
    NODE_ENV: "production",
    AUTH_SESSION_SECRET: STRONG_SECRET,
  });
  assert.ok(config);
  assert.doesNotThrow(() => assertRuntimeReady(config));
});

test("development never blocks on runtime readiness", () => {
  const { config } = parseEnvironment({ DATABASE_URL: DB });
  assert.ok(config);
  assert.doesNotThrow(() => assertRuntimeReady(config));
});

// ── AI ────────────────────────────────────────

test("AI falls back to the mock provider with a warning", () => {
  const result = parseEnvironment({ DATABASE_URL: DB });
  assert.equal(result.config?.ai.enabled, false);
  assert.equal(result.config?.ai.provider, "mock");
  assert.ok(result.warnings.some((warning) => warning.message.includes("mock")));
});

test("a provider is selected automatically from the key present", () => {
  const openai = parseEnvironment({ DATABASE_URL: DB, OPENAI_API_KEY: "sk-test" }).config;
  const anthropic = parseEnvironment({ DATABASE_URL: DB, ANTHROPIC_API_KEY: "sk-ant" }).config;
  assert.equal(openai?.ai.provider, "openai");
  assert.equal(anthropic?.ai.provider, "anthropic");
  assert.equal(openai?.ai.enabled, true);
});

test("an explicitly requested provider requires its key", () => {
  const result = parseEnvironment({ DATABASE_URL: DB, AI_PROVIDER: "anthropic" });
  assert.equal(result.ok, false);
  assert.ok(keys(result.errors).includes("ANTHROPIC_API_KEY"));
});

test("the mock provider can be forced even when a key exists", () => {
  const { config } = parseEnvironment({
    DATABASE_URL: DB,
    AI_PROVIDER: "mock",
    OPENAI_API_KEY: "sk-test",
  });
  assert.equal(config?.ai.provider, "mock");
});

test("an out-of-range AI timeout is reported", () => {
  assert.equal(
    parseEnvironment({ DATABASE_URL: DB, AI_REQUEST_TIMEOUT_MS: "999999" }).ok,
    false,
  );
});

// ── Storage ───────────────────────────────────

test("storage is disabled by default", () => {
  const { config } = parseEnvironment({ DATABASE_URL: DB });
  assert.equal(config?.storage.driver, "none");
});

test("the s3 driver requires its full credential set", () => {
  const result = parseEnvironment({ DATABASE_URL: DB, STORAGE_DRIVER: "s3" });
  assert.equal(result.ok, false);
  const reported = keys(result.errors);
  for (const key of [
    "STORAGE_BUCKET",
    "STORAGE_REGION",
    "STORAGE_ACCESS_KEY_ID",
    "STORAGE_SECRET_ACCESS_KEY",
  ]) {
    assert.ok(reported.includes(key), `expected ${key} to be reported`);
  }
});

test("a complete s3 configuration is accepted", () => {
  const result = parseEnvironment({
    DATABASE_URL: DB,
    STORAGE_DRIVER: "s3",
    STORAGE_BUCKET: "nb-audio",
    STORAGE_REGION: "ap-northeast-1",
    STORAGE_ACCESS_KEY_ID: "key",
    STORAGE_SECRET_ACCESS_KEY: "secret",
  });
  assert.equal(result.ok, true);
  assert.equal(result.config?.storage.bucket, "nb-audio");
});

test("the local driver gets a default directory", () => {
  const { config } = parseEnvironment({ DATABASE_URL: DB, STORAGE_DRIVER: "local" });
  assert.equal(config?.storage.localDir, "./.storage");
});

test("an unknown storage driver is rejected", () => {
  assert.equal(parseEnvironment({ DATABASE_URL: DB, STORAGE_DRIVER: "minio" }).ok, false);
});

// ── Search ────────────────────────────────────

test("search is postgres with sane defaults", () => {
  const { config } = parseEnvironment({ DATABASE_URL: DB });
  assert.equal(config?.search.driver, "postgres");
  assert.equal(config?.search.trigramThreshold, 0.3);
  assert.equal(config?.search.autoCreateExtensions, true);
});

test("the trigram threshold is range-checked", () => {
  assert.equal(parseEnvironment({ DATABASE_URL: DB, SEARCH_TRIGRAM_THRESHOLD: "5" }).ok, false);
  assert.equal(parseEnvironment({ DATABASE_URL: DB, SEARCH_TRIGRAM_THRESHOLD: "0.45" }).ok, true);
});

// ── Banned and excluded variables ─────────────

test("authentication bypass switches are always fatal", () => {
  for (const key of ["ALLOW_INSECURE_USER_HEADER", "ADMIN_DEMO_MODE"]) {
    const result = parseEnvironment({ DATABASE_URL: DB, [key]: "true" });
    assert.equal(result.ok, false, `${key} must be rejected`);
    assert.ok(keys(result.errors).includes(key));
  }
});

test("frozen-out integrations warn instead of silently applying", () => {
  const result = parseEnvironment({
    DATABASE_URL: DB,
    SUPABASE_URL: "https://x.supabase.co",
    MEILISEARCH_URL: "http://localhost:7700",
  });
  assert.equal(result.ok, true);
  assert.ok(keys(result.warnings).includes("SUPABASE_URL"));
  assert.ok(keys(result.warnings).includes("MEILISEARCH_URL"));
});

// ── Reporting ─────────────────────────────────

test("every problem is collected, not just the first", () => {
  const result = parseEnvironment({ LOG_LEVEL: "loud", DATABASE_POOL_MAX: "0" });
  assert.ok(result.errors.length >= 3);
});

test("formatted output lists each issue and hides values", () => {
  const text = formatIssues("Errors:", [
    { key: "DATABASE_URL", message: "DATABASE_URL is required" },
  ]);
  assert.match(text, /Errors:/);
  assert.match(text, /- DATABASE_URL: /);
  assert.equal(formatIssues("Errors:", []), "");
});
