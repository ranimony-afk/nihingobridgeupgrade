import type { NextRequest } from "next/server";

import { jsonError, jsonOk, notFound, optionsHandler, withHeaders } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { ensureLearner } from "@/services/learning/session";
import { getRun } from "@/services/quiz/run-engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/quiz/runs/{publicId} — one run with its public questions.
 *
 * Answer keys are only present for items the learner has already answered, and
 * only for the run's owner.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> },
) {
  const limiter = rateLimit(`quiz:run:${clientId(request)}`, { limit: 240 });
  if (!limiter.allowed) {
    return withHeaders(jsonError(429, "rate_limited", "Too many requests"), limiter.headers);
  }

  const session = await ensureLearner();
  if (!session) {
    return withHeaders(
      jsonError(503, "quiz_unavailable", "Run storage is not provisioned"),
      limiter.headers,
    );
  }

  const { publicId } = await context.params;
  const detail = await getRun(publicId, session.learner.id);
  if (!detail) return withHeaders(notFound("Run"), limiter.headers);

  return withHeaders(
    jsonOk(detail, {
      cacheSeconds: 0,
      staleSeconds: 0,
      meta: {
        kind: detail.run.kind,
        status: detail.run.status,
        answered: detail.run.answeredCount,
        remaining: detail.run.questionCount - detail.run.answeredCount,
      },
    }),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
