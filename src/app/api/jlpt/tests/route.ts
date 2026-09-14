import type { NextRequest } from "next/server";

import { jsonOk, optionsHandler, withHeaders } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { listPublishedTests } from "@/services/jlpt/tests";

export const dynamic = "force-dynamic";

/** GET /api/jlpt/tests — published blueprints with live bank availability. */
export async function GET(request: NextRequest) {
  const limiter = rateLimit(`jlpt:tests:${clientId(request)}`, { limit: 120 });
  if (!limiter.allowed) {
    return withHeaders(jsonOk({ tests: [] }, { meta: { rateLimited: true } }), limiter.headers);
  }

  const tests = await listPublishedTests();
  return withHeaders(
    jsonOk(
      { tests },
      {
        cacheSeconds: 60,
        staleSeconds: 120,
        meta: {
          returned: tests.length,
          levels: tests.map((test) => test.levelLabel).join(","),
        },
      },
    ),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
