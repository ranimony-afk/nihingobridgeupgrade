/**
 * Minimal in-process sliding-window rate limiter.
 *
 * Serverless instances are short lived, so this is a cheap abuse guard rather
 * than a global quota: put a real limiter (Vercel Firewall / Upstash) in front
 * for production quotas. Results are exposed through `X-RateLimit-*` headers.
 */

type Bucket = { hits: number[] };

const globalForLimit = globalThis as typeof globalThis & {
  __nihongoBridgeRateLimit?: Map<string, Bucket>;
};

const buckets = (globalForLimit.__nihongoBridgeRateLimit ??= new Map<string, Bucket>());

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  headers: Record<string, string>;
}

export function rateLimit(
  identifier: string,
  options: { limit?: number; windowMs?: number } = {},
): RateLimitResult {
  const limit = options.limit ?? Number(process.env.API_RATE_LIMIT ?? 240);
  const windowMs = options.windowMs ?? 60_000;
  const now = Date.now();
  const bucket = buckets.get(identifier) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((timestamp) => now - timestamp < windowMs);

  if (bucket.hits.length >= limit) {
    const resetAt = bucket.hits[0] + windowMs;
    buckets.set(identifier, bucket);
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt,
      headers: {
        "x-ratelimit-limit": String(limit),
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.ceil((resetAt - now) / 1000)),
        "retry-after": String(Math.ceil((resetAt - now) / 1000)),
      },
    };
  }

  bucket.hits.push(now);
  buckets.set(identifier, bucket);

  return {
    allowed: true,
    limit,
    remaining: limit - bucket.hits.length,
    resetAt: now + windowMs,
    headers: {
      "x-ratelimit-limit": String(limit),
      "x-ratelimit-remaining": String(limit - bucket.hits.length),
      "x-ratelimit-reset": String(Math.ceil(windowMs / 1000)),
    },
  };
}

/** Best-effort client identifier (IP from proxy headers, fallback to "anonymous"). */
export function clientId(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "anonymous";
}
