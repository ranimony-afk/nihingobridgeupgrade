import { db } from "@/db";
import { editorialCalendar, brands } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/workflow/calendar?brand=ascend
 * POST /api/v1/workflow/calendar { brand, entityType, entityId, title, scheduledAt }
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const brandSlug = url.searchParams.get("brand");

    const filters = [] as ReturnType<typeof eq>[];
    if (brandSlug) {
      const brandRow = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.slug, brandSlug))
        .limit(1);
      if (brandRow.length === 0) return ok([]);
      filters.push(eq(editorialCalendar.brandId, brandRow[0].id));
    }

    const rows = filters.length
      ? await db.select().from(editorialCalendar).where(and(...filters)).orderBy(asc(editorialCalendar.scheduledAt))
      : await db.select().from(editorialCalendar).orderBy(asc(editorialCalendar.scheduledAt));

    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    await ensureSeed();
    const body = (await req.json()) as {
      brand: string;
      entityType: string;
      entityId: number;
      title: string;
      scheduledAt: string;
    };
    if (!body.brand || !body.entityType || !body.entityId || !body.title || !body.scheduledAt) {
      return fail("brand, entityType, entityId, title, scheduledAt required", 400, "BAD_REQUEST");
    }

    const brandRow = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.slug, body.brand))
      .limit(1);
    if (brandRow.length === 0) return fail("brand not found", 404, "NOT_FOUND");

    const inserted = await db
      .insert(editorialCalendar)
      .values({
        brandId: brandRow[0].id,
        entityType: body.entityType,
        entityId: body.entityId,
        title: body.title,
        scheduledAt: new Date(body.scheduledAt),
      })
      .returning();

    return ok(inserted[0], { status: 201 });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
