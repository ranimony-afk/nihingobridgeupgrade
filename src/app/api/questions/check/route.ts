import type { NextRequest } from "next/server";
import { z } from "zod";

import { badRequest, jsonError, jsonOk, optionsHandler, withHeaders } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validate";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { gradeQuestions, scoreGrades } from "@/services/questions/engine";

export const dynamic = "force-dynamic";

const checkBody = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.coerce.number().int().positive(),
        optionId: z.coerce.number().int().positive().nullish(),
        value: z.string().max(200).nullish(),
      }),
    )
    .min(1)
    .max(100),
});

/**
 * POST /api/questions/check
 *
 * The single grading endpoint for the question bank. Any score the client sends
 * is ignored: correctness is computed from the server-side answer key.
 */
export async function POST(request: NextRequest) {
  const limiter = rateLimit(`questions:check:${clientId(request)}`, { limit: 300 });
  if (!limiter.allowed) {
    return withHeaders(jsonError(429, "rate_limited", "Too many grading requests"), limiter.headers);
  }

  const parsed = await parseJsonBody(request, checkBody);
  if (!parsed.ok) return withHeaders(parsed.response, limiter.headers);

  const grades = await gradeQuestions(parsed.data.answers);
  if (grades.length === 0) {
    return withHeaders(badRequest("No known questions were submitted"), limiter.headers);
  }

  return withHeaders(
    jsonOk(
      { grades, ...scoreGrades(grades) },
      { meta: { graded: grades.length }, cacheSeconds: 0, staleSeconds: 0 },
    ),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
