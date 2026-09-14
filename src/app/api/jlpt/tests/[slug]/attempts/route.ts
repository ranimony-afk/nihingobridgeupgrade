import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, optionsHandler, withHeaders } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validate";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { attachLearnerCookie, ensureLearner } from "@/services/learning/session";
import { startAttempt } from "@/services/jlpt/tests";
import { RunError } from "@/services/quiz/run-engine";

export const dynamic = "force-dynamic";

const attemptBody = z
  .object({
    /** Omit for a randomly seeded attempt; supply one to reproduce an attempt. */
    seed: z.coerce.number().int().min(0).nullish(),
  })
  .default({});

/**
 * POST /api/jlpt/tests/{slug}/attempts — start a timed JLPT attempt.
 *
 * The blueprint only declares structure; the questions are sampled from the
 * canonical bank at this moment and the item order is frozen with the run.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const limiter = rateLimit(`jlpt:start:${clientId(request)}`, { limit: 30 });
  if (!limiter.allowed) {
    return withHeaders(jsonError(429, "rate_limited", "Too many attempts started"), limiter.headers);
  }

  const parsed = await parseJsonBody(request, attemptBody);
  if (!parsed.ok) return withHeaders(parsed.response, limiter.headers);

  const session = await ensureLearner();
  if (!session) {
    return withHeaders(
      jsonError(503, "jlpt_unavailable", "Assessment storage is not provisioned"),
      limiter.headers,
    );
  }

  const { slug } = await context.params;
  try {
    const detail = await startAttempt({
      userId: session.learner.id,
      slug,
      seed: parsed.data.seed ?? null,
    });

    const response = withHeaders(
      jsonOk(
        detail,
        {
          cacheSeconds: 0,
          staleSeconds: 0,
          meta: {
            attempt: detail.run.publicId,
            kind: "jlpt",
            sections: detail.run.sections.length,
            timeLimitSeconds: detail.run.timeLimitSeconds,
            grading: "server-side",
          },
        },
      ),
      limiter.headers,
    );
    return attachLearnerCookie(response, session.setCookie) as typeof response;
  } catch (error) {
    if (error instanceof RunError) {
      const status =
        error.code === "not_found" ? 404 : error.code === "unavailable" ? 422 : 400;
      return withHeaders(jsonError(status, error.code, error.message), limiter.headers);
    }
    return withHeaders(
      jsonError(500, "attempt_failed", "Could not start the attempt"),
      limiter.headers,
    );
  }
}

export const OPTIONS = optionsHandler;
