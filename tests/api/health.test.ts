/**
 * API layer — HTTP against the running production server.
 *
 * `GET /api/health` is a frozen contract (API_OWNERSHIP §3.1): it must keep
 * returning `{ ok: true }`. These tests exist so that contract cannot be
 * changed accidentally by a future refactor.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { get } from "../helpers/http.ts";

test("GET /api/health responds 200", async () => {
  const result = await get("/api/health");
  assert.equal(result.status, 200);
});

test("GET /api/health returns exactly { ok: true }", async () => {
  const result = await get<{ ok: boolean }>("/api/health");
  assert.deepEqual(result.body, { ok: true });
});

test("GET /api/health is served as JSON", async () => {
  const result = await get("/api/health");
  assert.match(result.headers.get("content-type") ?? "", /application\/json/);
});

test("GET /api/health proves database connectivity through the app", async () => {
  // The handler runs `select 1` before answering, so ok:true means the
  // application's own pool reached PostgreSQL — not just that Node is up.
  const result = await get<{ ok: boolean }>("/api/health");
  assert.equal(result.body.ok, true);
});

test("GET /api/health is not cached", async () => {
  const result = await get("/api/health");
  const cacheControl = result.headers.get("cache-control") ?? "";
  assert.ok(
    /no-store|no-cache|max-age=0|must-revalidate/.test(cacheControl),
    `health must not be cached, got: "${cacheControl}"`,
  );
});

test("GET /api/health responds quickly", async () => {
  const result = await get("/api/health");
  assert.ok(
    result.durationMs < 3_000,
    `health took ${result.durationMs.toFixed(0)}ms`,
  );
});

test("repeated health checks stay stable", async () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await get<{ ok: boolean }>("/api/health");
    assert.equal(result.status, 200, `attempt ${attempt + 1}`);
    assert.equal(result.body.ok, true, `attempt ${attempt + 1}`);
  }
});

test("an unknown API route returns 404, not 200", async () => {
  const result = await get("/api/does-not-exist");
  assert.equal(result.status, 404);
});

test("no server implementation details leak in headers", async () => {
  const result = await get("/api/health");
  // x-powered-by discloses the framework and should not be advertised.
  const poweredBy = result.headers.get("x-powered-by");
  assert.ok(
    poweredBy === null || !/express|php/i.test(poweredBy),
    `unexpected x-powered-by: ${poweredBy}`,
  );
});
