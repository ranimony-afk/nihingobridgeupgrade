import { jsonOk, notFound, optionsHandler } from "@/lib/api/http";
import { getLessonExercises } from "@/services/learning/exercise-engine";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

/**
 * GET /api/lessons/[slug]/exercises
 *
 * Returns the exercise set **without** correct answers. Grading is only
 * available through POST /api/exercises/check.
 */
export async function GET(_request: Request, context: Context) {
  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug).trim();
  const set = await getLessonExercises(decoded);
  if (!set) return notFound(`lesson '${decoded}'`);

  return jsonOk(set, {
    meta: {
      total: set.exercises.length,
      totalPoints: set.totalPoints,
      grading: "server-side",
    },
    cacheSeconds: 30,
    staleSeconds: 120,
  });
}

export const OPTIONS = optionsHandler;
