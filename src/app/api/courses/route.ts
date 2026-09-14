import { jsonOk, optionsHandler } from "@/lib/api/http";
import { getCourseCatalog } from "@/services/knowledge/content";

export const dynamic = "force-dynamic";

/** GET /api/courses — published canonical course catalogue. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const jlptRaw = url.searchParams.get("jlpt");
  const jlptParam = jlptRaw ? Number(jlptRaw) : null;
  const difficulty = url.searchParams.get("difficulty")?.trim() || null;
  const courses = await getCourseCatalog();
  const filtered = courses.filter(
    (course) =>
      (jlptParam === null || !Number.isInteger(jlptParam) || course.jlptLevel === jlptParam) &&
      (!difficulty || course.difficulty === difficulty),
  );
  return jsonOk(
    { courses: filtered },
    { meta: { total: filtered.length, published: true } },
  );
}

export const OPTIONS = optionsHandler;
