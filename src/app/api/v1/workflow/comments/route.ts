import { db } from "@/db";
import { editorialComments, editorialNotifications, auditLogs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { extractMentions } from "@/shared/workflow";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/workflow/comments?entityType=page&entityId=1
 * POST /api/v1/workflow/comments { entityType, entityId, authorId?, body }
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType");
    const entityIdRaw = url.searchParams.get("entityId");

    const filters = [] as ReturnType<typeof eq>[];
    if (entityType) filters.push(eq(editorialComments.entityType, entityType));
    if (entityIdRaw) filters.push(eq(editorialComments.entityId, Number(entityIdRaw)));

    const rows = filters.length
      ? await db.select().from(editorialComments).where(and(...filters))
      : await db.select().from(editorialComments);

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
      authorId?: number;
      body: string;
    };
    if (!body.entityType || !body.entityId || !body.body) {
      return fail("entityType, entityId, body required", 400, "BAD_REQUEST");
    }

    const mentions = extractMentions(body.body);

    const inserted = await db
      .insert(editorialComments)
      .values({
        entityType: body.entityType,
        entityId: body.entityId,
        authorId: body.authorId ?? null,
        body: body.body,
        mentions,
      })
      .returning();

    // Create notifications for mentions
    if (mentions.length > 0) {
      await db.insert(editorialNotifications).values({
        recipientId: null,
        actorId: body.authorId ?? null,
        type: "mention",
        message: `You were mentioned in an editorial comment on ${body.entityType} #${body.entityId}: ${body.body.slice(0, 80)}`,
      });
    }

    await db.insert(auditLogs).values({
      action: "comment_added",
      entityType: body.entityType,
      entityId: body.entityId,
      details: { commentId: inserted[0].id, mentionsCount: mentions.length },
    });

    return ok(inserted[0], { status: 201 });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
