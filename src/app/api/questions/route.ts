import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, optionsHandler, withHeaders } from "@/lib/api/http";
import { parseQuery } from "@/lib/api/validate";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { getQuestions } from "@/services/questions/engine";
import type { QuestionKind, QuestionSkill } from "@/types/question";

export const dynamic = "force-dynamic";

const SKILLS = ["grammar", "kanji", "vocabulary", "reading"] as const;
const KINDS = ["multiple_choice", "cloze", "reading", "meaning"] as const;

const querySchema = z.object({
  skills: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter((part): part is QuestionSkill => (SKILLS as readonly string[]).includes(part)),
    ),
  kinds: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter((part): part is QuestionKind => (KINDS as readonly string[]).includes(part)),
    ),
  jlpt: z.coerce.number().int().min(1).max(5).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  seed: z.coerce.number().int().optional(),
});

/**
 * GET /api/questions?skills=kanji,grammar&jlpt=5&limit=20&seed=42
 *
 * Samples the canonical question bank. Correct answers are never included;
 * grading is only available through POST /api/questions/check.
 */
export async function GET(request: NextRequest) {
  const limiter = rateLimit(`questions:list:${clientId(request)}`, { limit: 240 });
  if (!limiter.allowed) {
    return withHeaders(jsonError(429, "rate_limited", "Too many requests"), limiter.headers);
  }

  const parsed = parseQuery(new URL(request.url).searchParams, querySchema);
  if (!parsed.ok) return withHeaders(parsed.response, limiter.headers);

  const set = await getQuestions({
    skills: parsed.data.skills,
    kinds: parsed.data.kinds,
    jlptLevel: parsed.data.jlpt ?? null,
    limit: parsed.data.limit,
    seed: parsed.data.seed ?? null,
  });

  return withHeaders(
    jsonOk(set, {
      meta: {
        returned: set.questions.length,
        matching: set.total,
        grading: "server-side",
        seeded: parsed.data.seed != null,
      },
      cacheSeconds: 0,
      staleSeconds: 0,
    }),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
