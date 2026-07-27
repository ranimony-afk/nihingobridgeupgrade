import { db } from "@/db";
import { newsArticles } from "@/db/schema";
import { desc } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mobile/news
 */
export async function GET() {
  try {
    await ensureSeed();
    const rows = await db.select().from(newsArticles).orderBy(desc(newsArticles.publishedAt));
    return ok(rows, {
      headers: { "Cache-Control": "public, max-age=120" },
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
