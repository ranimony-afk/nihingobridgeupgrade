import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, optionsHandler, withHeaders } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validate";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { attachLearnerCookie, ensureLearner } from "@/services/learning/session";
import { getRunHistory, getRunStats, startRun, RunError } from "@/services/quiz/run-engine";

export const dynamic = "force-dynamic";

const SKILLS = ["grammar", "kanji", "vocabulary", "reading"] as const;
const KINDS = ["multiple_choice", "cloze", "reading", "meaning"] as const;

const startBody = z.object({
  kind: z.enum(["quiz"]).default("quiz"),
  title: z.string().trim().min(1).max(120).optional(),
  jlpt: z.coerce.number().int().min(1).max(5).nullish(),
  skills: z.array(z.enum(SKILLS)).max(4).optional(),
  kinds: z.array(z.enum(KINDS)).max(4).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  seed: z.coerce.number().int().min(0).nullish(),
  /** null = untimed practice */
  timeLimitSeconds: z.coerce.number().int().min(30).max(7200).nullish(),
});

const listQuery = z.object({
  kind: z.enum(["quiz", "jlpt"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * GET /api/quiz/runs — the learner's run history.
 *
 * Runs are owned by the signed learner cookie; no id is ever enumerable across
 * learners.
 */
export async function GET(request: NextRequest) {
  const limiter = rateLimit(`quiz:runs:${clientId(request)}`, { limit: 240 });
  if (!limiter.allowed) {
    return withHeaders(jsonError(429, "rate_limited", "Too many requests"), limiter.headers);
  }

  const params = new URL(request.url).searchParams;
  const parsed = listQuery.safeParse({
    kind: params.get("kind") ?? undefined,
    limit: params.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return withHeaders(jsonError(400, "invalid_request", "Invalid query parameters"), limiter.headers);
  }

  const session = await ensureLearner();
  if (!session) {
    return withHeaders(
      jsonError(503, "quiz_unavailable", "Run storage is not provisioned"),
      limiter.headers,
    );
  }

  const runs = await getRunHistory(session.learner.id, {
    kind: parsed.data.kind ?? null,
    limit: parsed.data.limit,
  });
  const stats = await getRunStats();

  const response = withHeaders(
    jsonOk(
      { runs, stats },
      { cacheSeconds: 0, staleSeconds: 0, meta: { returned: runs.length } },
    ),
    limiter.headers,
  );
  return attachLearnerCookie(response, session.setCookie) as typeof response;
}

/**
 * POST /api/quiz/runs — start a quiz.
 *
 * The server samples the bank with a seed, freezes the order and the clock, and
 * returns public questions only. No answer key ever leaves the server.
 */
export async function POST(request: NextRequest) {
  const limiter = rateLimit(`quiz:start:${clientId(request)}`, { limit: 60 });
  if (!limiter.allowed) {
    return withHeaders(jsonError(429, "rate_limited", "Too many runs started"), limiter.headers);
  }

  const parsed = await parseJsonBody(request, startBody);
  if (!parsed.ok) return withHeaders(parsed.response, limiter.headers);

  const session = await ensureLearner();
  if (!session) {
    return withHeaders(
      jsonError(503, "quiz_unavailable", "Run storage is not provisioned"),
      limiter.headers,
    );
  }

  try {
    const detail = await startRun({
      userId: session.learner.id,
      kind: "quiz",
      title: parsed.data.title,
      jlptLevel: parsed.data.jlpt ?? null,
      skills: parsed.data.skills ?? [],
      kinds: parsed.data.kinds ?? [],
      limit: parsed.data.limit,
      seed: parsed.data.seed ?? null,
      timeLimitSeconds: parsed.data.timeLimitSeconds ?? null,
    });

    const response = withHeaders(
      jsonOk(
        detail,
        {
          cacheSeconds: 0,
          staleSeconds: 0,
          meta: { started: detail.items.length, grading: "server-side" },
        },
      ),
      limiter.headers,
    );
    return attachLearnerCookie(response, session.setCookie) as typeof response;
  } catch (error) {
    if (error instanceof RunError) {
      const status = error.code === "empty_bank" ? 422 : 400;
      return withHeaders(
        jsonError(status, error.code, error.message),
        limiter.headers,
      );
    }
    return withHeaders(jsonError(500, "quiz_failed", "Could not start the quiz"), limiter.headers);
  }
}

export const OPTIONS = optionsHandler;
