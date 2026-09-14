import type { NextRequest } from "next/server";

import { jsonOk, optionsHandler, withHeaders } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { getJlptStats } from "@/services/jlpt/tests";

export const dynamic = "force-dynamic";

/** GET /api/jlpt/stats — blueprint coverage and attempt analytics. */
export async function GET(request: NextRequest) {
  const limiter = rateLimit(`jlpt:stats:${clientId(request)}`, { limit: 120 });
  if (!limiter.allowed) {
    return withHeaders(jsonOk({}, { meta: { rateLimited: true } }), limiter.headers);
  }
  const stats = await getJlptStats();
  return withHeaders(
    jsonOk(stats, { cacheSeconds: 30, staleSeconds: 60, meta: { scope: "platform" } }),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
