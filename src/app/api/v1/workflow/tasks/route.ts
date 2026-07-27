import { db } from "@/db";
import { editorialTasks, editorialNotifications, auditLogs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/workflow/tasks?entityType=page&entityId=1
 * POST /api/v1/workflow/tasks { entityType, entityId, title, assigneeId?, reviewerId?, approverId?, dueDate? }
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType");
    const entityIdRaw = url.searchParams.get("entityId");

    const filters = [] as ReturnType<typeof eq>[];
    if (entityType) filters.push(eq(editorialTasks.entityType, entityType));
    if (entityIdRaw) filters.push(eq(editorialTasks.entityId, Number(entityIdRaw)));

    const rows = filters.length
      ? await db.select().from(editorialTasks).where(and(...filters))
      : await db.select().from(editorialTasks);

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
      title: string;
      assigneeId?: number;
      reviewerId?: number;
      approverId?: number;
      dueDate?: string;
    };
    if (!body.entityType || !body.entityId || !body.title) {
      return fail("entityType, entityId, title required", 400, "BAD_REQUEST");
    }

    const inserted = await db
      .insert(editorialTasks)
      .values({
        entityType: body.entityType,
        entityId: body.entityId,
        title: body.title,
        assigneeId: body.assigneeId ?? null,
        reviewerId: body.reviewerId ?? null,
        approverId: body.approverId ?? null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      })
      .returning();

    await db.insert(editorialNotifications).values({
      recipientId: body.assigneeId ?? null,
      type: "task_assigned",
      message: `New editorial task assigned: ${body.title}`,
    });

    await db.insert(auditLogs).values({
      action: "task_created",
      entityType: body.entityType,
      entityId: body.entityId,
      details: { taskId: inserted[0].id },
    });

    return ok(inserted[0], { status: 201 });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
