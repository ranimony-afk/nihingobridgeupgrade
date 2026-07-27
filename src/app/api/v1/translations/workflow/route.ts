import { db } from "@/db";
import { translationWorkflows, translations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/translations/workflow?entityType=brand&entityId=1&targetLocale=ta
 * POST /api/v1/translations/workflow  { entityType, entityId, targetLocale, status, assignedTranslator? }
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType");
    const entityIdRaw = url.searchParams.get("entityId");
    const targetLocale = url.searchParams.get("targetLocale");

    const filters = [] as ReturnType<typeof eq>[];
    if (entityType) filters.push(eq(translationWorkflows.entityType, entityType));
    if (entityIdRaw) filters.push(eq(translationWorkflows.entityId, Number(entityIdRaw)));
    if (targetLocale) filters.push(eq(translationWorkflows.targetLocale, targetLocale));

    const rows = filters.length
      ? await db.select().from(translationWorkflows).where(and(...filters))
      : await db.select().from(translationWorkflows);

    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      entityType: string;
      entityId: number;
      targetLocale: string;
      status?: string;
      assignedTranslator?: string;
    };
    if (!body.entityType || !body.entityId || !body.targetLocale) {
      return fail("entityType, entityId, targetLocale are required", 400, "BAD_REQUEST");
    }

    // Check for missing keys
    const sourceTranslations = await db
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.entityType, body.entityType),
          eq(translations.entityId, body.entityId),
          eq(translations.locale, "en"),
        ),
      );

    const targetTranslations = await db
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.entityType, body.entityType),
          eq(translations.entityId, body.entityId),
          eq(translations.locale, body.targetLocale),
        ),
      );

    const targetKeys = new Set(targetTranslations.map((t) => t.field));
    const missingKeys = sourceTranslations
      .filter((s) => !targetKeys.has(s.field))
      .map((s) => s.field);

    const existing = await db
      .select()
      .from(translationWorkflows)
      .where(
        and(
          eq(translationWorkflows.entityType, body.entityType),
          eq(translationWorkflows.entityId, body.entityId),
          eq(translationWorkflows.targetLocale, body.targetLocale),
        ),
      )
      .limit(1);

    let record;
    if (existing.length > 0) {
      const updated = await db
        .update(translationWorkflows)
        .set({
          status: body.status ?? existing[0].status,
          missingKeys,
          assignedTranslator: body.assignedTranslator ?? existing[0].assignedTranslator,
          updatedAt: new Date(),
        })
        .where(eq(translationWorkflows.id, existing[0].id))
        .returning();
      record = updated[0];
    } else {
      const inserted = await db
        .insert(translationWorkflows)
        .values({
          entityType: body.entityType,
          entityId: body.entityId,
          targetLocale: body.targetLocale,
          status: body.status ?? (missingKeys.length > 0 ? "in_translation" : "approved"),
          missingKeys,
          assignedTranslator: body.assignedTranslator ?? null,
        })
        .returning();
      record = inserted[0];
    }

    return ok(record);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
