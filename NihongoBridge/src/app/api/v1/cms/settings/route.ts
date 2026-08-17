import { db } from "@/db";
import { brands, brandSettings, auditLogs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/cms/settings?brand=ascend&category=navigation
 * POST /api/v1/cms/settings { brand, category, data }
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const brandSlug = url.searchParams.get("brand");
    const category = url.searchParams.get("category");

    const filters = [] as ReturnType<typeof eq>[];
    if (brandSlug) {
      const brandRow = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.slug, brandSlug))
        .limit(1);
      if (brandRow.length === 0) return ok([]);
      filters.push(eq(brandSettings.brandId, brandRow[0].id));
    }
    if (category) {
      filters.push(eq(brandSettings.category, category));
    }

    const rows = filters.length
      ? await db.select().from(brandSettings).where(and(...filters))
      : await db.select().from(brandSettings);
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
      category: string;
      data: Record<string, unknown>;
    };
    if (!body.brand || !body.category || !body.data) {
      return fail("brand, category, data required", 400, "BAD_REQUEST");
    }

    const brandRow = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.slug, body.brand))
      .limit(1);
    if (brandRow.length === 0) return fail("brand not found", 404, "NOT_FOUND");
    const brandId = brandRow[0].id;

    const existing = await db
      .select()
      .from(brandSettings)
      .where(and(eq(brandSettings.brandId, brandId), eq(brandSettings.category, body.category)))
      .limit(1);

    let settingRecord;
    if (existing.length > 0) {
      const updated = await db
        .update(brandSettings)
        .set({ data: body.data, updatedAt: new Date() })
        .where(eq(brandSettings.id, existing[0].id))
        .returning();
      settingRecord = updated[0];
    } else {
      const inserted = await db
        .insert(brandSettings)
        .values({ brandId, category: body.category, data: body.data })
        .returning();
      settingRecord = inserted[0];
    }

    await db.insert(auditLogs).values({
      action: "update_settings",
      entityType: "setting",
      entityId: settingRecord.id,
      details: { category: body.category },
    });

    return ok(settingRecord);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
