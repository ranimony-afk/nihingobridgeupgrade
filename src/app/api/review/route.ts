import { recordSession, reviewCard } from "@/lib/queries";
import { schedule, type Rating } from "@/lib/srs";

export const dynamic = "force-dynamic";

type ReviewItem = {
  cardId: number;
  rating: Rating;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
};

type Payload = {
  deckId: number;
  reviews: ReviewItem[];
};

const validRatings: Rating[] = ["again", "hard", "good", "easy"];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload;
    if (!body || !Array.isArray(body.reviews)) {
      return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    let correct = 0;

    for (const item of body.reviews) {
      if (!validRatings.includes(item.rating)) continue;
      const result = schedule(
        {
          repetitions: item.repetitions ?? 0,
          intervalDays: item.intervalDays ?? 0,
          easeFactor: item.easeFactor ?? 250,
        },
        item.rating,
      );
      const isCorrect = item.rating !== "again";
      if (isCorrect) correct++;

      await reviewCard(item.cardId, {
        repetitions: result.repetitions,
        intervalDays: result.intervalDays,
        easeFactor: result.easeFactor,
        dueAt: result.dueAt,
        learned: result.learned,
        correct: isCorrect,
      });
    }

    if (body.reviews.length > 0 && typeof body.deckId === "number") {
      await recordSession(body.deckId, body.reviews.length, correct);
    }

    return Response.json({ ok: true, reviewed: body.reviews.length, correct });
  } catch (err) {
    console.error("review error", err);
    return Response.json({ ok: false, error: "Failed to save review" }, { status: 500 });
  }
}
