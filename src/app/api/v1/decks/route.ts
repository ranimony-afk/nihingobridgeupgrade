import { db } from "@/db";
import { customDecks, customDeckCards, brands } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/decks?brand=nihongo&jlptLevel=N5
 * POST /api/v1/decks { brand?, title, description?, jlptLevel?, tags?, cards? }
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const brandSlug = url.searchParams.get("brand") ?? "nihongo";
    const jlptLevel = url.searchParams.get("jlptLevel");

    const brandRow = await db.select().from(brands).where(eq(brands.slug, brandSlug)).limit(1);
    const brandId = brandRow[0]?.id;

    const filters = [] as ReturnType<typeof eq>[];
    if (brandId) filters.push(eq(customDecks.brandId, brandId));
    if (jlptLevel) filters.push(eq(customDecks.jlptLevel, jlptLevel));

    const rows = filters.length
      ? await db.select().from(customDecks).where(and(...filters)).orderBy(desc(customDecks.createdAt))
      : await db.select().from(customDecks).orderBy(desc(customDecks.createdAt));

    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    await ensureSeed();
    const body = (await req.json()) as {
      brand?: string;
      title: string;
      description?: string;
      jlptLevel?: string;
      tags?: string[];
      cards?: Array<{
        front: string;
        back: string;
        furigana?: string;
        romaji?: string;
        cardType?: string;
        notes?: string;
      }>;
    };

    if (!body.title) return fail("title is required", 400, "BAD_REQUEST");

    const brandRow = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.slug, body.brand ?? "nihongo"))
      .limit(1);
    const brandId = brandRow[0]?.id ?? 1;

    const shareCode = `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const cardItems = body.cards ?? [];

    const inserted = await db
      .insert(customDecks)
      .values({
        brandId,
        title: body.title,
        description: body.description ?? null,
        jlptLevel: body.jlptLevel ?? "N5",
        isPublic: true,
        shareCode,
        tags: body.tags ?? [],
        cardCount: cardItems.length,
      })
      .returning();

    const deck = inserted[0];

    if (cardItems.length > 0) {
      await Promise.all(
        cardItems.map((c, i) =>
          db.insert(customDeckCards).values({
            deckId: deck.id,
            cardType: c.cardType ?? "vocab",
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
          }),
        ),
      );
    }

    return ok(deck, { status: 201 });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
