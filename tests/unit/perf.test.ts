import assert from "node:assert/strict";
import { test } from "node:test";
import { privateCacheHeaders, publicCacheHeaders, REVALIDATE } from "../../src/lib/perf/cache.ts";

test("public cache headers allow CDN reuse with background revalidation", () => {
  const headers = publicCacheHeaders(300, 3600);
  const value = headers["Cache-Control"];
  // s-maxage targets the CDN; max-age=0 keeps the browser honest.
  assert.match(value, /s-maxage=300/);
  assert.match(value, /stale-while-revalidate=3600/);
  assert.match(value, /public/);
  assert.match(value, /max-age=0/);
});

test("personalised responses are never stored by a shared cache", () => {
  // Caching these at a CDN would serve one learner's data to another.
  const value = privateCacheHeaders()["Cache-Control"];
  assert.match(value, /private/);
  assert.match(value, /no-store/);
  assert.ok(!value.includes("s-maxage"));
});

test("revalidate windows are ordered by how often content changes", () => {
  assert.ok(REVALIDATE.content < REVALIDATE.reference);
  assert.ok(REVALIDATE.content > 0);
});
