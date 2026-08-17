import { db } from "@/db";
import { newsArticles, brands } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/news?brand=nihongo&difficulty=N5&isToday=true
 * POST /api/v1/news (CMS Admin Create / Update)
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const brandSlug = url.searchParams.get("brand") ?? "nihongo";
    const difficulty = url.searchParams.get("difficulty");
    const isTodayOnly = url.searchParams.get("isToday") === "true";

    const brandRow = await db.select().from(brands).where(eq(brands.slug, brandSlug)).limit(1);
    const brandId = brandRow[0]?.id;

    const filters = [] as ReturnType<typeof eq>[];
    if (brandId) filters.push(eq(newsArticles.brandId, brandId));
    if (difficulty) filters.push(eq(newsArticles.difficultyLevel, difficulty));
    if (isTodayOnly) filters.push(eq(newsArticles.isToday, true));

    const rows = filters.length
      ? await db.select().from(newsArticles).where(and(...filters)).orderBy(desc(newsArticles.publishedAt))
      : await db.select().from(newsArticles).orderBy(desc(newsArticles.publishedAt));

    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    await ensureSeed();
    const body = (await req.json()) as {
      slug: string;
      title: string;
      summary: string;
      japaneseText: string;
      furiganaText?: string;
      englishTranslation: string;
      tamilTranslation?: string;
      malayalamTranslation?: string;
      difficultyLevel?: string;
      readingMinutes?: number;
      audioUrl?: string;
      grammarHighlights?: string[];
      extractedVocabulary?: Array<{ japanese: string; furigana: string; meaning: string }>;
      extractedKanji?: Array<{ kanji: string; meaning: string; strokes: number }>;
      comprehensionQuestions?: Array<{ question: string; options: string[]; correctIndex: number; explanation: string }>;
      isToday?: boolean;
    };

    if (!body.slug || !body.title || !body.japaneseText || !body.englishTranslation) {
      return fail("slug, title, japaneseText, englishTranslation required", 400, "BAD_REQUEST");
    }

    const brandRow = await db.select().from(brands).where(eq(brands.slug, "nihongo")).limit(1);
    const brandId = brandRow[0]?.id ?? 1;

    const inserted = await db
      .insert(newsArticles)
      .values({
        brandId,
        slug: body.slug,
        title: body.title,
        summary: body.summary ?? "",
        japaneseText: body.japaneseText,
        furiganaText: body.furiganaText ?? null,
        englishTranslation: body.englishTranslation,
        tamilTranslation: body.tamilTranslation ?? null,
        malayalamTranslation: body.malayalamTranslation ?? null,
        difficultyLevel: body.difficultyLevel ?? "N5",
        readingMinutes: body.readingMinutes ?? 3,
        audioUrl: body.audioUrl ?? null,
        grammarHighlights: body.grammarHighlights ?? [],
        extractedVocabulary: body.extractedVocabulary ?? [],
        extractedKanji: body.extractedKanji ?? [],
        comprehensionQuestions: body.comprehensionQuestions ?? [],
        isToday: body.isToday ?? false,
        status: "published",
      })
      .returning();

    return ok(inserted[0], { status: 201 });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
