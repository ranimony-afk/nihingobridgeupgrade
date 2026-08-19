export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

export type RateStore = {
  increment(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
};

export class MemoryRateStore implements RateStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async increment(key: string, windowMs: number) {
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { count: 1, ttlMs: windowMs };
    }
    current.count += 1;
    return { count: current.count, ttlMs: Math.max(0, current.resetAt - now) };
  }
}

export function createRateLimiter(store: RateStore) {
  return async function limit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
    const { count, ttlMs } = await store.increment(key, windowMs);
    if (count > max) {
      return { allowed: false, remaining: 0, retryAfter: Math.ceil(ttlMs / 1000) };
    }
    return { allowed: true, remaining: Math.max(0, max - count), retryAfter: 0 };
  };
}

const memory = new MemoryRateStore();
const memoryLimit = createRateLimiter(memory);

export async function enforceRateLimit(input: {
  key: string;
  bucket: string;
  limit: number;
  windowSec: number;
}): Promise<RateLimitResult> {
  const namespaced = `${input.bucket}:${input.key}`;
  try {
    const { getRedis } = await import("./redis");
    const redis = await getRedis();
    if (redis) {
      const redisKey = `rl:${namespaced}`;
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.pexpire(redisKey, input.windowSec * 1000);
      const ttlMs = await redis.pttl(redisKey);
      if (count > input.limit) {
        return { allowed: false, remaining: 0, retryAfter: Math.max(1, Math.ceil(ttlMs / 1000)) };
      }
      return { allowed: true, remaining: Math.max(0, input.limit - count), retryAfter: 0 };
    }
  } catch {
    // Redis is optional; memory limiter keeps the API available.
  }
  return memoryLimit(namespaced, input.limit, input.windowSec * 1000);
}

export function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "local";
}
