import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  varchar,
  boolean,
  index,
  jsonb,
  uniqueIndex,
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

/* =========================================================================
 * PHASE 04.2 — KNOWLEDGE / DICTIONARY (JMdict)
 * Additive only. No existing table is altered or dropped (Rule 3).
 * Canonical single schema (Rule 5).
 * ========================================================================= */

// Provenance: one row per ETL execution. Records source, version, license,
// checksum and outcome so every imported record is traceable (Rule 9).
export const etlImportRuns = pgTable("etl_import_runs", {
  id: serial("id").primaryKey(),
  source: varchar("source", { length: 64 }).notNull(), // e.g. "jmdict"
  sourceUrl: text("source_url").notNull().default(""),
  sourceVersion: varchar("source_version", { length: 64 }).notNull().default(""),
  license: text("license").notNull().default(""),
  attribution: text("attribution").notNull().default(""),
  checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull().default(""),
  checksumVerified: boolean("checksum_verified").notNull().default(false),
  dryRun: boolean("dry_run").notNull().default(false),
  status: varchar("status", { length: 16 }).notNull().default("running"), // running|success|failed
  stats: jsonb("stats").notNull().default({}),
  errorSample: jsonb("error_sample").notNull().default([]),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
});

// One row per JMdict <entry>. Deduplicated/upserted on (source, source_id).
export const dictionaryEntries = pgTable(
  "dictionary_entries",
  {
    id: serial("id").primaryKey(),
    source: varchar("source", { length: 64 }).notNull().default("jmdict"),
    sourceId: varchar("source_id", { length: 64 }).notNull(), // JMdict ent_seq
    importRunId: integer("import_run_id").references(() => etlImportRuns.id, {
      onDelete: "set null",
    }),
    headword: text("headword").notNull().default(""), // primary kanji form (or kana)
    primaryReading: text("primary_reading").notNull().default(""),
    isCommon: boolean("is_common").notNull().default(false),
    frequencyRank: integer("frequency_rank"),
    jlptLevel: varchar("jlpt_level", { length: 4 }),
    contentHash: varchar("content_hash", { length: 64 }).notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    sourceUnique: uniqueIndex("dictionary_entries_source_unique").on(
      t.source,
      t.sourceId,
    ),
    headwordIdx: index("dictionary_entries_headword_idx").on(t.headword),
    readingIdx: index("dictionary_entries_reading_idx").on(t.primaryReading),
  }),
);

// Kanji surface forms (<k_ele>)
export const dictionaryKanji = pgTable(
  "dictionary_kanji",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    common: boolean("common").notNull().default(false),
    priorityTags: jsonb("priority_tags").notNull().default([]),
    infoTags: jsonb("info_tags").notNull().default([]),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    entryIdx: index("dictionary_kanji_entry_idx").on(t.entryId),
    textIdx: index("dictionary_kanji_text_idx").on(t.text),
  }),
);

// Kana readings (<r_ele>)
export const dictionaryReadings = pgTable(
  "dictionary_readings",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    common: boolean("common").notNull().default(false),
    noKanji: boolean("no_kanji").notNull().default(false),
    priorityTags: jsonb("priority_tags").notNull().default([]),
    infoTags: jsonb("info_tags").notNull().default([]),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    entryIdx: index("dictionary_readings_entry_idx").on(t.entryId),
    textIdx: index("dictionary_readings_text_idx").on(t.text),
  }),
);

// Senses (<sense>) with normalized glosses/tags
export const dictionarySenses = pgTable(
  "dictionary_senses",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    glosses: jsonb("glosses").notNull().default([]),
    partsOfSpeech: jsonb("parts_of_speech").notNull().default([]),
    fields: jsonb("fields").notNull().default([]),
    misc: jsonb("misc").notNull().default([]),
    dialects: jsonb("dialects").notNull().default([]),
    info: text("info").notNull().default(""),
  },
  (t) => ({
    entryIdx: index("dictionary_senses_entry_idx").on(t.entryId),
  }),
);

export type EtlImportRun = typeof etlImportRuns.$inferSelect;
export type DictionaryEntry = typeof dictionaryEntries.$inferSelect;
export type DictionaryKanji = typeof dictionaryKanji.$inferSelect;
export type DictionaryReading = typeof dictionaryReadings.$inferSelect;
export type DictionarySense = typeof dictionarySenses.$inferSelect;
