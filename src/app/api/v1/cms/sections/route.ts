import { db } from "@/db";
import { brands, contentSections, contentVersions, auditLogs } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/cms/sections?brand=ascend&page=home&locale=en
 * POST /api/v1/cms/sections (CRUD, Draft, Publish, Autosave)
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const brandSlug = url.searchParams.get("brand");
    const pageSlug = url.searchParams.get("page");
    const locale = url.searchParams.get("locale") ?? "en";

    const filters = [eq(contentSections.locale, locale)];

    if (brandSlug) {
      const brandRow = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.slug, brandSlug))
        .limit(1);
      if (brandRow.length === 0) return ok([]);
      filters.push(eq(contentSections.brandId, brandRow[0].id));
    }
    if (pageSlug) {
      filters.push(eq(contentSections.pageSlug, pageSlug));
    }

    const rows = await db
      .select()
      .from(contentSections)
      .where(and(...filters))
      .orderBy(asc(contentSections.position));

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
      pageSlug: string;
      sectionKey: string;
      title?: string;
      subtitle?: string;
      content?: Record<string, unknown>;
      position?: number;
      status?: string;
      locale?: string;
      isAutosave?: boolean;
    };

    if (!body.brand || !body.pageSlug || !body.sectionKey) {
      return fail("brand, pageSlug, sectionKey are required", 400, "BAD_REQUEST");
    }

    const brandRow = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.slug, body.brand))
      .limit(1);
    if (brandRow.length === 0) return fail("brand not found", 404, "NOT_FOUND");
    const brandId = brandRow[0].id;
    const locale = body.locale ?? "en";

    // Upsert section
    const existing = await db
      .select()
      .from(contentSections)
      .where(
        and(
          eq(contentSections.brandId, brandId),
          eq(contentSections.pageSlug, body.pageSlug),
          eq(contentSections.sectionKey, body.sectionKey),
          eq(contentSections.locale, locale),
        ),
      )
      .limit(1);

    let sectionRecord;
    if (existing.length > 0) {
      const updated = await db
        .update(contentSections)
        .set({
          title: body.title ?? existing[0].title,
          subtitle: body.subtitle ?? existing[0].subtitle,
          content: body.content ?? existing[0].content,
          position: body.position ?? existing[0].position,
          status: body.status ?? existing[0].status,
          updatedAt: new Date(),
        })
        .where(eq(contentSections.id, existing[0].id))
        .returning();
      sectionRecord = updated[0];
    } else {
      const inserted = await db
        .insert(contentSections)
        .values({
          brandId,
          pageSlug: body.pageSlug,
          sectionKey: body.sectionKey,
          title: body.title,
          subtitle: body.subtitle,
          content: body.content ?? {},
          position: body.position ?? 0,
          status: body.status ?? "draft",
          locale,
        })
        .returning();
      sectionRecord = inserted[0];
    }

    // Write Version Snapshot
    await db.insert(contentVersions).values({
      entityType: "section",
      entityId: sectionRecord.id,
      versionNumber: Math.floor(Date.now() / 1000),
      snapshot: sectionRecord as unknown as Record<string, unknown>,
      isAutosave: !!body.isAutosave,
      changeSummary: body.isAutosave ? "Autosaved snapshot" : "Manual update",
    });

    // Write Audit Log
    await db.insert(auditLogs).values({
      action: body.isAutosave ? "autosave" : body.status === "published" ? "publish" : "update",
      entityType: "section",
      entityId: sectionRecord.id,
      details: { pageSlug: body.pageSlug, sectionKey: body.sectionKey },
    });

    return ok(sectionRecord);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
