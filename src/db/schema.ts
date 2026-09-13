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

/**
 * Ordered structural slots of a point ("[V-て] + しまう"), i.e. the schematic
 * view that complements the free-text `formation` column.
 */
export const grammarStructures = pgTable(
  "grammar_structures",
  {
    id: serial("id").primaryKey(),
    grammarPointId: integer("grammar_point_id")
      .notNull()
      .references(() => grammarPoints.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    label: text("label").notNull(),
    content: text("content").notNull(),
    required: boolean("required").notNull().default(true),
    note: text("note"),
    sourceId: integer("source_id").references(() => sources.id),
  },
  (table) => [
    uniqueIndex("grammar_structures_unique").on(table.grammarPointId, table.position),
    index("grammar_structures_point_idx").on(table.grammarPointId),
  ],
);

/**
 * Frequent learner errors for a point: the wrong sentence, the corrected form
 * and why. Project-curated content (CC BY-SA 4.0), never corpus-derived.
 */
export const grammarMistakes = pgTable(
  "grammar_mistakes",
  {
    id: serial("id").primaryKey(),
    grammarPointId: integer("grammar_point_id")
      .notNull()
      .references(() => grammarPoints.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    incorrect: text("incorrect").notNull(),
    correction: text("correction").notNull(),
    explanation: text("explanation").notNull(),
    /** common | subtle | critical */
    severity: text("severity").notNull().default("common"),
    sourceId: integer("source_id").references(() => sources.id),
  },
  (table) => [
    uniqueIndex("grammar_mistakes_unique").on(table.grammarPointId, table.incorrect),
    index("grammar_mistakes_point_idx").on(table.grammarPointId),
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
/* Sentences                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Canonical Japanese/English sentence corpus. Grammar examples may point to a
 * sentence, but the sentence remains independently searchable and routable.
 */
export const sentences = pgTable(
  "sentences",
  {
    id: serial("id").primaryKey(),
    externalId: text("external_id"),
    japanese: text("japanese").notNull(),
    english: text("english").notNull(),
    length: integer("length").notNull().default(0),
    jlptLevel: integer("jlpt_level"),
    sourceId: integer("source_id").references(() => sources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sentences_external_key").on(table.externalId),
    index("sentences_jlpt_idx").on(table.jlptLevel),
    index("sentences_length_idx").on(table.length),
  ],
);

/** Sentence -> grammar point evidence edge. */
export const sentenceGrammarPoints = pgTable(
  "sentence_grammar_points",
  {
    id: serial("id").primaryKey(),
    sentenceId: integer("sentence_id")
      .notNull()
      .references(() => sentences.id, { onDelete: "cascade" }),
    grammarPointId: integer("grammar_point_id")
      .notNull()
      .references(() => grammarPoints.id, { onDelete: "cascade" }),
    grammarPatternId: integer("grammar_pattern_id").references(() => grammarPatterns.id, {
      onDelete: "set null",
    }),
    matchedText: text("matched_text"),
    startIndex: integer("start_index"),
    endIndex: integer("end_index"),
  },
  (table) => [
    uniqueIndex("sentence_grammar_points_unique").on(table.sentenceId, table.grammarPointId),
    index("sentence_grammar_points_point_idx").on(table.grammarPointId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Learning catalogue                                                         */
/* -------------------------------------------------------------------------- */

/** Searchable course catalogue. Learning progress is owned by later phases. */
export const courses = pgTable(
  "courses",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    titleJa: text("title_ja"),
    summary: text("summary").notNull(),
    description: text("description"),
    jlptLevel: integer("jlpt_level"),
    difficulty: text("difficulty").notNull().default("beginner"),
    position: integer("position").notNull().default(0),
    published: boolean("published").notNull().default(false),
    sourceId: integer("source_id").references(() => sources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("courses_slug_key").on(table.slug),
    index("courses_published_level_idx").on(table.published, table.jlptLevel),
  ],
);

/** Ordered sections inside a course. */
export const courseModules = pgTable(
  "course_modules",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    titleJa: text("title_ja"),
    summary: text("summary"),
    position: integer("position").notNull().default(0),
    published: boolean("published").notNull().default(false),
    sourceId: integer("source_id").references(() => sources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("course_modules_slug_key").on(table.slug),
    uniqueIndex("course_modules_course_position_key").on(table.courseId, table.position),
    index("course_modules_course_idx").on(table.courseId),
  ],
);

/** Lessons belong to exactly one canonical course and, once structured, a module. */
export const lessons = pgTable(
  "lessons",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    moduleId: integer("module_id").references(() => courseModules.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    titleJa: text("title_ja"),
    summary: text("summary").notNull(),
    objectives: jsonb("objectives").$type<string[]>().notNull().default([]),
    content: text("content"),
    jlptLevel: integer("jlpt_level"),
    position: integer("position").notNull().default(0),
    estimatedMinutes: integer("estimated_minutes").notNull().default(10),
    published: boolean("published").notNull().default(false),
    sourceId: integer("source_id").references(() => sources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lessons_slug_key").on(table.slug),
    uniqueIndex("lessons_course_position_key").on(table.courseId, table.position),
    index("lessons_course_idx").on(table.courseId),
    index("lessons_module_idx").on(table.moduleId),
    index("lessons_published_level_idx").on(table.published, table.jlptLevel),
  ],
);

/* -------------------------------------------------------------------------- */
/* Lesson architecture                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Ordered sections inside a lesson. A section is the teaching stage
 * (concept -> grammar -> kanji -> examples -> summary), not a content block.
 */
export const lessonSections = pgTable(
  "lesson_sections",
  {
    id: serial("id").primaryKey(),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    /** Stable key inside the lesson, e.g. `concept`, `grammar`, `examples` */
    key: text("key").notNull(),
    /** concept | grammar | kanji | vocabulary | examples | practice | summary */
    kind: text("kind").notNull().default("concept"),
    title: text("title").notNull(),
    titleJa: text("title_ja"),
    summary: text("summary"),
    position: integer("position").notNull().default(0),
    published: boolean("published").notNull().default(true),
    sourceId: integer("source_id").references(() => sources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lesson_sections_key_unique").on(table.lessonId, table.key),
    uniqueIndex("lesson_sections_position_unique").on(table.lessonId, table.position),
    index("lesson_sections_lesson_idx").on(table.lessonId),
  ],
);

/**
 * Ordered content blocks inside a section.
 *
 * A block either carries authored prose (`body`) or references canonical
 * knowledge (grammar point, kanji, vocabulary, sentence). Knowledge facts are
 * never copied into the block — only referenced — so a lesson can never drift
 * from the knowledge base.
 */
export const lessonBlocks = pgTable(
  "lesson_blocks",
  {
    id: serial("id").primaryKey(),
    sectionId: integer("section_id")
      .notNull()
      .references(() => lessonSections.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    /** text | objective | tip | warning | checkpoint | grammar_ref | kanji_ref | vocabulary_ref | sentence_ref */
    kind: text("kind").notNull(),
    title: text("title"),
    body: text("body"),
    grammarPointId: integer("grammar_point_id").references(() => grammarPoints.id, {
      onDelete: "cascade",
    }),
    kanjiId: integer("kanji_id").references(() => kanji.id, { onDelete: "cascade" }),
    vocabularyId: integer("vocabulary_id").references(() => vocabulary.id, {
      onDelete: "cascade",
    }),
    sentenceId: integer("sentence_id").references(() => sentences.id, { onDelete: "cascade" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    sourceId: integer("source_id").references(() => sources.id),
  },
  (table) => [
    uniqueIndex("lesson_blocks_position_unique").on(table.sectionId, table.position),
    index("lesson_blocks_lesson_idx").on(table.lessonId),
    index("lesson_blocks_kind_idx").on(table.kind),
    index("lesson_blocks_grammar_idx").on(table.grammarPointId),
    index("lesson_blocks_kanji_idx").on(table.kanjiId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Exercise engine                                                            */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Question bank (generic engine)                                             */
/* -------------------------------------------------------------------------- */

/**
 * THE canonical, source-agnostic question bank.
 *
 * Phase 09.4 introduced lesson `exercises`. Phase 10.1 generalises that into one
 * bank so lessons, quizzes and JLPT tests all draw from the same questions and
 * share a single grading implementation. `exercises` is now a lesson-scoped
 * *placement* of a bank question (`exercises.question_id`), not a second model.
 *
 * Correct answers live in `question_options.is_correct` and
 * `questions.accepted_answers`; both are stripped from every public payload and
 * grading only ever happens server-side.
 */
export const questions = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    /** Stable, regenerable identity, e.g. `kanji-reading:語` */
    sourceKey: text("source_key").notNull(),
    /** lesson_exercise | generated | curated */
    origin: text("origin").notNull().default("generated"),
    /** grammar | kanji | vocabulary | reading */
    skill: text("skill").notNull(),
    /** multiple_choice | cloze | reading | meaning */
    kind: text("kind").notNull(),
    /** option | text */
    answerMode: text("answer_mode").notNull().default("option"),
    prompt: text("prompt").notNull(),
    promptJa: text("prompt_ja"),
    instructions: text("instructions"),
    explanation: text("explanation"),
    /** JLPT level 5 (N5) .. 1 (N1); null when unlevelled */
    jlptLevel: integer("jlpt_level"),
    /** 1 = recall, 2 = apply, 3 = discriminate */
    difficulty: integer("difficulty").notNull().default(1),
    points: integer("points").notNull().default(1),
    /** Normalised answers accepted when `answer_mode = 'text'` */
    acceptedAnswers: jsonb("accepted_answers").$type<string[]>(),
    grammarPointId: integer("grammar_point_id").references(() => grammarPoints.id, {
      onDelete: "cascade",
    }),
    kanjiId: integer("kanji_id").references(() => kanji.id, { onDelete: "cascade" }),
    vocabularyId: integer("vocabulary_id").references(() => vocabulary.id, {
      onDelete: "cascade",
    }),
    sentenceId: integer("sentence_id").references(() => sentences.id, { onDelete: "cascade" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    active: boolean("active").notNull().default(true),
    sourceId: integer("source_id").references(() => sources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("questions_source_key_unique").on(table.sourceKey),
    index("questions_skill_idx").on(table.skill),
    index("questions_level_idx").on(table.jlptLevel),
    index("questions_active_skill_level_idx").on(table.active, table.skill, table.jlptLevel),
  ],
);

/** Answer choices. Exactly one option per question must be correct. */
export const questionOptions = pgTable(
  "question_options",
  {
    id: serial("id").primaryKey(),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    label: text("label").notNull(),
    subLabel: text("sub_label"),
    isCorrect: boolean("is_correct").notNull().default(false),
    feedback: text("feedback"),
  },
  (table) => [
    uniqueIndex("question_options_position_unique").on(table.questionId, table.position),
    index("question_options_question_idx").on(table.questionId),
  ],
);

/**
 * A gradeable exercise belonging to one lesson (and usually its `practice`
 * section).
 *
 * Since 10.1 this is a *placement* of a canonical bank question: `question_id`
 * points at `questions`, and grading is delegated to the generic engine. The
 * legacy answer columns remain for backward compatibility but the bank is the
 * source of truth.
 */
export const exercises = pgTable(
  "exercises",
  {
    id: serial("id").primaryKey(),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    sectionId: integer("section_id").references(() => lessonSections.id, {
      onDelete: "set null",
    }),
    /** Canonical bank question this placement renders and grades against. */
    questionId: integer("question_id").references(() => questions.id, { onDelete: "set null" }),
    /** Stable key inside the lesson, e.g. `grammar-meaning-1` */
    key: text("key").notNull(),
    /** multiple_choice | cloze | reading | meaning */
    kind: text("kind").notNull(),
    /** option | text */
    answerMode: text("answer_mode").notNull().default("option"),
    prompt: text("prompt").notNull(),
    promptJa: text("prompt_ja"),
    instructions: text("instructions"),
    explanation: text("explanation"),
    /** 1 = recall, 2 = apply, 3 = discriminate */
    difficulty: integer("difficulty").notNull().default(1),
    position: integer("position").notNull().default(0),
    points: integer("points").notNull().default(1),
    /** Answers accepted for `answer_mode = 'text'` (already normalised) */
    acceptedAnswers: jsonb("accepted_answers").$type<string[]>(),
    grammarPointId: integer("grammar_point_id").references(() => grammarPoints.id, {
      onDelete: "cascade",
    }),
    kanjiId: integer("kanji_id").references(() => kanji.id, { onDelete: "cascade" }),
    vocabularyId: integer("vocabulary_id").references(() => vocabulary.id, {
      onDelete: "cascade",
    }),
    sentenceId: integer("sentence_id").references(() => sentences.id, { onDelete: "cascade" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    sourceId: integer("source_id").references(() => sources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("exercises_lesson_key_unique").on(table.lessonId, table.key),
    uniqueIndex("exercises_lesson_position_unique").on(table.lessonId, table.position),
    index("exercises_lesson_idx").on(table.lessonId),
    index("exercises_section_idx").on(table.sectionId),
    index("exercises_kind_idx").on(table.kind),
  ],
);

/** Answer choices. Exactly one option per exercise must be correct. */
export const exerciseOptions = pgTable(
  "exercise_options",
  {
    id: serial("id").primaryKey(),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    label: text("label").notNull(),
    subLabel: text("sub_label"),
    isCorrect: boolean("is_correct").notNull().default(false),
    feedback: text("feedback"),
  },
  (table) => [
    uniqueIndex("exercise_options_position_unique").on(table.exerciseId, table.position),
    index("exercise_options_exercise_idx").on(table.exerciseId),
  ],
);

/** Lesson-level sequencing graph (must stay acyclic). */
export const lessonPrerequisites = pgTable(
  "lesson_prerequisites",
  {
    id: serial("id").primaryKey(),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    prerequisiteLessonId: integer("prerequisite_lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    required: boolean("required").notNull().default(true),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("lesson_prerequisites_unique").on(table.lessonId, table.prerequisiteLessonId),
    index("lesson_prerequisites_reverse_idx").on(table.prerequisiteLessonId),
  ],
);

export const coursePrerequisites = pgTable(
  "course_prerequisites",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    prerequisiteCourseId: integer("prerequisite_course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    required: boolean("required").notNull().default(true),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("course_prerequisites_unique").on(table.courseId, table.prerequisiteCourseId),
    index("course_prerequisites_reverse_idx").on(table.prerequisiteCourseId),
  ],
);

export const courseTags = pgTable(
  "course_tags",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
  },
  (table) => [uniqueIndex("course_tags_slug_key").on(table.slug)],
);

export const courseTagLinks = pgTable(
  "course_tag_links",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => courseTags.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("course_tag_links_unique").on(table.courseId, table.tagId)],
);

/** Explicit knowledge requirements taught by a lesson. */
export const lessonGrammarPoints = pgTable(
  "lesson_grammar_points",
  {
    id: serial("id").primaryKey(),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    grammarPointId: integer("grammar_point_id")
      .notNull()
      .references(() => grammarPoints.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    uniqueIndex("lesson_grammar_points_unique").on(table.lessonId, table.grammarPointId),
    index("lesson_grammar_points_point_idx").on(table.grammarPointId),
  ],
);

export const lessonKanji = pgTable(
  "lesson_kanji",
  {
    id: serial("id").primaryKey(),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    kanjiId: integer("kanji_id")
      .notNull()
      .references(() => kanji.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    uniqueIndex("lesson_kanji_unique").on(table.lessonId, table.kanjiId),
    index("lesson_kanji_kanji_idx").on(table.kanjiId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Identity & progress                                                        */
/* -------------------------------------------------------------------------- */

/**
 * THE canonical user table.
 *
 * Phase 09.5 needs an owner for progress but no authentication system exists
 * yet, so learners start as anonymous device identities. A later auth phase
 * MUST attach credentials (email, password hash, OAuth ids) to *this* table and
 * flip `is_anonymous`; it must not introduce a second user model.
 */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    /** Opaque id carried in the signed learner cookie */
    publicId: text("public_id").notNull(),
    displayName: text("display_name"),
    /** true until a future auth phase attaches credentials */
    isAnonymous: boolean("is_anonymous").notNull().default(true),
    locale: text("locale").notNull().default("en"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_public_id_key").on(table.publicId)],
);

/** Per-user, per-lesson progress. */
export const userLessonProgress = pgTable(
  "user_lesson_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    /** not_started | in_progress | completed */
    status: text("status").notNull().default("in_progress"),
    /** Section keys the learner has finished */
    completedSections: jsonb("completed_sections").$type<string[]>().notNull().default([]),
    sectionsTotal: integer("sections_total").notNull().default(0),
    /** Best exercise score recorded for this lesson */
    bestScore: integer("best_score").notNull().default(0),
    bestPercent: integer("best_percent").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_lesson_progress_unique").on(table.userId, table.lessonId),
    index("user_lesson_progress_user_idx").on(table.userId),
    index("user_lesson_progress_course_idx").on(table.userId, table.courseId),
  ],
);

/** Append-only exercise attempt log (the audit trail behind every score). */
export const userExerciseAttempts = pgTable(
  "user_exercise_attempts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    correct: boolean("correct").notNull(),
    awardedPoints: integer("awarded_points").notNull().default(0),
    /** What the learner submitted (option id or normalised text) */
    submitted: text("submitted"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("user_exercise_attempts_user_idx").on(table.userId),
    index("user_exercise_attempts_lesson_idx").on(table.userId, table.lessonId),
    index("user_exercise_attempts_exercise_idx").on(table.exerciseId),
  ],
);

/** Derived course rollup, refreshed whenever lesson progress changes. */
export const userCourseProgress = pgTable(
  "user_course_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonsCompleted: integer("lessons_completed").notNull().default(0),
    lessonsTotal: integer("lessons_total").notNull().default(0),
    percent: integer("percent").notNull().default(0),
    /** not_started | in_progress | completed */
    status: text("status").notNull().default("in_progress"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_course_progress_unique").on(table.userId, table.courseId),
    index("user_course_progress_user_idx").on(table.userId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Canonical, denormalised PostgreSQL search projection.
 *
 * Source domain tables remain authoritative. This table only projects their
 * searchable text into one stable contract. The search ETL soft-deactivates
 * stale rows and upserts current rows; it never deletes source knowledge.
 * PostgreSQL indexes (B-tree, GIN tsvector and pg_trgm) are created by
 * `scripts/search-indexes.sql` because expression/operator-class indexes are
 * not represented portably by Drizzle's schema DSL.
 */
export const searchDocuments = pgTable(
  "search_documents",
  {
    id: serial("id").primaryKey(),
    /** dictionary | kanji | grammar | sentence | course | lesson */
    entityType: text("entity_type").notNull(),
    /** Source table numeric primary key */
    entityId: integer("entity_id").notNull(),
    /** Stable source key: kanji literal, JMdict id, grammar slug */
    externalKey: text("external_key").notNull(),
    route: text("route").notNull(),
    /** Main display/search value (語, 日本語, 〜てしまう) */
    primaryText: text("primary_text").notNull(),
    /** Reading or short English label */
    secondaryText: text("secondary_text"),
    description: text("description"),
    /** Readings, surface patterns and alternate labels */
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
    /** Flattened corpus used by to_tsvector + trigram matching */
    searchText: text("search_text").notNull(),
    jlptLevel: integer("jlpt_level"),
    /** Lower values rank first when textual scores tie */
    priority: integer("priority").notNull().default(1000),
    active: boolean("active").notNull().default(true),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("search_documents_entity_key").on(table.entityType, table.externalKey),
    index("search_documents_type_active_idx").on(table.entityType, table.active),
    index("search_documents_jlpt_idx").on(table.jlptLevel),
    index("search_documents_priority_idx").on(table.priority),
    index("search_documents_primary_idx").on(table.primaryText),
    index("search_documents_secondary_idx").on(table.secondaryText),
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
