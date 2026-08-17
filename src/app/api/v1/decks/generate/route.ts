import { db } from "@/db";
import {
  customDecks,
  customDeckCards,
  nihongoLearningItems,
  kanjiDictionary,
  jlptExamSessions,
  brands,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/decks/generate { source: "vocabulary" | "kanji" | "grammar" | "saved_lists" | "practice_errors", jlptLevel? }
 */
export async function POST(req: Request) {
  try {
    await ensureSeed();
    const body = (await req.json()) as {
      source?: "vocabulary" | "kanji" | "grammar" | "saved_lists" | "practice_errors";
      jlptLevel?: string;
      title?: string;
    };

    const source = body.source ?? "vocabulary";
    const jlptLevel = body.jlptLevel ?? "N5";

    const brandRow = await db.select({ id: brands.id }).from(brands).where(eq(brands.slug, "nihongo")).limit(1);
    const brandId = brandRow[0]?.id ?? 1;

    let cardsData: Array<{ front: string; back: string; furigana?: string; romaji?: string; notes?: string }> = [];
    let deckTitle = body.title || `Auto-Generated ${source.toUpperCase()} (${jlptLevel}) Deck`;

    if (source === "vocabulary" || source === "grammar") {
      const items = await db
        .select()
        .from(nihongoLearningItems)
        .where(
          and(
            eq(nihongoLearningItems.category, source),
            eq(nihongoLearningItems.jlptLevel, jlptLevel),
          ),
        );
      const pool = items.length > 0 ? items : await db.select().from(nihongoLearningItems).limit(8);
      cardsData = pool.map((it) => ({
        front: it.japanese,
        back: it.meaning,
        furigana: it.furigana ?? undefined,
        romaji: it.romaji ?? undefined,
        notes: it.grammarStructure || it.partOfSpeech || `${source} item`,
      }));
    } else if (source === "kanji") {
      const kanjiItems = await db
        .select()
        .from(kanjiDictionary)
        .where(eq(kanjiDictionary.jlptLevel, jlptLevel));
      const pool = kanjiItems.length > 0 ? kanjiItems : await db.select().from(kanjiDictionary).limit(8);
      cardsData = pool.map((k) => ({
        front: k.kanji,
        back: `${k.meaning} (${k.onyomi || ""})`,
        furigana: k.kunyomi ?? undefined,
        romaji: `${k.strokeCount} strokes`,
        notes: `Radical: ${k.radicals || "none"}`,
      }));
    } else if (source === "practice_errors") {
      const examSessions = await db.select().from(jlptExamSessions).limit(5);
      const errors = examSessions.flatMap((s) => s.incorrectAnswers || []);
      if (errors.length > 0) {
        cardsData = errors.map((err) => ({
          front: err.question,
          back: `Correct: ${err.correct}`,
          notes: `Explanation: ${err.explanation}`,
        }));
      } else {
        cardsData = [
          { front: "日本 (にほん)", back: "Japan", notes: "Review error item" },
          { front: "食べる (たべる)", back: "To eat", notes: "Review error item" },
        ];
      }
      deckTitle = body.title || "Targeted Practice Errors Deck";
    } else {
      cardsData = [
        { front: "お世話になっております", back: "Thank you for your ongoing support", notes: "Saved list item" },
        { front: "よろしくお願いいたします", back: "Pleased to work with you", notes: "Saved list item" },
      ];
      deckTitle = body.title || "Custom Saved List Flashcards";
    }

    const shareCode = `deck-auto-${Date.now().toString(36)}`;
    const inserted = await db
      .insert(customDecks)
      .values({
        brandId,
        title: deckTitle,
        description: `Automatically generated deck from ${source} for targeted study.`,
        jlptLevel,
        isPublic: true,
        shareCode,
        tags: [source, jlptLevel, "auto-generated"],
        cardCount: cardsData.length,
      })
      .returning();

    const deck = inserted[0];

    for (let i = 0; i < cardsData.length; i++) {
      const c = cardsData[i];
      await db.insert(customDeckCards).values({
        deckId: deck.id,
        cardType: source === "kanji" ? "kanji" : "vocab",
        front: c.front,
        back: c.back,
        furigana: c.furigana ?? null,
        romaji: c.romaji ?? null,
        notes: c.notes ?? null,
        position: i,
        easeFactor: 250,
        intervalDays: 1,
        repetitions: 0,
        accuracy: 100,
      });
    }

    return ok(deck, { status: 201 });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
