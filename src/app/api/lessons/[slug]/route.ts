import { jsonOk, notFound, optionsHandler } from "@/lib/api/http";
import { getLesson } from "@/services/knowledge/content";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

/** GET /api/lessons/[slug] — lesson, module context and knowledge links. */
export async function GET(_request: Request, context: Context) {
  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug).trim();
  const lesson = await getLesson(decoded);
  if (!lesson) return notFound(`lesson '${decoded}'`);
  return jsonOk(lesson, {
    meta: {
      grammarPoints: lesson.knowledge.grammar.length,
      kanji: lesson.knowledge.kanji.length,
    },
  });
}

export const OPTIONS = optionsHandler;
