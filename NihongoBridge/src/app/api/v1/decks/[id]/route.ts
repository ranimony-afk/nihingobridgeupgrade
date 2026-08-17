import { db } from "@/db";
import { customDecks, customDeckCards } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await ensureSeed();
    const { id: idParam } = await ctx.params;
    const deckId = Number(idParam);
    if (!Number.isFinite(deckId)) return fail("invalid deck id", 400, "BAD_REQUEST");

    const deckRows = await db.select().from(customDecks).where(eq(customDecks.id, deckId)).limit(1);
    if (deckRows.length === 0) return fail("deck not found", 404, "NOT_FOUND");
    const deck = deckRows[0];

    const cards = await db
      .select()
      .from(customDeckCards)
      .where(eq(customDeckCards.deckId, deckId))
      .orderBy(asc(customDeckCards.position));

    return ok({ ...deck, cards });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
