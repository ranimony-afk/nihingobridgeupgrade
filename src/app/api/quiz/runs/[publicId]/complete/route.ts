import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, notFound, optionsHandler, withHeaders } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validate";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { ensureLearner } from "@/services/learning/session";
import { finalizeRun, RunError } from "@/services/quiz/run-engine";

export const dynamic = "force-dynamic";

const completeBody = z
  .object({
    /** Advisory only: the server clocks the run from `started_at`. */
    durationSeconds: z.coerce.number().int().min(0).max(7200).nullish(),
  })
  .default({});

/**
 * POST /api/quiz/runs/{publicId}/complete — finalise and score a run.
 *
 * Section gates, skill breakdown and the pass decision are computed on the
 * server from stored items. Unanswered items score zero.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> },
) {
  const limiter = rateLimit(`quiz:complete:${clientId(request)}`, { limit: 120 });
  if (!limiter.allowed) {
    return withHeaders(jsonError(429, "rate_limited", "Too many requests"), limiter.headers);
  }

  const parsed = await parseJsonBody(request, completeBody);
  if (!parsed.ok) return withHeaders(parsed.response, limiter.headers);

  const session = await ensureLearner();
  if (!session) {
    return withHeaders(
      jsonError(503, "quiz_unavailable", "Run storage is not provisioned"),
      limiter.headers,
    );
  }

  const { publicId } = await context.params;
  try {
    const detail = await finalizeRun({
      publicId,
      userId: session.learner.id,
      durationSeconds: parsed.data.durationSeconds ?? null,
    });
    if (!detail) return withHeaders(notFound("Run"), limiter.headers);

    return withHeaders(
      jsonOk(detail, {
        cacheSeconds: 0,
        staleSeconds: 0,
        meta: {
          status: "completed",
          percent: detail.run.percent,
          passed: detail.run.passed,
        },
      }),
      limiter.headers,
    );
  } catch (error) {
    if (error instanceof RunError) {
      const status = error.code === "not_found" ? 404 : 409;
      return withHeaders(jsonError(status, error.code, error.message), limiter.headers);
    }
    return withHeaders(jsonError(500, "complete_failed", "Could not finish the run"), limiter.headers);
  }
}

export const OPTIONS = optionsHandler;
