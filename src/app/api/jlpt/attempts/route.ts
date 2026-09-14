import type { NextRequest } from "next/server";

import { jsonError, jsonOk, optionsHandler, withHeaders } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { attachLearnerCookie, ensureLearner } from "@/services/learning/session";
import { getJlptStats, listAttempts } from "@/services/jlpt/tests";

export const dynamic = "force-dynamic";

/** GET /api/jlpt/attempts — the caller's JLPT attempts plus level analytics. */
export async function GET(request: NextRequest) {
  const limiter = rateLimit(`jlpt:attempts:${clientId(request)}`, { limit: 120 });
  if (!limiter.allowed) {
    return withHeaders(jsonError(429, "rate_limited", "Too many requests"), limiter.headers);
  }

  const session = await ensureLearner();
  if (!session) {
    return withHeaders(
      jsonError(503, "jlpt_unavailable", "Assessment storage is not provisioned"),
      limiter.headers,
    );
  }

  const [attempts, stats] = await Promise.all([
    listAttempts(session.learner.id, { limit: 20 }),
    getJlptStats(),
  ]);

  const response = withHeaders(
    jsonOk(
      { attempts, stats },
      { cacheSeconds: 0, staleSeconds: 0, meta: { returned: attempts.length } },
    ),
    limiter.headers,
  );
  return attachLearnerCookie(response, session.setCookie) as typeof response;
}

export const OPTIONS = optionsHandler;
