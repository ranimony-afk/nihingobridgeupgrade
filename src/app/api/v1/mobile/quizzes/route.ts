import { db } from "@/db";
import { nihongoQuizzes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mobile/quizzes?jlptLevel=N5
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const jlptLevel = url.searchParams.get("jlptLevel");

    const rows = jlptLevel
      ? await db.select().from(nihongoQuizzes).where(eq(nihongoQuizzes.jlptLevel, jlptLevel))
      : await db.select().from(nihongoQuizzes);

    return ok(rows, {
      headers: { "Cache-Control": "public, max-age=120" },
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
