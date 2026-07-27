import { db } from "@/db";
import { contentVersions, contentSections, auditLogs } from "@/db/schema";
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

    const versionRows = await db
      .select()
      .from(contentVersions)
      .where(eq(contentVersions.id, id))
      .limit(1);

    if (versionRows.length === 0) return fail("version not found", 404, "NOT_FOUND");
    const v = versionRows[0];

    if (v.entityType === "section") {
      const snap = v.snapshot as {
        title?: string;
        subtitle?: string;
        content?: Record<string, unknown>;
        status?: string;
        position?: number;
      };

      const restored = await db
        .update(contentSections)
        .set({
          title: snap.title,
          subtitle: snap.subtitle,
          content: snap.content,
          status: snap.status ?? "published",
          position: snap.position ?? 0,
          updatedAt: new Date(),
        })
        .where(eq(contentSections.id, v.entityId))
        .returning();

      await db.insert(auditLogs).values({
        action: "restore",
        entityType: "section",
        entityId: v.entityId,
        details: { restoredVersionId: id },
      });

      return ok(restored[0]);
    }

    return fail("entityType not restorable", 400, "BAD_REQUEST");
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
