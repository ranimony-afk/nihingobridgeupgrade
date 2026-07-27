import { db } from "@/db";
import { srsFlashcards, nihongoLearningItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";
import { calculateSrs } from "@/shared/tools";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/nihongo/flashcards
 * POST /api/v1/nihongo/flashcards { itemId, quality (0-5) }
 */
export async function GET() {
  try {
    await ensureSeed();
    const items = await db.select().from(nihongoLearningItems).limit(20);
    return ok(items);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    await ensureSeed();
    const body = (await req.json()) as { itemId: number; quality: number };
    if (!body.itemId || typeof body.quality !== "number") {
      return fail("itemId, quality (0-5) required", 400, "BAD_REQUEST");
    }

    const existing = await db
      .select()
      .from(srsFlashcards)
      .where(eq(srsFlashcards.itemId, body.itemId))
      .limit(1);

    const prevRepetitions = existing[0]?.repetitions ?? 0;
    const prevEaseFactor = existing[0]?.easeFactor ?? 250;
    const prevIntervalDays = existing[0]?.intervalDays ?? 1;

    const srsResult = calculateSrs({
      quality: body.quality,
      repetitions: prevRepetitions,
      easeFactor: prevEaseFactor,
      intervalDays: prevIntervalDays,
    });

    let record;
    if (existing.length > 0) {
      const updated = await db
        .update(srsFlashcards)
        .set({
          repetitions: srsResult.repetitions,
          easeFactor: srsResult.easeFactor,
          intervalDays: srsResult.intervalDays,
          nextReviewAt: srsResult.nextReviewDate,
          lastReviewedAt: new Date(),
        })
        .where(eq(srsFlashcards.id, existing[0].id))
        .returning();
      record = updated[0];
    } else {
      const inserted = await db
        .insert(srsFlashcards)
        .values({
          itemId: body.itemId,
          repetitions: srsResult.repetitions,
          easeFactor: srsResult.easeFactor,
          intervalDays: srsResult.intervalDays,
          nextReviewAt: srsResult.nextReviewDate,
          lastReviewedAt: new Date(),
        })
        .returning();
      record = inserted[0];
    }

    return ok({ record, srsResult });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
