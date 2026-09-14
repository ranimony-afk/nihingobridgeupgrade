import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, optionsHandler, withHeaders } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validate";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { ensureLearner } from "@/services/learning/session";
import { answerRunItem, RunError } from "@/services/quiz/run-engine";

export const dynamic = "force-dynamic";

const answerBody = z.object({
  position: z.coerce.number().int().min(1).max(500),
  optionId: z.coerce.number().int().positive().nullish(),
  value: z.string().max(200).nullish(),
  elapsedMs: z.coerce.number().int().min(0).max(3_600_000).nullish(),
});

/**
 * POST /api/quiz/runs/{publicId}/answers — submit one answer.
 *
 * Grading happens server-side through the shared question engine; any score the
 * client sends is ignored. An item can only be answered once.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> },
) {
  const limiter = rateLimit(`quiz:answer:${clientId(request)}`, { limit: 600 });
  if (!limiter.allowed) {
    return withHeaders(jsonError(429, "rate_limited", "Too many submissions"), limiter.headers);
  }

  const parsed = await parseJsonBody(request, answerBody);
  if (!parsed.ok) return withHeaders(parsed.response, limiter.headers);

  const session = await ensureLearner();
  if (!session) {
    return withHeaders(
      jsonError(503, "quiz_unavailable", "Run storage is not provisioned"),
      limiter.headers,
    );
  }

  const { publicId } = await context.params;
  const submittedAt = Date.now();

  try {
    const result = await answerRunItem({
      publicId,
      userId: session.learner.id,
      position: parsed.data.position,
      optionId: parsed.data.optionId ?? null,
      value: parsed.data.value ?? null,
      elapsedMs: parsed.data.elapsedMs ?? null,
    });

    return withHeaders(
      jsonOk(result, {
        cacheSeconds: 0,
        staleSeconds: 0,
        meta: { graded: 1, tookMs: Date.now() - submittedAt, grading: "server-side" },
      }),
      limiter.headers,
    );
  } catch (error) {
    if (error instanceof RunError) {
      const status =
        error.code === "not_found" ? 404 : error.code === "expired" ? 410 : 409;
      return withHeaders(jsonError(status, error.code, error.message), limiter.headers);
    }
    return withHeaders(jsonError(500, "answer_failed", "Could not grade the answer"), limiter.headers);
  }
}

export const OPTIONS = optionsHandler;
