import type { NextRequest } from "next/server";

import { jsonOk, notFound, optionsHandler, withHeaders } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { readLearner } from "@/services/learning/session";
import { getTest, listAttempts } from "@/services/jlpt/tests";

export const dynamic = "force-dynamic";

/**
 * GET /api/jlpt/tests/{slug} — one blueprint (sections, limits, pass marks)
 * plus the caller's attempt history for it.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const limiter = rateLimit(`jlpt:test:${clientId(request)}`, { limit: 120 });
  if (!limiter.allowed) {
    return withHeaders(jsonOk({}, { meta: { rateLimited: true } }), limiter.headers);
  }

  const { slug } = await context.params;
  const test = await getTest(slug);
  if (!test) return withHeaders(notFound("JLPT test"), limiter.headers);

  const learner = await readLearner();
  const attempts = learner
    ? (await listAttempts(learner.id, { limit: 10 })).filter((attempt) => attempt.testSlug === slug)
    : [];

  return withHeaders(
    jsonOk(
      { test, attempts },
      {
        cacheSeconds: 60,
        staleSeconds: 120,
        meta: { level: test.levelLabel, sections: test.sections.length, attempts: attempts.length },
      },
    ),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
