import { env } from "@/lib/env";
import { logError } from "@/lib/logger";
import { getRedisClient } from "@/lib/redis";

export type RateLimitPolicy = {
  namespace: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  source: "redis" | "memory";
};

type MemoryWindow = {
  count: number;
  resetAt: number;
};

const memoryWindows = new Map<string, MemoryWindow>();

const incrementFixedWindowScript = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { current, ttl }
`;

export const featherRateLimitPolicy: RateLimitPolicy = {
  namespace: "feathers",
  limit: 30,
  windowMs: 60_000,
};

export const authRateLimitPolicy: RateLimitPolicy = {
  namespace: "auth",
  limit: 10,
  windowMs: 15 * 60_000,
};

export const mfaRateLimitPolicy: RateLimitPolicy = {
  namespace: "mfa",
  limit: 8,
  windowMs: 15 * 60_000,
};

export function getRequestIdentifier(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "anonymous";

  return request.headers.get("x-real-ip") ?? "anonymous";
}

export async function enforceRateLimit(
  identifier: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const key = `rate-limit:${policy.namespace}:${identifier}`;
  const redis = getRedisClient();

  if (redis) {
    try {
      if (redis.status === "wait") await redis.connect();
      const [count, ttl] = (await redis.eval(
        incrementFixedWindowScript,
        1,
        key,
        policy.windowMs,
      )) as [number, number];

      return fromCount(count, Math.max(ttl, 0), policy, "redis");
    } catch (error) {
      logError("Redis rate limit evaluation failed", error, {
        component: "rate-limit",
        namespace: policy.namespace,
      });
    }
  }

  return enforceMemoryRateLimit(key, policy);
}

function enforceMemoryRateLimit(key: string, policy: RateLimitPolicy): RateLimitResult {
  const now = Date.now();
  const current = memoryWindows.get(key);
  const window = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + policy.windowMs }
    : current;

  window.count += 1;
  memoryWindows.set(key, window);

  if (env.RATE_LIMIT_ALLOW_MEMORY_FALLBACK === "false" && env.NODE_ENV === "production") {
    return {
      allowed: false,
      limit: policy.limit,
      remaining: 0,
      resetAt: window.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1_000)),
      source: "memory",
    };
  }

  return fromCount(window.count, window.resetAt - now, policy, "memory");
}

function fromCount(
  count: number,
  ttl: number,
  policy: RateLimitPolicy,
  source: RateLimitResult["source"],
): RateLimitResult {
  const now = Date.now();
  const resetAt = now + ttl;

  return {
    allowed: count <= policy.limit,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - count),
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil(ttl / 1_000)),
    source,
  };
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(Math.ceil(result.resetAt / 1_000)),
    "X-RateLimit-Source": result.source,
    ...(result.allowed ? {} : { "Retry-After": String(result.retryAfterSeconds) }),
  };
}

export function resetMemoryRateLimitsForTest(): void {
  memoryWindows.clear();
}
