import { jsonOk, notFound, optionsHandler } from "@/lib/api/http";
import { getCourse } from "@/services/knowledge/content";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

/** GET /api/courses/[slug] — course, prerequisites, modules and lessons. */
export async function GET(_request: Request, context: Context) {
  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug).trim();
  const course = await getCourse(decoded);
  if (!course) return notFound(`course '${decoded}'`);
  return jsonOk(course, {
    meta: {
      modules: course.modules.length,
      lessons: course.lessonCount,
      estimatedMinutes: course.estimatedMinutes,
    },
  });
}

export const OPTIONS = optionsHandler;
