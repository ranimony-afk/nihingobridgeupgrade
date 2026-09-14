import { jsonError, jsonOk, optionsHandler } from "@/lib/api/http";
import { attachLearnerCookie, ensureLearner } from "@/services/learning/session";
import { getDashboard } from "@/services/learning/progress";

export const dynamic = "force-dynamic";

/** GET /api/progress — learner dashboard (creates an anonymous learner). */
export async function GET() {
  const session = await ensureLearner();
  if (!session) return jsonError(503, "progress_unavailable", "Progress storage is not provisioned");

  const dashboard = await getDashboard(session.learner.id);
  const response = jsonOk(
    { learner: { publicId: session.learner.publicId, anonymous: session.learner.isAnonymous }, ...dashboard },
    { cacheSeconds: 0, staleSeconds: 0, meta: { persisted: true } },
  );
  return attachLearnerCookie(response, session.setCookie) as typeof response;
}

export const OPTIONS = optionsHandler;
