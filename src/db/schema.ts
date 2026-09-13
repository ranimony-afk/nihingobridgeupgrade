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
/* Grammar                                                                    */
/* -------------------------------------------------------------------------- */

export const grammarPoints = pgTable(
  "grammar_points",
  {
    id: serial("id").primaryKey(),
    /** Stable URL slug, e.g. `te-shimau` */
    slug: text("slug").notNull(),
    /** Japanese name of the point, e.g. 〜てしまう */
    title: text("title").notNull(),
    /** Short English gloss, e.g. "to end up doing" */
    titleEn: text("title_en"),
    /** One-line summary shown in lists */
    summary: text("summary"),
    /** Long form explanation */
    explanation: text("explanation"),
    /** How the pattern is constructed */
    formation: text("formation"),
    /** Usage caveats / learner notes */
    notes: text("notes"),
    /** JLPT level 5 (N5) .. 1 (N1) */
    jlptLevel: integer("jlpt_level"),
    /** polite | casual | written | spoken | neutral */
    register: text("register").notNull().default("neutral"),
    /** 1..5 teaching order inside a level */
    sortOrder: integer("sort_order").notNull().default(100),
    exampleCount: integer("example_count").notNull().default(0),
    sourceId: integer("source_id").references(() => sources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("grammar_points_slug_key").on(table.slug),
    index("grammar_points_jlpt_idx").on(table.jlptLevel),
  ],
);

/**
 * Surface forms a grammar point appears as. `matchText` is the literal string
 * the ETL uses to harvest real example sentences from a corpus — the link
 * between a curated grammar entry and corpus evidence.
 */
export const grammarPatterns = pgTable(
  "grammar_patterns",
  {
    id: serial("id").primaryKey(),
    grammarPointId: integer("grammar_point_id")
      .notNull()
      .references(() => grammarPoints.id, { onDelete: "cascade" }),
    pattern: text("pattern").notNull(),
    matchText: text("match_text").notNull(),
    /** true for the canonical form, false for variants (〜ちゃう, 〜じゃう) */
    isCore: boolean("is_core").notNull().default(true),
    note: text("note"),
    position: integer("position").notNull().default(0),
    sourceId: integer("source_id").references(() => sources.id),
  },
  (table) => [
    uniqueIndex("grammar_patterns_unique").on(table.grammarPointId, table.pattern),
    index("grammar_patterns_match_idx").on(table.matchText),
  ],
);

/**
 * Example sentence (Japanese + English) harvested from a licensed corpus.
 * `grammarPointId` is the point it was harvested for; the same sentence may be
 * stored once per point.
 */
export const grammarExamples = pgTable(
  "grammar_examples",
  {
    id: serial("id").primaryKey(),
    grammarPointId: integer("grammar_point_id")
      .notNull()
      .references(() => grammarPoints.id, { onDelete: "cascade" }),
    japanese: text("japanese").notNull(),
    english: text("english").notNull(),
    /** Upstream sentence id, e.g. Tanaka `303697_100000` */
    externalId: text("external_id"),
    /** Characters of the Japanese sentence — used for ordering */
    length: integer("length").notNull().default(0),
    sourceId: integer("source_id").references(() => sources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("grammar_examples_unique").on(table.grammarPointId, table.externalId),
    index("grammar_examples_point_idx").on(table.grammarPointId),
  ],
);

/** Why an example was attached to a point (ETL evidence). */
export const grammarExampleMatches = pgTable(
  "grammar_example_matches",
  {
    id: serial("id").primaryKey(),
    exampleId: integer("example_id")
      .notNull()
      .references(() => grammarExamples.id, { onDelete: "cascade" }),
    grammarPointId: integer("grammar_point_id")
      .notNull()
      .references(() => grammarPoints.id, { onDelete: "cascade" }),
    grammarPatternId: integer("grammar_pattern_id").references(() => grammarPatterns.id, {
      onDelete: "set null",
    }),
    matchedText: text("matched_text").notNull(),
    startIndex: integer("start_index").notNull().default(0),
    endIndex: integer("end_index").notNull().default(0),
  },
  (table) => [
    index("grammar_example_matches_example_idx").on(table.exampleId),
    uniqueIndex("grammar_example_matches_unique").on(
      table.exampleId,
      table.matchedText,
      table.startIndex,
    ),
  ],
);

export const grammarTags = pgTable(
  "grammar_tags",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    description: text("description"),
  },
  (table) => [uniqueIndex("grammar_tags_slug_key").on(table.slug)],
);

export const grammarPointTags = pgTable(
  "grammar_point_tags",
  {
    id: serial("id").primaryKey(),
    grammarPointId: integer("grammar_point_id")
      .notNull()
      .references(() => grammarPoints.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => grammarTags.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("grammar_point_tags_unique").on(table.grammarPointId, table.tagId)],
);

/** prerequisite | similar | contrast | related | variant */
export const grammarRelations = pgTable(
  "grammar_relations",
  {
    id: serial("id").primaryKey(),
    fromPointId: integer("from_point_id")
      .notNull()
      .references(() => grammarPoints.id, { onDelete: "cascade" }),
    toPointId: integer("to_point_id")
      .notNull()
      .references(() => grammarPoints.id, { onDelete: "cascade" }),
    relation: text("relation").notNull(),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("grammar_relations_unique").on(table.fromPointId, table.toPointId, table.relation),
    index("grammar_relations_to_idx").on(table.toPointId),
  ],
);

/** Grammar point -> kanji appearing in its patterns / examples. */
export const grammarPointKanji = pgTable(
  "grammar_point_kanji",
  {
    id: serial("id").primaryKey(),
    grammarPointId: integer("grammar_point_id")
      .notNull()
      .references(() => grammarPoints.id, { onDelete: "cascade" }),
    kanjiId: integer("kanji_id")
      .notNull()
      .references(() => kanji.id, { onDelete: "cascade" }),
    /** pattern | example */
    via: text("via").notNull().default("example"),
  },
  (table) => [
    uniqueIndex("grammar_point_kanji_unique").on(table.grammarPointId, table.kanjiId, table.via),
    index("grammar_point_kanji_kanji_idx").on(table.kanjiId),
  ],
);

/** Grammar point -> dictionary entry that realises the pattern. */
export const grammarPointVocabulary = pgTable(
  "grammar_point_vocabulary",
  {
    id: serial("id").primaryKey(),
    grammarPointId: integer("grammar_point_id")
      .notNull()
      .references(() => grammarPoints.id, { onDelete: "cascade" }),
    vocabularyId: integer("vocabulary_id")
      .notNull()
      .references(() => vocabulary.id, { onDelete: "cascade" }),
    /** pattern | example */
    via: text("via").notNull().default("pattern"),
  },
  (table) => [
    uniqueIndex("grammar_point_vocabulary_unique").on(
      table.grammarPointId,
      table.vocabularyId,
      table.via,
    ),
    index("grammar_point_vocabulary_vocab_idx").on(table.vocabularyId),
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
