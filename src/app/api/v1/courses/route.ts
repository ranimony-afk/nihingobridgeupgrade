import { db } from "@/db";
import { brands, courses } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail, isEditorialStatus } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/courses?brand=ascend&locale=en&status=published
 * All filters optional. Default status = published (safe for public consumers).
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const brandSlug = url.searchParams.get("brand");
    const locale = url.searchParams.get("locale");
    const statusParam = url.searchParams.get("status") ?? "published";
    const status = isEditorialStatus(statusParam) ? statusParam : "published";

    const filters = [eq(courses.status, status)];

    if (brandSlug) {
      const brandRow = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.slug, brandSlug))
        .limit(1);
      if (brandRow.length === 0) return ok([]);
      filters.push(eq(courses.brandId, brandRow[0].id));
    }
    if (locale) filters.push(eq(courses.locale, locale));

    const rows = await db
      .select()
      .from(courses)
      .where(and(...filters));

    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
