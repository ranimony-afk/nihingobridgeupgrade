import type { NextRequest } from "next/server";

import { jsonOk, optionsHandler, withHeaders } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { getRunStats } from "@/services/quiz/run-engine";

export const dynamic = "force-dynamic";

/** GET /api/quiz/stats — platform-wide run analytics (no personal data). */
export async function GET(request: NextRequest) {
  const limiter = rateLimit(`quiz:stats:${clientId(request)}`, { limit: 120 });
  if (!limiter.allowed) {
    return withHeaders(
      withHeaders(jsonOk({}), { "x-rate-limit": "exceeded" }),
      limiter.headers,
    );
  }
  const stats = await getRunStats();
  return withHeaders(
    jsonOk(stats, { cacheSeconds: 30, staleSeconds: 60, meta: { scope: "platform" } }),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
