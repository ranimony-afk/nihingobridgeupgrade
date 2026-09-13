/**
 * NihongoBridge canonical PostgreSQL schema (Drizzle ORM).
 *
 * Domain: KNOWLEDGE (dictionary / kanji / radicals / components / sentences / provenance)
 *
 * Every table is additive. No destructive migrations are emitted from this file.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Provenance                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One row per ingested upstream dataset / release.
 * Every knowledge row points back at the source it was derived from so that
 * licensing and provenance can always be answered from the database itself.
 */
export const sources = pgTable(
  "sources",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    version: text("version"),
    license: text("license").notNull(),
    licenseUrl: text("license_url"),
    sourceUrl: text("source_url"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    checksum: text("checksum"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sources_code_version_key").on(table.code, table.version)],
);

/* -------------------------------------------------------------------------- */
/* Kanji                                                                      */
/* -------------------------------------------------------------------------- */

export const kanji = pgTable(
  "kanji",
  {
    id: serial("id").primaryKey(),
    /** The kanji literal, e.g. 語 */
    literal: text("literal").notNull(),
    /** Unicode codepoint, e.g. U+8A9E */
    codepoint: text("codepoint"),
    strokeCount: integer("stroke_count"),
    /** Japanese school grade (1-6, 8 = secondary, 9 = jinmeiyou) */
    grade: integer("grade"),
    /** KANJIDIC2 frequency rank (1 = most frequent) */
    frequency: integer("frequency"),
    /** Mapped JLPT level 5 (N5) .. 1 (N1), nullable when unknown */
    jlptLevel: integer("jlpt_level"),
    /** Legacy KANJIDIC2 JLPT level 1..4 (1 = hardest) */
    jlptLegacyLevel: integer("jlpt_legacy_level"),
    /** Kangxi / classical radical number */
    radicalNumber: integer("radical_number"),
    /** Heisig "Remembering the Kanji" index when present */
    heisigIndex: integer("heisig_index"),
    skipCode: text("skip_code"),
    sourceId: integer("source_id").references(() => sources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("kanji_literal_key").on(table.literal),
    index("kanji_jlpt_idx").on(table.jlptLevel),
    index("kanji_freq_idx").on(table.frequency),
  ],
);

export const kanjiMeanings = pgTable(
  "kanji_meanings",
  {
    id: serial("id").primaryKey(),
    kanjiId: integer("kanji_id")
      .notNull()
      .references(() => kanji.id, { onDelete: "cascade" }),
    meaning: text("meaning").notNull(),
    /** ISO 639-1 language code (en, fr, es, de, ...) */
    lang: text("lang").notNull().default("en"),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    index("kanji_meanings_kanji_idx").on(table.kanjiId),
    index("kanji_meanings_meaning_idx").on(table.meaning),
    uniqueIndex("kanji_meanings_unique").on(table.kanjiId, table.lang, table.position),
  ],
);

export const kanjiReadings = pgTable(
  "kanji_readings",
  {
    id: serial("id").primaryKey(),
    kanjiId: integer("kanji_id")
      .notNull()
      .references(() => kanji.id, { onDelete: "cascade" }),
    reading: text("reading").notNull(),
    /** ja_on | ja_kun | nanori | pinyin | korean_r */
    readingType: text("reading_type").notNull(),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    index("kanji_readings_kanji_idx").on(table.kanjiId),
    index("kanji_readings_reading_idx").on(table.reading),
    uniqueIndex("kanji_readings_unique").on(table.kanjiId, table.readingType, table.position),
  ],
);

/* -------------------------------------------------------------------------- */
/* Radicals                                                                   */
/* -------------------------------------------------------------------------- */

export const radicals = pgTable(
  "radicals",
  {
    id: serial("id").primaryKey(),
    /** The radical glyph, e.g. 亻 (a Kangxi radical or an EDRDG decomposition part) */
    literal: text("literal").notNull(),
    strokeCount: integer("stroke_count"),
    /** Kangxi radical number when the glyph is a classical Kangxi radical */
    radicalNumber: integer("radical_number"),
    isKangxi: boolean("is_kangxi").notNull().default(false),
    meanings: jsonb("meanings").$type<string[]>(),
    sourceId: integer("source_id").references(() => sources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("radicals_literal_key").on(table.literal),
    index("radicals_kangxi_idx").on(table.isKangxi),
  ],
);

/** kanji -> radical membership (Kangxi radical + EDRDG multi-radical groups) */
export const kanjiRadicals = pgTable(
  "kanji_radicals",
  {
    id: serial("id").primaryKey(),
    kanjiId: integer("kanji_id")
      .notNull()
      .references(() => kanji.id, { onDelete: "cascade" }),
    radicalId: integer("radical_id")
      .notNull()
      .references(() => radicals.id, { onDelete: "cascade" }),
    /** true for the Kangxi / classical radical, false for secondary groups */
    isPrimary: boolean("is_primary").notNull().default(false),
    /** classical | nelson_c | radkfile */
    relation: text("relation").notNull().default("radkfile"),
    sourceId: integer("source_id").references(() => sources.id),
  },
  (table) => [
    uniqueIndex("kanji_radicals_unique").on(table.kanjiId, table.radicalId, table.relation),
    index("kanji_radicals_radical_idx").on(table.radicalId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Components (KRADFILE decomposition graph)                                  */
/* -------------------------------------------------------------------------- */

/**
 * A component is a glyph a kanji is decomposed into. A component is usually a
 * kanji in its own right (亜 -> 一, 口) but can also be a pure radical variant
 * (e.g. 亻) that has no KANJIDIC2 entry. `kanjiId` / `radicalId` link the
 * component back into the knowledge graph when such a record exists.
 */
export const components = pgTable(
  "components",
  {
    id: serial("id").primaryKey(),
    literal: text("literal").notNull(),
    strokeCount: integer("stroke_count"),
    /** kanji | radical_variant */
    kind: text("kind").notNull().default("radical_variant"),
    kanjiId: integer("kanji_id").references(() => kanji.id, { onDelete: "set null" }),
    radicalId: integer("radical_id").references(() => radicals.id, { onDelete: "set null" }),
    /** Number of kanji in the database that decompose into this component */
    usageCount: integer("usage_count").notNull().default(0),
    sourceId: integer("source_id").references(() => sources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("components_literal_key").on(table.literal),
    index("components_kanji_idx").on(table.kanjiId),
    index("components_usage_idx").on(table.usageCount),
  ],
);

/** kanji -> component (directed decomposition edge) */
export const kanjiComponents = pgTable(
  "kanji_components",
  {
    id: serial("id").primaryKey(),
    kanjiId: integer("kanji_id")
      .notNull()
      .references(() => kanji.id, { onDelete: "cascade" }),
    componentId: integer("component_id")
      .notNull()
      .references(() => components.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    sourceId: integer("source_id").references(() => sources.id),
  },
  (table) => [
    uniqueIndex("kanji_components_unique").on(table.kanjiId, table.componentId),
    index("kanji_components_component_idx").on(table.componentId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Vocabulary (dictionary head words)                                         */
/* -------------------------------------------------------------------------- */

export const vocabulary = pgTable(
  "vocabulary",
  {
    id: serial("id").primaryKey(),
    /** JMdict ent_seq (stable upstream id) */
    externalId: text("external_id"),
    /** Kanji writing, e.g. 日本語 */
    kanjiText: text("kanji_text").notNull(),
    /** Kana reading, e.g. にほんご */
    kanaText: text("kana_text"),
    meanings: jsonb("meanings").$type<string[]>().notNull().default([]),
    partsOfSpeech: jsonb("parts_of_speech").$type<string[]>().notNull().default([]),
    /** 1 = highest priority (news1/ichi1/spec1), larger = rarer */
    priority: integer("priority"),
    language: text("language").notNull().default("en"),
    sourceId: integer("source_id").references(() => sources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("vocabulary_external_key").on(table.externalId),
    index("vocabulary_kanji_text_idx").on(table.kanjiText),
    index("vocabulary_kana_text_idx").on(table.kanaText),
  ],
);

/** kanji -> vocabulary usage edge ("vocabulary that uses this kanji") */
export const kanjiVocabulary = pgTable(
  "kanji_vocabulary",
  {
    id: serial("id").primaryKey(),
    kanjiId: integer("kanji_id")
      .notNull()
      .references(() => kanji.id, { onDelete: "cascade" }),
    vocabularyId: integer("vocabulary_id")
      .notNull()
      .references(() => vocabulary.id, { onDelete: "cascade" }),
    /** 0-based index of the kanji inside the vocabulary kanjiText */
    position: integer("position").notNull().default(0),
    vocabularyPriority: integer("vocabulary_priority"),
  },
  (table) => [
    uniqueIndex("kanji_vocabulary_unique").on(table.kanjiId, table.vocabularyId),
    index("kanji_vocabulary_vocab_idx").on(table.vocabularyId),
  ],
);

/* -------------------------------------------------------------------------- */
/* ETL run bookkeeping                                                        */
/* -------------------------------------------------------------------------- */

export const etlRuns = pgTable("etl_runs", {
  id: serial("id").primaryKey(),
  pipeline: text("pipeline").notNull(),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  recordsRead: integer("records_read").notNull().default(0),
  recordsWritten: integer("records_written").notNull().default(0),
  message: text("message"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});
