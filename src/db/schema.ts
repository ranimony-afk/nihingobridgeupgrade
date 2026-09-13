import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  varchar,
  boolean,
  index,
} from "drizzle-orm/pg-core";

// A deck groups cards (e.g. "Hiragana", "Katakana", "N5 Vocabulary")
export const decks = pgTable("decks", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: varchar("category", { length: 32 }).notNull().default("vocab"), // kana | vocab | grammar
  emoji: varchar("emoji", { length: 8 }).notNull().default("📚"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// A card is a single item to learn
export const cards = pgTable(
  "cards",
  {
    id: serial("id").primaryKey(),
    deckId: integer("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    front: text("front").notNull(), // Japanese (kana/kanji)
    reading: text("reading").notNull().default(""), // romaji or kana reading
    back: text("back").notNull(), // English meaning
    example: text("example").notNull().default(""),
    exampleTranslation: text("example_translation").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    deckIdx: index("cards_deck_idx").on(t.deckId),
  }),
);

// Progress records for spaced repetition (single anonymous learner for now)
export const progress = pgTable(
  "progress",
  {
    id: serial("id").primaryKey(),
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" })
      .unique(),
    // SM-2-ish fields
    repetitions: integer("repetitions").notNull().default(0),
    intervalDays: integer("interval_days").notNull().default(0),
    easeFactor: integer("ease_factor").notNull().default(250), // stored x100
    dueAt: timestamp("due_at").notNull().defaultNow(),
    lastRating: varchar("last_rating", { length: 16 }),
    correctCount: integer("correct_count").notNull().default(0),
    incorrectCount: integer("incorrect_count").notNull().default(0),
    learned: boolean("learned").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    dueIdx: index("progress_due_idx").on(t.dueAt),
  }),
);

// Study sessions log for stats / streaks
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  deckId: integer("deck_id").references(() => decks.id, {
    onDelete: "set null",
  }),
  reviewed: integer("reviewed").notNull().default(0),
  correct: integer("correct").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Deck = typeof decks.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type Progress = typeof progress.$inferSelect;
export type Session = typeof sessions.$inferSelect;
