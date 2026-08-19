/**
 * NihongoBridge — Canonical Schema
 *
 * Phase 2, P09: Canonical knowledge tables (dictionary, kanji, grammar, sentences, provenance).
 * Phase 2, P10: Learning schema (courses, modules, lessons, items, content).
 *
 * These tables coexist with any existing kg_* tables.
 * DO NOT remove kg_* tables if they exist — they are Repo A originals.
 *
 * Design conventions (matching Repo A production patterns):
 *   - text PK (application-generated IDs)
 *   - timestamps with timezone
 *   - JSONB for flexible structured data
 *   - provenance via source_provenance table + per-row source columns
 *   - indexes declared explicitly
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─────────────────────────────────────────────
// PROVENANCE
// ─────────────────────────────────────────────

/** Tracks every data source used for ETL imports. */
export const sourceProvenance = pgTable("source_provenance", {
  id: text("id").primaryKey(),
  /** Human name: "jmdict", "kanjidic2", "tatoeba", etc. */
  name: varchar("name", { length: 100 }).notNull(),
  /** Version of the source dataset, e.g. "2024-07-01" */
  version: varchar("version", { length: 100 }).notNull(),
  /** SPDX license identifier or description */
  license: varchar("license", { length: 200 }).notNull(),
  /** URL to the source */
  url: text("url"),
  /** Version of the ETL pipeline that performed the import */
  importPipelineVersion: varchar("import_pipeline_version", { length: 100 }),
  /** Number of records imported in the most recent run */
  lastImportCount: integer("last_import_count"),
  /** Status of most recent import */
  lastImportStatus: varchar("last_import_status", { length: 50 }),
  lastImportedAt: timestamp("last_imported_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// DICTIONARY
// ─────────────────────────────────────────────

/** Core dictionary entries — one per JMdict ent_seq or equivalent. */
export const dictionaryEntries = pgTable(
  "dictionary_entries",
  {
    id: text("id").primaryKey(),

    // Provenance columns (denormalized for query speed)
    source: varchar("source", { length: 50 }).notNull(), // "jmdict"
    sourceId: varchar("source_id", { length: 100 }).notNull(), // ent_seq
    sourceVersion: varchar("source_version", { length: 100 }).notNull(),
    importVersion: varchar("import_version", { length: 100 }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),

    /** Primary written form (kanji or kana) */
    headword: varchar("headword", { length: 300 }).notNull(),
    /** Primary kana reading */
    reading: varchar("reading", { length: 300 }).notNull(),
    /** Common word flag (nf01-nf48 in JMdict) */
    isCommon: boolean("is_common").notNull().default(false),
    /** JLPT level 1-5, NULL if unclassified */
    jlptLevel: smallint("jlpt_level"),
    /** Frequency rank from corpus data */
    frequencyRank: integer("frequency_rank"),
    /** Primary parts of speech */
    pos: text("pos").array(),
    /** Checksum of source record for idempotent upsert */
    checksum: varchar("checksum", { length: 64 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("dict_entries_source_id_idx").on(table.source, table.sourceId),
    index("dict_entries_headword_idx").on(table.headword),
    index("dict_entries_reading_idx").on(table.reading),
    index("dict_entries_jlpt_idx").on(table.jlptLevel),
    index("dict_entries_common_idx").on(table.isCommon),
  ],
);

/** One sense = one meaning group within an entry. */
export const dictionarySenses = pgTable(
  "dictionary_senses",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id")
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: "cascade" }),
    /** Order within the entry (0-based) */
    position: smallint("position").notNull(),
    /**
     * Glosses keyed by language:
     * { "en": ["meaning1", "meaning2"], "de": ["Bedeutung"] }
     */
    glosses: jsonb("glosses").notNull(),
    /** Parts of speech specific to this sense */
    pos: text("pos").array(),
    /** Field of application tags */
    field: text("field").array(),
    /** Miscellaneous tags (uk, arch, etc.) */
    misc: text("misc").array(),
    /** Free-text additional info */
    info: text("info"),
    /** Dialect tags */
    dialect: text("dialect").array(),
  },
  (table) => [index("dict_senses_entry_idx").on(table.entryId)],
);

/** Alternative readings for a dictionary entry. */
export const dictionaryReadings = pgTable(
  "dictionary_readings",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id")
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: "cascade" }),
    /** Kana reading */
    reading: varchar("reading", { length: 300 }).notNull(),
    /** Whether this is the primary/preferred reading */
    isPrimary: boolean("is_primary").notNull().default(false),
    /** Kanji form restrictions (if reading applies only to specific kanji) */
    restrictions: text("restrictions").array(),
    /** Reading info tags */
    info: text("info").array(),
  },
  (table) => [
    index("dict_readings_entry_idx").on(table.entryId),
    index("dict_readings_reading_idx").on(table.reading),
  ],
);

