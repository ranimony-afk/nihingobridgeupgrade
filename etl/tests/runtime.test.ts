/** Shared production-operations unit tests (no database/network required). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { isRetryableHttpStatus, RetryExhaustedError, withRetry } from "../runtime/retry";

test("retry succeeds after transient failures with capped exponential delays", async () => {
  let calls = 0;
  const delays: number[] = [];
  const value = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error("temporary network failure");
      return "ok";
    },
    {
      attempts: 4,
      baseDelayMs: 10,
      maxDelayMs: 15,
      sleep: async (delay) => {
        delays.push(delay);
      },
    },
  );
  assert.equal(value, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [10, 15]);
});

test("retry stops immediately for a non-retryable error", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw new Error("HTTP 404");
      },
      {
        attempts: 4,
        baseDelayMs: 0,
        shouldRetry: () => false,
      },
    ),
    RetryExhaustedError,
  );
  assert.equal(calls, 1);
});

test("retry reports exhaustion after its bounded attempt count", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw new Error("offline");
      },
      { attempts: 3, baseDelayMs: 0 },
    ),
    (error: unknown) => {
      assert.ok(error instanceof RetryExhaustedError);
      assert.equal(error.attempts, 3);
      assert.equal(error.causeError instanceof Error && error.causeError.message, "offline");
      return true;
    },
  );
  assert.equal(calls, 3);
});

test("HTTP retry classification only accepts transient statuses", () => {
  assert.equal(isRetryableHttpStatus(408), true);
  assert.equal(isRetryableHttpStatus(429), true);
  assert.equal(isRetryableHttpStatus(500), true);
  assert.equal(isRetryableHttpStatus(404), false);
  assert.equal(isRetryableHttpStatus(401), false);
});
