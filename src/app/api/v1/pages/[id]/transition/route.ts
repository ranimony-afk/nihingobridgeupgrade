import { db } from "@/db";
import { pages, editorialEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail, isEditorialStatus } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/pages/[id]/transition   { toStatus, actorId?, note? }
 * Editorial workflow transitions with an audit trail in `editorial_events`.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!Number.isFinite(id)) return fail("invalid id", 400, "BAD_REQUEST");

    const body = (await req.json()) as {
      toStatus?: string;
      actorId?: number;
      note?: string;
    };
    if (!isEditorialStatus(body.toStatus)) {
      return fail("invalid toStatus", 400, "BAD_REQUEST");
    }

    const existing = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
    if (existing.length === 0) return fail("page not found", 404, "NOT_FOUND");
    const prev = existing[0];

    const updated = await db
      .update(pages)
      .set({
        status: body.toStatus,
        publishedAt: body.toStatus === "published" ? new Date() : prev.publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(pages.id, id))
      .returning();

    await db.insert(editorialEvents).values({
      entityType: "page",
      entityId: id,
      fromStatus: prev.status,
      toStatus: body.toStatus,
      actorId: body.actorId ?? null,
      note: body.note ?? null,
    });

    return ok(updated[0]);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
