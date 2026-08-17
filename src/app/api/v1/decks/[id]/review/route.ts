import { db } from "@/db";
import { customDeckCards } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { calculateSrs } from "@/shared/tools";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/decks/[id]/review { cardId, quality (0-5) }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { cardId: number; quality: number };
    if (!body.cardId || typeof body.quality !== "number") {
      return fail("cardId and quality (0-5) are required", 400, "BAD_REQUEST");
    }

    const rows = await db
      .select()
      .from(customDeckCards)
      .where(eq(customDeckCards.id, body.cardId))
      .limit(1);

    if (rows.length === 0) return fail("card not found", 404, "NOT_FOUND");
    const card = rows[0];

    const srsResult = calculateSrs({
      quality: body.quality,
      repetitions: card.repetitions,
      easeFactor: card.easeFactor,
      intervalDays: card.intervalDays,
    });

    const isCorrect = body.quality >= 3;
    const newAccuracy = Math.round(
      (card.accuracy * card.repetitions + (isCorrect ? 100 : 0)) / (card.repetitions + 1),
    );

    const updated = await db
      .update(customDeckCards)
      .set({
        easeFactor: srsResult.easeFactor,
        intervalDays: srsResult.intervalDays,
        repetitions: srsResult.repetitions,
        accuracy: newAccuracy,
        nextReviewAt: srsResult.nextReviewDate,
        lastReviewedAt: new Date(),
      })
      .where(eq(customDeckCards.id, card.id))
      .returning();

    return ok({ card: updated[0], srsResult });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
