import { db } from "@/db";
import { translations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/translations?entityType=page&entityId=1&locale=ja
 * POST /api/v1/translations  { entityType, entityId, locale, field, value }
 *
 * The unique index on (entityType, entityId, locale, field) is enforced —
 * we upsert on conflict so authors can safely re-save translations.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType");
    const entityIdRaw = url.searchParams.get("entityId");
    const locale = url.searchParams.get("locale");

    const filters = [] as ReturnType<typeof eq>[];
    if (entityType) filters.push(eq(translations.entityType, entityType));
    if (entityIdRaw) {
      const entityId = Number(entityIdRaw);
      if (!Number.isFinite(entityId)) return fail("invalid entityId", 400, "BAD_REQUEST");
      filters.push(eq(translations.entityId, entityId));
    }
    if (locale) filters.push(eq(translations.locale, locale));

    const rows = filters.length
      ? await db.select().from(translations).where(and(...filters))
      : await db.select().from(translations);
    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      entityType?: string;
      entityId?: number;
      locale?: string;
      field?: string;
      value?: string;
    };
    if (!body.entityType || !body.entityId || !body.locale || !body.field || body.value == null) {
      return fail("entityType, entityId, locale, field, value are required", 400, "BAD_REQUEST");
    }

    // Manual upsert (portable across pg versions).
    const existing = await db
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.entityType, body.entityType),
          eq(translations.entityId, body.entityId),
          eq(translations.locale, body.locale),
          eq(translations.field, body.field),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const updated = await db
        .update(translations)
        .set({ value: body.value })
        .where(eq(translations.id, existing[0].id))
        .returning();
      return ok(updated[0]);
    }

    const inserted = await db
      .insert(translations)
      .values({
        entityType: body.entityType,
        entityId: body.entityId,
        locale: body.locale,
        field: body.field,
        value: body.value,
      })
      .returning();
    return ok(inserted[0], { status: 201 });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
