import { db } from "@/db";
import { nihongoQuizzes, nihongoLearningItems } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";
import { generateMatchingGame } from "@/shared/tools";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/nihongo/quizzes?category=quiz&jlptLevel=N5
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const category = url.searchParams.get("category") ?? "quiz";
    const jlptLevel = url.searchParams.get("jlptLevel");

    if (category === "matching") {
      const items = await db.select().from(nihongoLearningItems).limit(6);
      const cards = generateMatchingGame(items);
      return ok({ type: "matching", cards });
    }

    const filters = [eq(nihongoQuizzes.category, category)];
    if (jlptLevel) filters.push(eq(nihongoQuizzes.jlptLevel, jlptLevel));

    const rows = await db.select().from(nihongoQuizzes).where(and(...filters));
    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
