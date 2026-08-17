import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryRateStore, createRateLimiter } from "../../src/lib/infra/rate-limit.ts";

test("memory limiter allows traffic under the cap", async () => {
  const limit = createRateLimiter(new MemoryRateStore());
  const first = await limit("ip:1", 2, 60_000);
  const second = await limit("ip:1", 2, 60_000);
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
});

test("memory limiter blocks the overflow request", async () => {
  const limit = createRateLimiter(new MemoryRateStore());
  await limit("ip:2", 1, 60_000);
  const blocked = await limit("ip:2", 1, 60_000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfter >= 0);
});
