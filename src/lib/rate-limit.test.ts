import { beforeEach, describe, expect, it } from "vitest";
import {
  enforceRateLimit,
  rateLimitHeaders,
  resetMemoryRateLimitsForTest,
  type RateLimitPolicy,
} from "@/lib/rate-limit";

const policy: RateLimitPolicy = {
  namespace: "unit-test",
  limit: 2,
  windowMs: 60_000,
};

describe("enforceRateLimit", () => {
  beforeEach(() => {
    resetMemoryRateLimitsForTest();
  });

  it("accepts requests through the configured threshold and rejects the next request", async () => {
    const first = await enforceRateLimit("learner-1", policy);
    const second = await enforceRateLimit("learner-1", policy);
    const third = await enforceRateLimit("learner-1", policy);

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps independent counters per identifier", async () => {
    await enforceRateLimit("learner-1", policy);
    const otherLearner = await enforceRateLimit("learner-2", policy);

    expect(otherLearner.allowed).toBe(true);
    expect(otherLearner.remaining).toBe(1);
  });

  it("returns standards-compatible response headers", async () => {
    const result = await enforceRateLimit("learner-1", policy);
    const headers = new Headers(rateLimitHeaders(result));

    expect(headers.get("RateLimit-Limit")).toBe("2");
    expect(headers.get("RateLimit-Remaining")).toBe("1");
    expect(headers.get("RateLimit-Reset")).toMatch(/^\d+$/);
  });
});