// ─────────────────────────────────────────────
// KANJI
// ─────────────────────────────────────────────

/** Individual kanji characters with metadata. */
export const kanjiEntries = pgTable(
  "kanji_entries",
  {
    id: text("id").primaryKey(),

    // Provenance
    source: varchar("source", { length: 50 }).notNull(), // "kanjidic2"
    sourceId: varchar("source_id", { length: 100 }).notNull(),
    sourceVersion: varchar("source_version", { length: 100 }).notNull(),
    importVersion: varchar("import_version", { length: 100 }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),

    /** The kanji character itself (e.g. "食") */
    character: varchar("character", { length: 5 }).notNull().unique(),
    /** Unicode codepoint (e.g. "U+98DF") */
    unicodeCodepoint: varchar("unicode_codepoint", { length: 10 }).notNull(),
    /** Total stroke count */
    strokeCount: smallint("stroke_count").notNull(),
    /** Japanese school grade (1-10, NULL if ungraded) */
    grade: smallint("grade"),
    /** JLPT level 1-5 */
    jlptLevel: smallint("jlpt_level"),
    /** Frequency rank in newspapers */
    frequencyRank: integer("frequency_rank"),
    /** English meanings */
    meanings: text("meanings").array().notNull(),
    /** On'yomi readings in katakana */
    onReadings: text("on_readings").array(),
    /** Kun'yomi readings in hiragana */
    kunReadings: text("kun_readings").array(),
    /** Name readings (nanori) */
    nanori: text("nanori").array(),
    /** Kangxi radical number */
    radicalNumber: smallint("radical_number"),
    /** Checksum for idempotent upsert */
    checksum: varchar("checksum", { length: 64 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("kanji_entries_source_id_idx").on(table.source, table.sourceId),
    index("kanji_entries_jlpt_idx").on(table.jlptLevel),
    index("kanji_entries_grade_idx").on(table.grade),
    index("kanji_entries_strokes_idx").on(table.strokeCount),
  ],
);

/** On/kun/nanori readings stored as separate rows for query flexibility. */
export const kanjiReadings = pgTable(
  "kanji_readings",
  {
    id: text("id").primaryKey(),
    kanjiId: text("kanji_id")
      .notNull()
      .references(() => kanjiEntries.id, { onDelete: "cascade" }),
    /** "on", "kun", or "nanori" */
    kind: varchar("kind", { length: 10 }).notNull(),
    /** The reading in kana */
    reading: varchar("reading", { length: 100 }).notNull(),
  },
  (table) => [
    index("kanji_readings_kanji_idx").on(table.kanjiId),
    index("kanji_readings_reading_idx").on(table.reading),
  ],
);

/** Radicals and kanji sub-components. */
export const kanjiComponents = pgTable(
  "kanji_components",
  {
    id: text("id").primaryKey(),
    /** The radical/component character */
    character: varchar("character", { length: 10 }).notNull().unique(),
    /** Kangxi radical number (1-214) if applicable */
    kangxiNumber: smallint("kangxi_number"),
    /** Stroke count */
    strokeCount: smallint("stroke_count").notNull(),
    /** English meaning */
    meaning: varchar("meaning", { length: 200 }),
    /** Japanese reading */
    reading: varchar("reading", { length: 100 }),
    /** Visual variants of the same radical */
    variants: text("variants").array(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("kanji_components_kangxi_idx").on(table.kangxiNumber)],
);

/** Junction table: which components appear in which kanji. */
export const kanjiComponentLinks = pgTable(
  "kanji_component_links",
  {
    id: text("id").primaryKey(),
    kanjiId: text("kanji_id")
      .notNull()
      .references(() => kanjiEntries.id, { onDelete: "cascade" }),
    componentId: text("component_id")
      .notNull()
      .references(() => kanjiComponents.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("kanji_comp_link_unique").on(table.kanjiId, table.componentId),
  ],
);

// ─────────────────────────────────────────────
// GRAMMAR
// ─────────────────────────────────────────────

/** Japanese grammar patterns/points. */
export const grammarPatterns = pgTable(
  "grammar_patterns",
  {
    id: text("id").primaryKey(),

    // Provenance
    source: varchar("source", { length: 50 }).notNull(),
    sourceId: varchar("source_id", { length: 100 }).notNull(),
    sourceVersion: varchar("source_version", { length: 100 }).notNull(),
    importVersion: varchar("import_version", { length: 100 }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),

    /** Slug for URL (e.g. "te-kara") */
    slug: varchar("slug", { length: 200 }).notNull().unique(),
    /** Display title (e.g. "〜てから") */
    title: varchar("title", { length: 300 }).notNull(),
    /** Japanese title if different */
    titleJa: varchar("title_ja", { length: 300 }),
    /** JLPT level 1-5 */
    jlptLevel: smallint("jlpt_level"),
    /** Grammatical structure pattern (e.g. "Verb て-form + から") */
    structure: text("structure").notNull(),
    /** Brief English meaning */
    meaning: varchar("meaning", { length: 500 }).notNull(),
    /** Detailed explanation (Markdown) */
    explanation: text("explanation").notNull(),
    /** Additional usage notes */
    notes: text("notes"),
    /** Formation rules */
    formation: text("formation"),
    /** Difficulty rating 1-5 */
    difficulty: smallint("difficulty"),
    /** Categorization tags */
    tags: text("tags").array(),
    /** Checksum for idempotent upsert */
    checksum: varchar("checksum", { length: 64 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("grammar_patterns_source_id_idx").on(table.source, table.sourceId),
    index("grammar_patterns_jlpt_idx").on(table.jlptLevel),
    index("grammar_patterns_title_idx").on(table.title),
  ],
);

/** Example sentences illustrating a grammar pattern. */
export const grammarExamples = pgTable(
  "grammar_examples",
  {
    id: text("id").primaryKey(),
    grammarId: text("grammar_id")
      .notNull()
      .references(() => grammarPatterns.id, { onDelete: "cascade" }),
    /** Japanese example sentence */
    ja: text("ja").notNull(),
    /** English translation */
    en: text("en").notNull(),
    /** Position/order */
    position: smallint("position").notNull().default(0),
  },
  (table) => [index("grammar_examples_grammar_idx").on(table.grammarId)],
);

// ─────────────────────────────────────────────
// SENTENCES
// ─────────────────────────────────────────────

/** Example sentences with provenance. */
export const sentences = pgTable(
  "sentences",
  {
    id: text("id").primaryKey(),

    // Provenance
    source: varchar("source", { length: 50 }).notNull(), // "tatoeba"
    sourceId: varchar("source_id", { length: 100 }).notNull(),
    sourceVersion: varchar("source_version", { length: 100 }).notNull(),
    importVersion: varchar("import_version", { length: 100 }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),

    /** Japanese text */
    japanese: text("japanese").notNull(),
    /** Full kana reading (furigana-expanded) */
    reading: text("reading"),
    /** JLPT level if classifiable */
    jlptLevel: smallint("jlpt_level"),
    /** Audio reference (URL or asset ID) */
    audioRef: text("audio_ref"),
    /** Checksum for idempotent upsert */
    checksum: varchar("checksum", { length: 64 }),
    /** FK to grammar pattern (optional — sentence may illustrate a grammar point) */
    grammarPatternId: text("grammar_pattern_id").references(() => grammarPatterns.id, {
      onDelete: "set null",
    }),
    /** FK to dictionary entry (optional — sentence may be an example for a word) */
    dictionaryEntryId: text("dictionary_entry_id").references(() => dictionaryEntries.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sentences_source_id_idx").on(table.source, table.sourceId),
    index("sentences_jlpt_idx").on(table.jlptLevel),
    index("sentences_grammar_idx").on(table.grammarPatternId),
    index("sentences_dict_idx").on(table.dictionaryEntryId),
  ],
);

/** Translations of sentences in various languages. */
export const sentenceTranslations = pgTable(
  "sentence_translations",
  {
    id: text("id").primaryKey(),
    sentenceId: text("sentence_id")
      .notNull()
      .references(() => sentences.id, { onDelete: "cascade" }),
    /** ISO 639-1 language code (e.g. "en", "de", "fr") */
    lang: varchar("lang", { length: 10 }).notNull(),
    /** Translation text */
    translation: text("translation").notNull(),
    /** Source of this specific translation */
    source: varchar("source", { length: 50 }),
  },
  (table) => [
    index("sentence_trans_sentence_idx").on(table.sentenceId),
    uniqueIndex("sentence_trans_lang_idx").on(table.sentenceId, table.lang),
  ],
);

// ─────────────────────────────────────────────
// RELATIONS (Drizzle relational query API)
// ─────────────────────────────────────────────

export const dictionaryEntriesRelations = relations(dictionaryEntries, ({ many }) => ({
  senses: many(dictionarySenses),
  readings: many(dictionaryReadings),
  sentences: many(sentences),
}));

export const dictionarySensesRelations = relations(dictionarySenses, ({ one }) => ({
  entry: one(dictionaryEntries, {
    fields: [dictionarySenses.entryId],
    references: [dictionaryEntries.id],
  }),
}));

export const dictionaryReadingsRelations = relations(dictionaryReadings, ({ one }) => ({
  entry: one(dictionaryEntries, {
    fields: [dictionaryReadings.entryId],
    references: [dictionaryEntries.id],
  }),
}));

export const kanjiEntriesRelations = relations(kanjiEntries, ({ many }) => ({
  readings: many(kanjiReadings),
  componentLinks: many(kanjiComponentLinks),
}));

export const kanjiReadingsRelations = relations(kanjiReadings, ({ one }) => ({
  kanji: one(kanjiEntries, {
    fields: [kanjiReadings.kanjiId],
    references: [kanjiEntries.id],
  }),
}));

export const kanjiComponentLinksRelations = relations(kanjiComponentLinks, ({ one }) => ({
  kanji: one(kanjiEntries, {
    fields: [kanjiComponentLinks.kanjiId],
    references: [kanjiEntries.id],
  }),
  component: one(kanjiComponents, {
    fields: [kanjiComponentLinks.componentId],
    references: [kanjiComponents.id],
  }),
}));

export const kanjiComponentsRelations = relations(kanjiComponents, ({ many }) => ({
  kanjiLinks: many(kanjiComponentLinks),
}));

export const grammarPatternsRelations = relations(grammarPatterns, ({ many }) => ({
  examples: many(grammarExamples),
  sentences: many(sentences),
}));

export const grammarExamplesRelations = relations(grammarExamples, ({ one }) => ({
  pattern: one(grammarPatterns, {
    fields: [grammarExamples.grammarId],
    references: [grammarPatterns.id],
  }),
}));

export const sentencesRelations = relations(sentences, ({ one, many }) => ({
  translations: many(sentenceTranslations),
  grammarPattern: one(grammarPatterns, {
    fields: [sentences.grammarPatternId],
    references: [grammarPatterns.id],
  }),
  dictionaryEntry: one(dictionaryEntries, {
    fields: [sentences.dictionaryEntryId],
    references: [dictionaryEntries.id],
  }),
}));

export const sentenceTranslationsRelations = relations(sentenceTranslations, ({ one }) => ({
  sentence: one(sentences, {
    fields: [sentenceTranslations.sentenceId],
    references: [sentences.id],
  }),
}));

// ═══════════════════════════════════════════════
// LEARNING DOMAIN (P10)
// ═══════════════════════════════════════════════

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

/** Course difficulty / target audience. */
export const courseLevelEnum = pgEnum("course_level", [
  "beginner",
  "elementary",
  "intermediate",
  "upper_intermediate",
  "advanced",
]);

/** Publication state for courses, modules, lessons. */
export const publishStatusEnum = pgEnum("publish_status", [
  "draft",
  "review",
  "published",
  "archived",
]);

/** What kind of lesson this is. */
export const lessonKindEnum = pgEnum("lesson_kind", [
  "lesson",
  "quiz",
  "practice",
  "reading",
  "listening",
  "story",
]);

/** Content item types within a lesson. */
export const lessonItemTypeEnum = pgEnum("lesson_item_type", [
  "text",
  "vocabulary",
  "grammar",
  "example",
  "exercise",
  "audio",
  "image",
  "video",
  "divider",
]);

/** Exercise / question types. */
export const exerciseTypeEnum = pgEnum("exercise_type", [
  "multiple_choice",
  "fill_blank",
  "matching",
  "ordering",
  "free_text",
  "select_translation",
  "type_answer",
  "listen_type",
  "sentence_build",
]);

// ─────────────────────────────────────────────
// COURSES
// ─────────────────────────────────────────────

/**
 * A course is the top-level learning container.
 * e.g. "JLPT N5 Complete", "Beginner Kanji", "Business Japanese".
 */
export const courses = pgTable(
  "courses",
  {
    id: text("id").primaryKey(),
    /** URL-safe slug */
    slug: varchar("slug", { length: 200 }).notNull().unique(),
    title: varchar("title", { length: 300 }).notNull(),
    /** Short description shown in listings */
    subtitle: text("subtitle"),
    /** Full description (Markdown) */
    description: text("description"),
    level: courseLevelEnum("level").notNull().default("beginner"),
    /** Target JLPT level, NULL if not JLPT-specific */
    jlptLevel: smallint("jlpt_level"),
    status: publishStatusEnum("status").notNull().default("draft"),
    /** Display order on the course catalog page */
    sortOrder: integer("sort_order").notNull().default(0),
    /** Cover image URL or asset ID */
    imageUrl: text("image_url"),
    /** Icon emoji or identifier for compact displays */
    icon: varchar("icon", { length: 20 }),
    /** Accent colour for the course card (hex) */
    color: varchar("color", { length: 20 }),
    /** Estimated total hours to complete */
    estimatedHours: real("estimated_hours"),
    /** ID of the author/creator (text FK — may point to identity_users or staff_users) */
    createdBy: text("created_by"),
    /** Tags for filtering */
    tags: text("tags").array(),
    /**
     * Prerequisite course IDs — advisory, not enforced by FK.
     * Stored as text[] to avoid circular FK issues.
     */
    prerequisites: text("prerequisites").array(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("courses_status_idx").on(table.status),
    index("courses_level_idx").on(table.level),
    index("courses_jlpt_idx").on(table.jlptLevel),
    index("courses_sort_idx").on(table.sortOrder),
  ],
);

// ─────────────────────────────────────────────
// COURSE MODULES
// ─────────────────────────────────────────────

/**
 * A module groups lessons within a course.
 * e.g. "Unit 1: Greetings", "Module 3: Particles".
 * Maps to Repo A's "units" concept.
 */
export const courseModules = pgTable(
  "course_modules",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    /** URL-safe slug (unique within course, enforced at app level) */
    slug: varchar("slug", { length: 200 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    subtitle: text("subtitle"),
    description: text("description"),
    /** Icon emoji or identifier */
    icon: varchar("icon", { length: 20 }),
    /** Accent colour (hex) */
    color: varchar("color", { length: 20 }),
    /** Order within the course */
    sortOrder: integer("sort_order").notNull().default(0),
    status: publishStatusEnum("status").notNull().default("draft"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("course_modules_course_idx").on(table.courseId),
    index("course_modules_sort_idx").on(table.courseId, table.sortOrder),
    uniqueIndex("course_modules_slug_idx").on(table.courseId, table.slug),
  ],
);

// ─────────────────────────────────────────────
// LESSONS
// ─────────────────────────────────────────────

/**
 * A lesson is an individual learning session within a module.
 * Contains ordered lesson_items that define the content flow.
 */
export const lessons = pgTable(
  "lessons",
  {
    id: text("id").primaryKey(),
    moduleId: text("module_id")
      .notNull()
      .references(() => courseModules.id, { onDelete: "cascade" }),
    /** URL-safe slug (unique within module, enforced at app level) */
    slug: varchar("slug", { length: 200 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    /** Brief summary shown in lesson lists */
    summary: text("summary"),
    kind: lessonKindEnum("kind").notNull().default("lesson"),
    /** Order within the module */
    sortOrder: integer("sort_order").notNull().default(0),
    status: publishStatusEnum("status").notNull().default("draft"),
    /** XP awarded on first completion */
    xpReward: integer("xp_reward").notNull().default(10),
    /** Estimated minutes to complete */
    estimatedMinutes: smallint("estimated_minutes"),
    /** JLPT level of content in this lesson */
    jlptLevel: smallint("jlpt_level"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("lessons_module_idx").on(table.moduleId),
    index("lessons_sort_idx").on(table.moduleId, table.sortOrder),
    uniqueIndex("lessons_slug_idx").on(table.moduleId, table.slug),
  ],
);

// ─────────────────────────────────────────────
// LESSON ITEMS
// ─────────────────────────────────────────────

/**
 * An ordered item within a lesson.
 * Each item has a type and a JSONB payload that defines its content.
 *
 * This is the equivalent of Repo A's `exercises` table but generalized
 * to support non-exercise content (text blocks, vocab intros, grammar
 * explanations, audio clips, images, etc.) alongside exercises.
 *
 * Payload shape depends on `type`:
 *   text:        { body: string }
 *   vocabulary:  { entryId: string }           → links to dictionary_entries
 *   grammar:     { patternId: string }          → links to grammar_patterns
 *   example:     { sentenceId: string }         → links to sentences
 *   exercise:    { exerciseType, prompt, promptJa, hint, speak, options, answer, accepted, pairs, tiles, explanation }
 *   audio:       { src: string, label?: string }
 *   image:       { src: string, alt?: string, caption?: string }
 *   video:       { src: string, caption?: string }
 *   divider:     {}
 */
export const lessonItems = pgTable(
  "lesson_items",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    /** Content type — determines payload shape */
    type: lessonItemTypeEnum("type").notNull(),
    /** Order within the lesson */
    sortOrder: integer("sort_order").notNull().default(0),
    /**
     * The content payload. Shape varies by type — see table-level JSDoc.
     * For exercise items, includes exerciseType, prompt, answer, options, etc.
     */
    payload: jsonb("payload").notNull(),
    /**
     * For exercise items, the specific exercise sub-type.
     * NULL for non-exercise items. Stored as a top-level column
     * (in addition to being in the payload) for query filtering.
     */
    exerciseType: exerciseTypeEnum("exercise_type"),
    /**
     * Optional FK to a knowledge entity (dictionary_entries, kanji_entries,
     * grammar_patterns, or sentences). Stored as text for polymorphism.
     * The item type implies which table the ref points to.
     */
    knowledgeRef: text("knowledge_ref"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("lesson_items_lesson_idx").on(table.lessonId),
    index("lesson_items_sort_idx").on(table.lessonId, table.sortOrder),
    index("lesson_items_type_idx").on(table.type),
  ],
);

// ─────────────────────────────────────────────
// LEARNING CONTENT (metadata / editorial)
// ─────────────────────────────────────────────

/**
 * Supplementary learning content that can be attached to any level of
 * the course hierarchy (course, module, or lesson) or stand alone.
 *
 * This covers:
 *   - study notes that accompany a lesson
 *   - tips & cultural context for a module
 *   - course-level resource lists
 *   - standalone reference articles
 *
 * The body is Markdown. The attachment is polymorphic via targetType/targetId.
 */
export const learningContent = pgTable(
  "learning_content",
  {
    id: text("id").primaryKey(),
    /** URL-safe slug */
    slug: varchar("slug", { length: 200 }).notNull().unique(),
    title: varchar("title", { length: 300 }).notNull(),
    /** Content category for filtering */
    category: varchar("category", { length: 50 }),
    /** Markdown body */
    body: text("body").notNull(),
    /** Optional excerpt / preview text */
    excerpt: text("excerpt"),
    status: publishStatusEnum("status").notNull().default("draft"),
    /**
     * Polymorphic attachment point:
     * "course", "module", "lesson", or NULL (standalone)
     */
    targetType: varchar("target_type", { length: 20 }),
    /** ID of the target course, module, or lesson */
    targetId: text("target_id"),
    /** Display order when multiple content items attach to the same target */
    sortOrder: integer("sort_order").notNull().default(0),
    /** JLPT level if applicable */
    jlptLevel: smallint("jlpt_level"),
    /** Categorization tags */
    tags: text("tags").array(),
    /** Author ID */
    createdBy: text("created_by"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("learning_content_target_idx").on(table.targetType, table.targetId),
    index("learning_content_status_idx").on(table.status),
    index("learning_content_category_idx").on(table.category),
  ],
);

// ─────────────────────────────────────────────
// LEARNING DOMAIN — RELATIONS
// ─────────────────────────────────────────────

export const coursesRelations = relations(courses, ({ many }) => ({
  modules: many(courseModules),
}));

export const courseModulesRelations = relations(courseModules, ({ one, many }) => ({
  course: one(courses, {
    fields: [courseModules.courseId],
    references: [courses.id],
  }),
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  module: one(courseModules, {
    fields: [lessons.moduleId],
    references: [courseModules.id],
  }),
  items: many(lessonItems),
}));

export const lessonItemsRelations = relations(lessonItems, ({ one }) => ({
  lesson: one(lessons, {
    fields: [lessonItems.lessonId],
    references: [lessons.id],
  }),
}));

export const learningContentRelations = relations(learningContent, () => ({
  // Polymorphic target — resolved at application level, not via Drizzle relations.
  // Use service-layer queries to join learning_content to courses/modules/lessons.
}));
