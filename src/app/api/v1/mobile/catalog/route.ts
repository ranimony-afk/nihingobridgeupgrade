import { db } from "@/db";
import { courses, nihongoLearningItems, nihongoQuizzes, brands } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";
import { parsePagination, buildPaginatedEnvelope } from "@/shared/mobile";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mobile/catalog?brand=nihongo&type=vocabulary&jlptLevel=N5&page=1&limit=10
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const brandSlug = url.searchParams.get("brand") ?? "nihongo";
    const type = url.searchParams.get("type") ?? "courses";
    const jlptLevel = url.searchParams.get("jlptLevel");
    const { page, limit, offset } = parsePagination(url);

    if (type === "vocabulary" || type === "kanji" || type === "grammar") {
      const filters = [eq(nihongoLearningItems.category, type)];
      if (jlptLevel) filters.push(eq(nihongoLearningItems.jlptLevel, jlptLevel));

      const allRows = await db.select().from(nihongoLearningItems).where(and(...filters));
      const paged = allRows.slice(offset, offset + limit);
      const envelope = buildPaginatedEnvelope(paged, allRows.length, page, limit);

      return Response.json(envelope, {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300",
          ETag: `"mobile-vocab-${allRows.length}-${page}"`,
        },
      });
    }

    if (type === "quizzes") {
      const allRows = await db.select().from(nihongoQuizzes);
      const paged = allRows.slice(offset, offset + limit);
      const envelope = buildPaginatedEnvelope(paged, allRows.length, page, limit);
      return Response.json(envelope);
    }

    // Default: courses
    const brandRow = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.slug, brandSlug))
      .limit(1);

    const brandId = brandRow[0]?.id;
    const allCourses = brandId
      ? await db.select().from(courses).where(eq(courses.brandId, brandId))
      : await db.select().from(courses);

    const paged = allCourses.slice(offset, offset + limit);
    const envelope = buildPaginatedEnvelope(paged, allCourses.length, page, limit);

    return Response.json(envelope, {
      headers: {
        "Cache-Control": "public, max-age=120",
      },
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
