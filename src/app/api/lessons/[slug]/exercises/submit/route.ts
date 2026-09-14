import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, notFound, optionsHandler, withHeaders } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validate";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { submitLessonExercises } from "@/services/learning/exercise-engine";
import { recordExerciseResult } from "@/services/learning/progress";
import { attachLearnerCookie, ensureLearner } from "@/services/learning/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

const submitBody = z.object({
  answers: z
    .array(
      z.object({
        exerciseId: z.coerce.number().int().positive(),
        optionId: z.coerce.number().int().positive().nullish(),
        value: z.string().max(200).nullish(),
      }),
    )
    .max(50)
    .default([]),
});

/**
 * POST /api/lessons/[slug]/exercises/submit
 *
 * Grades the set server-side, then persists the attempt and refreshes lesson
 * and course progress for the current learner. The score written to progress is
 * always the server's, never a client-reported value.
 */
export async function POST(request: NextRequest, context: Context) {
  const limiter = rateLimit(`exercise:submit:${clientId(request)}`, { limit: 120 });
  if (!limiter.allowed) {
    return withHeaders(jsonError(429, "rate_limited", "Too many submissions"), limiter.headers);
  }

  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug).trim();

  const parsed = await parseJsonBody(request, submitBody);
  if (!parsed.ok) return withHeaders(parsed.response, limiter.headers);

  const result = await submitLessonExercises(decoded, parsed.data.answers);
  if (!result) return withHeaders(notFound(`lesson '${decoded}'`), limiter.headers);

  const session = await ensureLearner();
  let progress = null;
  if (session) {
    progress = await recordExerciseResult(
      session.learner.id,
      decoded,
      result.grades,
      parsed.data.answers,
      { score: result.score, percent: result.percent },
    );
  }

  const response = withHeaders(
    jsonOk(
      { ...result, progress },
      {
        meta: { persisted: Boolean(progress), learner: session?.learner.publicId ?? null },
        cacheSeconds: 0,
        staleSeconds: 0,
      },
    ),
    limiter.headers,
  );
  return attachLearnerCookie(response, session?.setCookie ?? null) as typeof response;
}

export const OPTIONS = optionsHandler;
