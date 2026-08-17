import { db } from "@/db";
import { nihongoLearningItems, userWordLists } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/vocabulary?jlptLevel=N5&partOfSpeech=Verb&search=taberu
 * POST /api/v1/vocabulary { action: "toggle_favorite" | "toggle_bookmark" | "create_list" | "generate_quiz", itemId?, wordListTitle? }
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const jlptLevel = url.searchParams.get("jlptLevel");
    const partOfSpeech = url.searchParams.get("partOfSpeech");
    const search = url.searchParams.get("search");
    const reviewStatus = url.searchParams.get("reviewStatus");

    const filters = [eq(nihongoLearningItems.category, "vocabulary")];
    if (jlptLevel && jlptLevel !== "all") filters.push(eq(nihongoLearningItems.jlptLevel, jlptLevel));
    if (partOfSpeech && partOfSpeech !== "all") filters.push(eq(nihongoLearningItems.partOfSpeech, partOfSpeech));
    if (reviewStatus && reviewStatus !== "all") filters.push(eq(nihongoLearningItems.reviewStatus, reviewStatus));

    let rows = await db.select().from(nihongoLearningItems).where(and(...filters));

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.japanese.toLowerCase().includes(q) ||
          r.meaning.toLowerCase().includes(q) ||
          (r.romaji && r.romaji.toLowerCase().includes(q)) ||
          (r.furigana && r.furigana.toLowerCase().includes(q)),
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
      action: "toggle_favorite" | "toggle_bookmark" | "create_list" | "generate_quiz";
      itemId?: number;
      wordListTitle?: string;
      words?: Array<{ japanese: string; reading: string; meaning: string }>;
    };

    if (body.action === "toggle_favorite" && body.itemId) {
      const item = await db.select().from(nihongoLearningItems).where(eq(nihongoLearningItems.id, body.itemId)).limit(1);
      if (item.length === 0) return fail("item not found", 404, "NOT_FOUND");
      const updated = await db
        .update(nihongoLearningItems)
        .set({ isFavorite: !item[0].isFavorite })
        .where(eq(nihongoLearningItems.id, body.itemId))
        .returning();
      return ok({ itemId: body.itemId, isFavorite: updated[0].isFavorite });
    }

    if (body.action === "toggle_bookmark" && body.itemId) {
      const item = await db.select().from(nihongoLearningItems).where(eq(nihongoLearningItems.id, body.itemId)).limit(1);
      if (item.length === 0) return fail("item not found", 404, "NOT_FOUND");
      const updated = await db
        .update(nihongoLearningItems)
        .set({ isBookmarked: !item[0].isBookmarked })
        .where(eq(nihongoLearningItems.id, body.itemId))
        .returning();
      return ok({ itemId: body.itemId, isBookmarked: updated[0].isBookmarked });
    }

    if (body.action === "create_list") {
      const title = body.wordListTitle ?? "My Vocabulary List";
      const shareCode = `list-${Date.now().toString(36)}`;
      const inserted = await db
        .insert(userWordLists)
        .values({
          title,
          shareCode,
          words: body.words ?? [],
        })
        .returning();
      return ok(inserted[0], { status: 201 });
    }

    if (body.action === "generate_quiz") {
      const vocab = await db.select().from(nihongoLearningItems).where(eq(nihongoLearningItems.category, "vocabulary")).limit(10);
      const generatedQuestions = vocab.map((v) => ({
        question: `What is the meaning of 「${v.japanese}」 (${v.furigana})?`,
        options: [v.meaning, "To go home", "To drink water", "To write a letter"],
        correctIndex: 0,
        explanation: `${v.japanese} (${v.furigana}) means ${v.meaning}. Part of speech: ${v.partOfSpeech}.`,
      }));
      return ok({ count: generatedQuestions.length, questions: generatedQuestions });
    }

    return fail("Invalid action", 400, "BAD_REQUEST");
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
