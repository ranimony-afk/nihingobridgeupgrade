import { jsonError, jsonOk, notFound, optionsHandler } from "@/lib/api/http";
import { attachLearnerCookie, ensureLearner } from "@/services/learning/session";
import { getCourseProgress } from "@/services/learning/progress";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

/** GET /api/progress/course/[slug] — course rollup for this learner. */
export async function GET(_request: Request, context: Context) {
  const { slug } = await context.params;
  const session = await ensureLearner();
  if (!session) return jsonError(503, "progress_unavailable", "Progress storage is not provisioned");

  const decoded = decodeURIComponent(slug).trim();
  const progress = await getCourseProgress(session.learner.id, decoded);
  const response = jsonOk(
    progress ?? {
      courseSlug: decoded,
      courseTitle: null,
      lessonsCompleted: 0,
      lessonsTotal: 0,
      percent: 0,
      status: "not_started",
      updatedAt: null,
    },
    { cacheSeconds: 0, staleSeconds: 0 },
  );
  return attachLearnerCookie(response, session.setCookie) as typeof response;
}

export const OPTIONS = optionsHandler;
