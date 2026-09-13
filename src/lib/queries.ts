import { db } from "@/db";
import { cards, decks, progress, sessions } from "@/db/schema";
import { and, asc, count, eq, lte, sql } from "drizzle-orm";

export type DeckWithStats = {
  id: number;
  slug: string;
  title: string;
  description: string;
  category: string;
  emoji: string;
  total: number;
  learned: number;
  due: number;
};

export async function getDecksWithStats(): Promise<DeckWithStats[]> {
  const now = new Date();

  const rows = await db
    .select({
      id: decks.id,
      slug: decks.slug,
      title: decks.title,
      description: decks.description,
      category: decks.category,
      emoji: decks.emoji,
      sortOrder: decks.sortOrder,
      total: count(cards.id),
      learned: sql<number>`count(*) filter (where ${progress.learned} = true)`,
      due: sql<number>`count(*) filter (where ${progress.id} is null or ${progress.dueAt} <= ${now})`,
    })
    .from(decks)
    .leftJoin(cards, eq(cards.deckId, decks.id))
    .leftJoin(progress, eq(progress.cardId, cards.id))
    .groupBy(decks.id)
    .orderBy(asc(decks.sortOrder), asc(decks.id));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    category: r.category,
    emoji: r.emoji,
    total: Number(r.total),
    learned: Number(r.learned),
    due: Number(r.due),
  }));
}

export async function getDeckBySlug(slug: string) {
  const [deck] = await db.select().from(decks).where(eq(decks.slug, slug)).limit(1);
  return deck ?? null;
}

export type StudyCard = {
  id: number;
  front: string;
  reading: string;
  back: string;
  example: string;
  exampleTranslation: string;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
};

// Cards that are due (or never studied) for a deck, limited.
export async function getDueCards(deckId: number, limit = 20): Promise<StudyCard[]> {
  const now = new Date();
  const rows = await db
    .select({
      id: cards.id,
      front: cards.front,
      reading: cards.reading,
      back: cards.back,
      example: cards.example,
      exampleTranslation: cards.exampleTranslation,
      repetitions: progress.repetitions,
      intervalDays: progress.intervalDays,
      easeFactor: progress.easeFactor,
      dueAt: progress.dueAt,
      progressId: progress.id,
    })
    .from(cards)
    .leftJoin(progress, eq(progress.cardId, cards.id))
    .where(eq(cards.deckId, deckId))
    .orderBy(asc(cards.sortOrder), asc(cards.id));

  const due = rows.filter(
    (r) => r.progressId === null || (r.dueAt !== null && r.dueAt <= now),
  );

  const pick = due.length > 0 ? due : rows; // if nothing due, allow review of all

  return pick.slice(0, limit).map((r) => ({
    id: r.id,
    front: r.front,
    reading: r.reading,
    back: r.back,
    example: r.example,
    exampleTranslation: r.exampleTranslation,
    repetitions: r.repetitions ?? 0,
    intervalDays: r.intervalDays ?? 0,
    easeFactor: r.easeFactor ?? 250,
  }));
}

export async function getGlobalStats() {
  const [cardCount] = await db.select({ c: count() }).from(cards);
  const [learnedCount] = await db
    .select({ c: count() })
    .from(progress)
    .where(eq(progress.learned, true));

  const now = new Date();
  const [dueRows] = await db
    .select({ c: count() })
    .from(progress)
    .where(lte(progress.dueAt, now));

  const [studiedRows] = await db.select({ c: count() }).from(progress);

  const [sessionAgg] = await db
    .select({
      reviewed: sql<number>`coalesce(sum(${sessions.reviewed}),0)`,
      correct: sql<number>`coalesce(sum(${sessions.correct}),0)`,
      sessionCount: count(),
    })
    .from(sessions);

  const totalCards = Number(cardCount?.c ?? 0);
  const learned = Number(learnedCount?.c ?? 0);
  const studied = Number(studiedRows?.c ?? 0);
  // due includes never-studied cards
  const dueStudied = Number(dueRows?.c ?? 0);
  const neverStudied = totalCards - studied;
  const totalReviewed = Number(sessionAgg?.reviewed ?? 0);
  const totalCorrect = Number(sessionAgg?.correct ?? 0);

  return {
    totalCards,
    learned,
    studied,
    due: dueStudied + neverStudied,
    sessions: Number(sessionAgg?.sessionCount ?? 0),
    totalReviewed,
    accuracy: totalReviewed > 0 ? Math.round((totalCorrect / totalReviewed) * 100) : 0,
  };
}

export async function isSeeded() {
  const [row] = await db.select({ c: count() }).from(decks);
  return Number(row?.c ?? 0) > 0;
}

export async function recordSession(deckId: number, reviewed: number, correct: number) {
  await db.insert(sessions).values({ deckId, reviewed, correct });
}

export async function reviewCard(
  cardId: number,
  next: {
    repetitions: number;
    intervalDays: number;
    easeFactor: number;
    dueAt: Date;
    learned: boolean;
    correct: boolean;
  },
) {
  const [existing] = await db
    .select()
    .from(progress)
    .where(eq(progress.cardId, cardId))
    .limit(1);

  if (existing) {
    await db
      .update(progress)
      .set({
        repetitions: next.repetitions,
        intervalDays: next.intervalDays,
        easeFactor: next.easeFactor,
        dueAt: next.dueAt,
        learned: next.learned,
        correctCount: existing.correctCount + (next.correct ? 1 : 0),
        incorrectCount: existing.incorrectCount + (next.correct ? 0 : 1),
        updatedAt: new Date(),
      })
      .where(eq(progress.cardId, cardId));
  } else {
    await db.insert(progress).values({
      cardId,
      repetitions: next.repetitions,
      intervalDays: next.intervalDays,
      easeFactor: next.easeFactor,
      dueAt: next.dueAt,
      learned: next.learned,
      correctCount: next.correct ? 1 : 0,
      incorrectCount: next.correct ? 0 : 1,
      updatedAt: new Date(),
    });
  }
}

export async function resetAllProgress() {
  await db.delete(progress);
  await db.delete(sessions);
}

// Utility used by seeding
export { and };
