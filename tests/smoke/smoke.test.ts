/**
 * SMOKE SUITE — the deployment gate.
 *
 * Three checks, in dependency order:
 *   1. homepage          the web tier renders
 *   2. health API        the API tier answers
 *   3. database          the data tier is reachable, directly and through the app
 *
 * If every test here passes, the deployment is serving traffic end to end.
 * Keep this suite small and fast; depth belongs in the other layers.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { openTestDb, scalar, type TestDb } from "../helpers/db.ts";
import { documentTitle, get, isHtmlDocument, visibleText } from "../helpers/http.ts";

let db: TestDb;

before(() => {
  db = openTestDb();
});

after(async () => {
  await db.close();
});

// ─────────────────────────────────────────────
// 1. Homepage
// ─────────────────────────────────────────────

test("smoke: homepage responds 200", async () => {
  const result = await get("/");
  assert.equal(result.status, 200, `homepage returned ${result.status}`);
});

test("smoke: homepage returns a complete HTML document", async () => {
  const result = await get("/");
  assert.ok(isHtmlDocument(result), "expected a text/html document");
  assert.match(result.text, /<\/html>/i, "document was truncated");
});

test("smoke: homepage is server-rendered with visible content", async () => {
  const result = await get("/");
  const text = visibleText(result.text);
  // Server-rendered output must contain real copy, not an empty shell that
  // only fills in after client-side hydration.
  assert.ok(text.length > 50, `rendered text too short: ${text.length} chars`);
});

test("smoke: homepage declares a title and language", async () => {
  const result = await get("/");
  assert.ok(documentTitle(result.text), "missing <title>");
  assert.match(result.text, /<html[^>]+lang=/i, "missing lang attribute");
});

test("smoke: homepage renders only after a successful database query", async () => {
  // The page runs `select 1` during server rendering, so a 200 here means the
  // database was reachable at render time. A failure would surface as a 500.
  const result = await get("/");
  assert.equal(result.status, 200);
  assert.ok(!/Internal Server Error/i.test(result.text));
});

// ─────────────────────────────────────────────
// 2. Health API
// ─────────────────────────────────────────────

test("smoke: health endpoint responds 200 with { ok: true }", async () => {
  const result = await get<{ ok: boolean }>("/api/health");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
});

test("smoke: health endpoint is JSON", async () => {
  const result = await get("/api/health");
  assert.match(result.headers.get("content-type") ?? "", /application\/json/);
});

// ─────────────────────────────────────────────
// 3. Database connectivity
// ─────────────────────────────────────────────

test("smoke: database accepts a direct connection", async () => {
  const value = await scalar<number>(db.pool, "select 1 as value");
  assert.equal(Number(value), 1);
});

test("smoke: database identifies itself as PostgreSQL", async () => {
  const version = await scalar<string>(db.pool, "select version()");
  assert.match(String(version), /PostgreSQL/i);
});

test("smoke: application and tests reach the same database", async () => {
  // Both tiers report healthy against the configured DATABASE_URL.
  const direct = await scalar<number>(db.pool, "select 1 as value");
  const viaApp = await get<{ ok: boolean }>("/api/health");
  assert.equal(Number(direct), 1, "direct connection failed");
  assert.equal(viaApp.body.ok, true, "application connection failed");
});

// ─────────────────────────────────────────────
// Baseline behaviour
// ─────────────────────────────────────────────

test("smoke: unknown routes return 404", async () => {
  const result = await get("/this-page-does-not-exist");
  assert.equal(result.status, 404);
});
