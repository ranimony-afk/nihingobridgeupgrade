import { db } from "@/db";
import { contentSections, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!Number.isFinite(id)) return fail("invalid id", 400, "BAD_REQUEST");

    const existing = await db
      .select()
      .from(contentSections)
      .where(eq(contentSections.id, id))
      .limit(1);

    if (existing.length === 0) return fail("section not found", 404, "NOT_FOUND");
    const item = existing[0];

    const duplicated = await db
      .insert(contentSections)
      .values({
        brandId: item.brandId,
        pageSlug: item.pageSlug,
        sectionKey: `${item.sectionKey}-copy-${Date.now().toString().slice(-4)}`,
        title: item.title ? `${item.title} (Copy)` : "Copy",
        subtitle: item.subtitle,
        content: item.content,
        position: item.position + 1,
        status: "draft",
        locale: item.locale,
      })
      .returning();

    await db.insert(auditLogs).values({
      action: "duplicate",
      entityType: "section",
      entityId: duplicated[0].id,
      details: { originalId: id },
    });

    return ok(duplicated[0], { status: 201 });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
