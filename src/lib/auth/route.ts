import {
  enforceRateLimit,
  getRequestIdentifier,
  rateLimitHeaders,
  type RateLimitPolicy,
  type RateLimitResult,
} from "@/lib/rate-limit";

export async function applyRateLimit(
  request: Request,
  policy: RateLimitPolicy,
): Promise<RateLimitResult | Response> {
  const result = await enforceRateLimit(getRequestIdentifier(request), policy);
  if (result.allowed) return result;

  return Response.json(
    { error: "Too many authentication requests. Please try again shortly.", code: "RATE_LIMITED" },
    { status: 429, headers: rateLimitHeaders(result) },
  );
}

export function rateLimitedJson(
  body: unknown,
  result: RateLimitResult,
  init: ResponseInit = {},
): Response {
  return Response.json(body, {
    ...init,
    headers: {
      ...rateLimitHeaders(result),
      ...(init.headers ?? {}),
    },
  });
}
