import { db } from "@/db";
import { contentSections, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!Number.isFinite(id)) return fail("invalid id", 400, "BAD_REQUEST");

    const body = (await req.json()) as { position: number };
    if (typeof body.position !== "number") return fail("position required", 400, "BAD_REQUEST");

    const updated = await db
      .update(contentSections)
      .set({ position: body.position, updatedAt: new Date() })
      .where(eq(contentSections.id, id))
      .returning();

    if (updated.length === 0) return fail("section not found", 404, "NOT_FOUND");

    await db.insert(auditLogs).values({
      action: "reorder",
      entityType: "section",
      entityId: id,
      details: { newPosition: body.position },
    });

    return ok(updated[0]);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
