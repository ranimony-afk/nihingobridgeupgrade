import { db } from "@/db";
import { cards, decks } from "@/db/schema";
import { seedDecks } from "./seed-data";
import { count } from "drizzle-orm";

export async function seedDatabase() {
  const [row] = await db.select({ c: count() }).from(decks);
  if (Number(row?.c ?? 0) > 0) {
    return { seeded: false, message: "Database already seeded." };
  }

  let insertedDecks = 0;
  let insertedCards = 0;

  for (let d = 0; d < seedDecks.length; d++) {
    const deck = seedDecks[d];
    const [created] = await db
      .insert(decks)
      .values({
        slug: deck.slug,
        title: deck.title,
        description: deck.description,
        category: deck.category,
        emoji: deck.emoji,
        sortOrder: d,
      })
      .returning({ id: decks.id });

    insertedDecks++;

    if (deck.cards.length > 0) {
      await db.insert(cards).values(
        deck.cards.map((c, i) => ({
          deckId: created.id,
          front: c.front,
          reading: c.reading,
          back: c.back,
          example: c.example ?? "",
          exampleTranslation: c.exampleTranslation ?? "",
          sortOrder: i,
        })),
      );
      insertedCards += deck.cards.length;
    }
  }

  return {
    seeded: true,
    message: `Seeded ${insertedDecks} decks and ${insertedCards} cards.`,
  };
}
