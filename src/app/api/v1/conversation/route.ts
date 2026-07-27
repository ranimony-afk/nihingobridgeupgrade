import { db } from "@/db";
import { conversationLessons } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/conversation?category=greetings
 * POST /api/v1/conversation { lessonId, isCompleted }
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const category = url.searchParams.get("category");

    const rows = category && category !== "all"
      ? await db.select().from(conversationLessons).where(eq(conversationLessons.category, category))
      : await db.select().from(conversationLessons);

    return ok(rows, {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    await ensureSeed();
    const body = (await req.json()) as { lessonId?: number; isCompleted?: boolean };
    if (!body.lessonId) return fail("lessonId required", 400, "BAD_REQUEST");

    const updated = await db
      .update(conversationLessons)
      .set({ isCompleted: body.isCompleted ?? true })
      .where(eq(conversationLessons.id, body.lessonId))
      .returning();

    return ok(updated[0]);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
