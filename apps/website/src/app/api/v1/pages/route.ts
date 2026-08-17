import { db } from "@/db";
import { brands, pages } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail, isEditorialStatus } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/pages?brand=ascend&locale=en&status=published
 * POST /api/v1/pages  { brand, slug, title, body, locale, status? }
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const brandSlug = url.searchParams.get("brand");
    const locale = url.searchParams.get("locale");
    const statusParam = url.searchParams.get("status") ?? "published";
    const status = isEditorialStatus(statusParam) ? statusParam : "published";

    const filters = [eq(pages.status, status)];
    if (brandSlug) {
      const brandRow = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.slug, brandSlug))
        .limit(1);
      if (brandRow.length === 0) return ok([]);
      filters.push(eq(pages.brandId, brandRow[0].id));
    }
    if (locale) filters.push(eq(pages.locale, locale));

    const rows = await db.select().from(pages).where(and(...filters));
    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    await ensureSeed();
    const body = (await req.json()) as {
      brand?: string;
      slug?: string;
      title?: string;
      body?: string;
      locale?: string;
      status?: string;
    };
    if (!body.brand || !body.slug || !body.title) {
      return fail("brand, slug, title are required", 400, "BAD_REQUEST");
    }
    const brandRow = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.slug, body.brand))
      .limit(1);
    if (brandRow.length === 0) return fail("brand not found", 404, "NOT_FOUND");

    const status = isEditorialStatus(body.status) ? body.status : "draft";

    const inserted = await db
      .insert(pages)
      .values({
        brandId: brandRow[0].id,
        slug: body.slug,
        title: body.title,
        body: body.body ?? "",
        locale: body.locale ?? "en",
        status,
        publishedAt: status === "published" ? new Date() : null,
      })
      .returning();

    return ok(inserted[0], { status: 201 });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
