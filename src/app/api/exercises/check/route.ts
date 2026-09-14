import type { NextRequest } from "next/server";
import { z } from "zod";

import { badRequest, jsonError, jsonOk, optionsHandler, withHeaders } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validate";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { gradeAnswers } from "@/services/learning/exercise-engine";

export const dynamic = "force-dynamic";

const checkBody = z.object({
  answers: z
    .array(
      z.object({
        exerciseId: z.coerce.number().int().positive(),
        optionId: z.coerce.number().int().positive().nullish(),
        value: z.string().max(200).nullish(),
      }),
    )
    .min(1)
    .max(50),
});

/**
 * POST /api/exercises/check
 *
 * Grades one or more answers. This is the only place correctness is computed,
 * so a client cannot self-report a score.
 */
export async function POST(request: NextRequest) {
  const limiter = rateLimit(`exercise:check:${clientId(request)}`, { limit: 300 });
  if (!limiter.allowed) {
    return withHeaders(jsonError(429, "rate_limited", "Too many grading requests"), limiter.headers);
  }

  const parsed = await parseJsonBody(request, checkBody);
  if (!parsed.ok) return withHeaders(parsed.response, limiter.headers);

  const grades = await gradeAnswers(parsed.data.answers);
  if (grades.length === 0) {
    return withHeaders(badRequest("No known exercises were submitted"), limiter.headers);
  }

  return withHeaders(
    jsonOk(
      { grades },
      {
        meta: {
          graded: grades.length,
          correct: grades.filter((grade) => grade.correct).length,
        },
        cacheSeconds: 0,
        staleSeconds: 0,
      },
    ),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
