import { db } from "@/db";
import { translations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/translations/side-by-side?entityType=brand&entityId=1&sourceLocale=en&targetLocale=ta
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType") ?? "brand";
    const entityIdRaw = url.searchParams.get("entityId");
    const sourceLocale = url.searchParams.get("sourceLocale") ?? "en";
    const targetLocale = url.searchParams.get("targetLocale") ?? "ta";

    if (!entityIdRaw) return fail("entityId is required", 400, "BAD_REQUEST");
    const entityId = Number(entityIdRaw);

    const sourceRows = await db
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.entityType, entityType),
          eq(translations.entityId, entityId),
          eq(translations.locale, sourceLocale),
        ),
      );

    const targetRows = await db
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.entityType, entityType),
          eq(translations.entityId, entityId),
          eq(translations.locale, targetLocale),
        ),
      );

    const targetMap = new Map(targetRows.map((r) => [r.field, r.value]));

    const comparison = sourceRows.map((src) => ({
      field: src.field,
      sourceLocale,
      sourceValue: src.value,
      targetLocale,
      targetValue: targetMap.get(src.field) ?? null,
      isTranslated: targetMap.has(src.field),
    }));

    return ok(comparison);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
