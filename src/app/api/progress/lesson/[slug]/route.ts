import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, notFound, optionsHandler } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validate";
import { attachLearnerCookie, ensureLearner } from "@/services/learning/session";
import { getLessonProgress, markSectionComplete } from "@/services/learning/progress";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

const sectionBody = z.object({
  sectionKey: z.string().trim().min(1).max(64),
});

/** GET /api/progress/lesson/[slug] — this learner's lesson progress. */
export async function GET(_request: NextRequest, context: Context) {
  const { slug } = await context.params;
  const session = await ensureLearner();
  if (!session) return jsonError(503, "progress_unavailable", "Progress storage is not provisioned");

  const progress = await getLessonProgress(session.learner.id, decodeURIComponent(slug).trim());
  if (!progress) return notFound(`lesson '${slug}'`);

  const response = jsonOk(progress, { cacheSeconds: 0, staleSeconds: 0 });
  return attachLearnerCookie(response, session.setCookie) as typeof response;
}

/**
 * POST /api/progress/lesson/[slug] — mark one section complete.
 * Section completion is a learner action, so it is safe to accept from the client.
 */
export async function POST(request: NextRequest, context: Context) {
  const { slug } = await context.params;
  const parsed = await parseJsonBody(request, sectionBody);
  if (!parsed.ok) return parsed.response;

  const session = await ensureLearner();
  if (!session) return jsonError(503, "progress_unavailable", "Progress storage is not provisioned");

  const progress = await markSectionComplete(
    session.learner.id,
    decodeURIComponent(slug).trim(),
    parsed.data.sectionKey,
  );
  if (!progress) return notFound(`lesson '${slug}'`);

  const response = jsonOk(progress, { cacheSeconds: 0, staleSeconds: 0, meta: { persisted: true } });
  return attachLearnerCookie(response, session.setCookie) as typeof response;
}

export const OPTIONS = optionsHandler;
