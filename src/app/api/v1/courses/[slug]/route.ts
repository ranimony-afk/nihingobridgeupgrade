import { db } from "@/db";
import { brands, courses, modules, lessons } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/courses/[slug]?brand=ascend&locale=en
 * Returns the course with its modules + lessons pre-joined for LMS clients.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureSeed();
    const { slug } = await ctx.params;
    const url = new URL(req.url);
    const brandSlug = url.searchParams.get("brand");
    const locale = url.searchParams.get("locale") ?? "en";

    if (!brandSlug) return fail("brand query param required", 400, "BAD_REQUEST");

    const brandRow = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.slug, brandSlug))
      .limit(1);
    if (brandRow.length === 0) return fail("brand not found", 404, "NOT_FOUND");

    const courseRows = await db
      .select()
      .from(courses)
      .where(
        and(
          eq(courses.brandId, brandRow[0].id),
          eq(courses.slug, slug),
          eq(courses.locale, locale),
        ),
      )
      .limit(1);

    if (courseRows.length === 0) return fail("course not found", 404, "NOT_FOUND");
    const course = courseRows[0];

    const modRows = await db
      .select()
      .from(modules)
      .where(eq(modules.courseId, course.id))
      .orderBy(asc(modules.position));

    const modulesWithLessons = await Promise.all(
      modRows.map(async (m) => {
        const lessonRows = await db
          .select()
          .from(lessons)
          .where(eq(lessons.moduleId, m.id))
          .orderBy(asc(lessons.position));
        return { ...m, lessons: lessonRows };
      }),
    );

    return ok({ ...course, modules: modulesWithLessons });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
