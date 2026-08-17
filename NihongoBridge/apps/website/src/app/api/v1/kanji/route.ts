import { db } from "@/db";
import { kanjiDictionary } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/kanji?theme=nature&jlptLevel=N5&search=sun
 * POST /api/v1/kanji { action: "toggle_favorite" | "submit_writing_score", kanjiId?, score? }
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const theme = url.searchParams.get("theme");
    const jlptLevel = url.searchParams.get("jlptLevel");
    const search = url.searchParams.get("search");

    const filters = [] as ReturnType<typeof eq>[];
    if (theme && theme !== "all") filters.push(eq(kanjiDictionary.themeCategory, theme));
    if (jlptLevel && jlptLevel !== "all") filters.push(eq(kanjiDictionary.jlptLevel, jlptLevel));

    let rows = filters.length
      ? await db.select().from(kanjiDictionary).where(and(...filters)).orderBy(asc(kanjiDictionary.strokeCount))
      : await db.select().from(kanjiDictionary).orderBy(asc(kanjiDictionary.strokeCount));

    if (search) {
      const q = search.toLowerCase().trim();
      rows = rows.filter(
        (k) =>
          k.kanji.includes(q) ||
          k.meaning.toLowerCase().includes(q) ||
          (k.onyomi && k.onyomi.toLowerCase().includes(q)) ||
          (k.kunyomi && k.kunyomi.toLowerCase().includes(q)),
      );
    }

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
    const body = (await req.json()) as {
      action: "toggle_favorite" | "submit_writing_score";
      kanjiId?: number;
      score?: number;
    };

    if (body.action === "toggle_favorite" && body.kanjiId) {
      const row = await db.select().from(kanjiDictionary).where(eq(kanjiDictionary.id, body.kanjiId)).limit(1);
      if (row.length === 0) return fail("Kanji not found", 404, "NOT_FOUND");
      const updated = await db
        .update(kanjiDictionary)
        .set({ isFavorite: !row[0].isFavorite })
        .where(eq(kanjiDictionary.id, body.kanjiId))
        .returning();
      return ok({ kanjiId: body.kanjiId, isFavorite: updated[0].isFavorite });
    }

    if (body.action === "submit_writing_score" && body.kanjiId && typeof body.score === "number") {
      const updated = await db
        .update(kanjiDictionary)
        .set({ masteryScore: Math.min(100, Math.max(0, body.score)) })
        .where(eq(kanjiDictionary.id, body.kanjiId))
        .returning();
      return ok({ kanjiId: body.kanjiId, masteryScore: updated[0].masteryScore });
    }

    return fail("Invalid action", 400, "BAD_REQUEST");
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
