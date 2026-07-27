import { db } from "@/db";
import { customDecks, customDeckCards } from "@/db/schema";
import { asc } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mobile/decks
 */
export async function GET() {
  try {
    await ensureSeed();
    const decks = await db.select().from(customDecks);
    const decksWithCards = await Promise.all(
      decks.map(async (d) => {
        const cards = await db.select().from(customDeckCards).where(asc(customDeckCards.position)).limit(10);
        return { ...d, sampleCards: cards };
      }),
    );

    return ok(decksWithCards, {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
