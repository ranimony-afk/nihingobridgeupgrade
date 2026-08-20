/**
 * NihongoBridge — Canonical Schema
 *
 * Phase 2, P09: Canonical knowledge tables (dictionary, kanji, grammar, sentences, provenance).
 * Phase 2, P10: Learning schema (courses, modules, lessons, items, content).
 * Phase 2, P11: Assessment schema (practice tests, sections, questions, sessions, answers, results).
 * Phase 2, P12: SRS schema (decks, cards, reviews, algorithm state).
 * Phase 2, P13: Progress schema (user, lesson, vocabulary, kanji, grammar progress).
 * Phase 2, P14: Gamification schema (xp events, achievements, streaks, daily goals).
 * Phase 5, P36: User bookmarks table for vocabulary favorites.
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

// ═══════════════════════════════════════════════
// ASSESSMENT DOMAIN (P11)
// ═══════════════════════════════════════════════

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

/** Question type within a test. */
export const questionTypeEnum = pgEnum("question_type", [
  "multiple_choice",
  "fill_blank",
  "matching",
  "ordering",
  "free_text",
  "listening",
  "reading_comprehension",
]);

/** Difficulty rating for questions and tests. */
export const difficultyEnum = pgEnum("difficulty", [
  "easy",
  "medium",
  "hard",
]);

/** Status of a test session. */
export const testSessionStatusEnum = pgEnum("test_session_status", [
  "in_progress",
  "completed",
  "abandoned",
  "timed_out",
]);

// ─────────────────────────────────────────────
// PRACTICE TESTS
// ─────────────────────────────────────────────

/**
 * A practice test definition — a reusable template.
 * e.g. "JLPT N5 Mock Test #1", "Kanji Quiz: Grade 1".
 *
 * Tests are composed of sections, each containing questions.
 * The same test definition can be taken many times (test_sessions).
 */
export const practiceTests = pgTable(
  "practice_tests",
  {
    id: text("id").primaryKey(),
    slug: varchar("slug", { length: 200 }).notNull().unique(),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    /** JLPT level this test targets */
    jlptLevel: smallint("jlpt_level"),
    difficulty: difficultyEnum("difficulty"),
    /** Time limit in minutes, NULL = untimed */
    timeLimitMinutes: smallint("time_limit_minutes"),
    /** Total possible score (sum of all question points) */
    totalPoints: integer("total_points").notNull().default(0),
    /** Minimum passing score (percentage 0-100) */
    passingScore: smallint("passing_score").default(60),
    /** Whether question order is randomized per session */
    shuffleQuestions: boolean("shuffle_questions").notNull().default(false),
    /** Whether option order is randomized per session */
    shuffleOptions: boolean("shuffle_options").notNull().default(false),
    /** Show correct answers after completion? */
    showAnswers: boolean("show_answers").notNull().default(true),
    status: publishStatusEnum("status").notNull().default("draft"),
    /** Tags for filtering */
    tags: text("tags").array(),
    /** Author */
    createdBy: text("created_by"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("practice_tests_jlpt_idx").on(table.jlptLevel),
    index("practice_tests_status_idx").on(table.status),
    index("practice_tests_difficulty_idx").on(table.difficulty),
  ],
);

// ─────────────────────────────────────────────
// TEST SECTIONS
// ─────────────────────────────────────────────

/**
 * A section within a practice test.
 * e.g. "Vocabulary", "Grammar", "Reading", "Listening".
 *
 * Sections group questions and can have their own time limits.
 */
export const testSections = pgTable(
  "test_sections",
  {
    id: text("id").primaryKey(),
    testId: text("test_id")
      .notNull()
      .references(() => practiceTests.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    /** Order within the test */
    sortOrder: integer("sort_order").notNull().default(0),
    /** Section-level time limit in minutes, NULL = inherits test limit */
    timeLimitMinutes: smallint("time_limit_minutes"),
    /** Total points in this section (auto-calculated or manual) */
    totalPoints: integer("total_points").notNull().default(0),
    /** Instructions shown at the start of this section */
    instructions: text("instructions"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("test_sections_test_idx").on(table.testId),
    index("test_sections_sort_idx").on(table.testId, table.sortOrder),
  ],
);

// ─────────────────────────────────────────────
// QUESTIONS
// ─────────────────────────────────────────────

/**
 * A question within a test section.
 * Also usable in the question bank (standalone, without a section).
 *
 * The correct answer(s) are stored in `correctAnswer` (JSONB) whose
 * shape depends on the question type. For multiple_choice, it's the
 * ID of the correct option. For fill_blank, it's the accepted strings.
 */
export const questions = pgTable(
  "questions",
  {
    id: text("id").primaryKey(),
    /** NULL = standalone question bank item */
    sectionId: text("section_id").references(() => testSections.id, {
      onDelete: "set null",
    }),
    type: questionTypeEnum("type").notNull(),
    /** Order within the section */
    sortOrder: integer("sort_order").notNull().default(0),
    /** The question prompt (English or bilingual) */
    prompt: text("prompt").notNull(),
    /** Japanese prompt if different from `prompt` */
    promptJa: text("prompt_ja"),
    /** Supplementary text (reading passage, audio transcript) */
    context: text("context"),
    /** Audio URL for listening questions */
    audioUrl: text("audio_url"),
    /** Image URL for visual questions */
    imageUrl: text("image_url"),
    /**
     * Correct answer — shape depends on type:
     *   multiple_choice: { optionId: "opt-1" }
     *   fill_blank:      { accepted: ["answer1", "answer2"] }
     *   matching:        { pairs: [["left","right"], ...] }
     *   ordering:        { order: ["id1","id2","id3"] }
     *   free_text:       { keywords: ["word1"], sampleAnswer: "..." }
     */
    correctAnswer: jsonb("correct_answer").notNull(),
    /** Explanation shown after answering */
    explanation: text("explanation"),
    /** Points awarded for correct answer */
    points: integer("points").notNull().default(1),
    difficulty: difficultyEnum("difficulty"),
    /** JLPT level */
    jlptLevel: smallint("jlpt_level"),
    /** Tags (grammar, vocabulary, kanji, etc.) */
    tags: text("tags").array(),
    /**
     * Optional link to a knowledge entity.
     * e.g. "dictionary_entry:de-123" or "grammar_pattern:gp-456"
     */
    knowledgeRef: text("knowledge_ref"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("questions_section_idx").on(table.sectionId),
    index("questions_section_sort_idx").on(table.sectionId, table.sortOrder),
    index("questions_type_idx").on(table.type),
    index("questions_jlpt_idx").on(table.jlptLevel),
    index("questions_difficulty_idx").on(table.difficulty),
  ],
);

// ─────────────────────────────────────────────
// QUESTION OPTIONS
// ─────────────────────────────────────────────

/**
 * Answer options for multiple-choice and matching questions.
 * Each option belongs to a question and has a display label.
 */
export const questionOptions = pgTable(
  "question_options",
  {
    id: text("id").primaryKey(),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    /** Display label (the option text) */
    label: text("label").notNull(),
    /** Japanese text if applicable */
    labelJa: text("label_ja"),
    /** Order of this option */
    sortOrder: integer("sort_order").notNull().default(0),
    /** Whether this is a correct option (for multi-select questions) */
    isCorrect: boolean("is_correct").notNull().default(false),
    /** Feedback shown if this option is selected */
    feedback: text("feedback"),
  },
  (table) => [
    index("question_options_question_idx").on(table.questionId),
    index("question_options_sort_idx").on(table.questionId, table.sortOrder),
  ],
);

// ─────────────────────────────────────────────
// TEST SESSIONS
// ─────────────────────────────────────────────

/**
 * A single attempt at a practice test by a learner.
 * Tracks timing, score, and completion status.
 */
export const testSessions = pgTable(
  "test_sessions",
  {
    id: text("id").primaryKey(),
    testId: text("test_id")
      .notNull()
      .references(() => practiceTests.id, { onDelete: "cascade" }),
    /** The learner taking the test (text — may reference identity_users or learners) */
    learnerId: text("learner_id").notNull(),
    status: testSessionStatusEnum("status").notNull().default("in_progress"),
    /** When the session started */
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    /** When the session ended (completed, abandoned, or timed out) */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Total time spent in seconds */
    timeSpentSeconds: integer("time_spent_seconds"),
    /** Index of the current question (for resuming) */
    currentQuestionIndex: integer("current_question_index").notNull().default(0),
    /** Ordered question IDs for this session (may be shuffled) */
    questionOrder: text("question_order").array(),
  },
  (table) => [
    index("test_sessions_test_idx").on(table.testId),
    index("test_sessions_learner_idx").on(table.learnerId),
    index("test_sessions_status_idx").on(table.status),
    index("test_sessions_learner_test_idx").on(table.learnerId, table.testId),
  ],
);

// ─────────────────────────────────────────────
// TEST ANSWERS
// ─────────────────────────────────────────────

/**
 * A learner's answer to a specific question within a test session.
 * One row per question per session. Append-only during the session.
 */
export const testAnswers = pgTable(
  "test_answers",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => testSessions.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    /**
     * The learner's submitted answer — shape mirrors correctAnswer:
     *   multiple_choice: { optionId: "opt-2" }
     *   fill_blank:      { text: "their answer" }
     *   matching:        { pairs: [["left","right"], ...] }
     *   ordering:        { order: ["id3","id1","id2"] }
     *   free_text:       { text: "their free text answer" }
     */
    answer: jsonb("answer").notNull(),
    /** Whether the answer was judged correct */
    isCorrect: boolean("is_correct").notNull(),
    /** Points earned for this answer */
    pointsEarned: integer("points_earned").notNull().default(0),
    /** Time spent on this question in milliseconds */
    timeSpentMs: integer("time_spent_ms"),
    /** When the answer was submitted */
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("test_answers_session_idx").on(table.sessionId),
    index("test_answers_question_idx").on(table.questionId),
    uniqueIndex("test_answers_session_question_idx").on(
      table.sessionId,
      table.questionId,
    ),
  ],
);

// ─────────────────────────────────────────────
// TEST RESULTS
// ─────────────────────────────────────────────

/**
 * Summary result for a completed test session.
 * One row per completed session. Created when session status → completed.
 */
export const testResults = pgTable(
  "test_results",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => testSessions.id, { onDelete: "cascade" })
      .unique(),
    testId: text("test_id")
      .notNull()
      .references(() => practiceTests.id, { onDelete: "cascade" }),
    learnerId: text("learner_id").notNull(),
    /** Raw score (points earned) */
    score: integer("score").notNull(),
    /** Maximum possible score */
    maxScore: integer("max_score").notNull(),
    /** Percentage 0-100 */
    percentage: real("percentage").notNull(),
    /** Whether the learner passed */
    passed: boolean("passed").notNull(),
    /** Number of correct answers */
    correctCount: integer("correct_count").notNull(),
    /** Total number of questions */
    totalQuestions: integer("total_questions").notNull(),
    /** Total time in seconds */
    timeSpentSeconds: integer("time_spent_seconds"),
    /** Per-section breakdown: [{ sectionId, title, score, maxScore, percentage }] */
    sectionBreakdown: jsonb("section_breakdown"),
    /** Per-tag accuracy: { "grammar": 0.8, "vocabulary": 0.6, ... } */
    tagAccuracy: jsonb("tag_accuracy"),
    /** XP awarded for this result */
    xpAwarded: integer("xp_awarded").notNull().default(0),

    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("test_results_test_idx").on(table.testId),
    index("test_results_learner_idx").on(table.learnerId),
    index("test_results_learner_test_idx").on(table.learnerId, table.testId),
    index("test_results_completed_idx").on(table.completedAt),
  ],
);

// ─────────────────────────────────────────────
// ASSESSMENT DOMAIN — RELATIONS
// ─────────────────────────────────────────────

export const practiceTestsRelations = relations(practiceTests, ({ many }) => ({
  sections: many(testSections),
  sessions: many(testSessions),
  results: many(testResults),
}));

export const testSectionsRelations = relations(testSections, ({ one, many }) => ({
  test: one(practiceTests, {
    fields: [testSections.testId],
    references: [practiceTests.id],
  }),
  questions: many(questions),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  section: one(testSections, {
    fields: [questions.sectionId],
    references: [testSections.id],
  }),
  options: many(questionOptions),
  answers: many(testAnswers),
}));

export const questionOptionsRelations = relations(questionOptions, ({ one }) => ({
  question: one(questions, {
    fields: [questionOptions.questionId],
    references: [questions.id],
  }),
}));

export const testSessionsRelations = relations(testSessions, ({ one, many }) => ({
  test: one(practiceTests, {
    fields: [testSessions.testId],
    references: [practiceTests.id],
  }),
  answers: many(testAnswers),
  result: one(testResults),
}));

export const testAnswersRelations = relations(testAnswers, ({ one }) => ({
  session: one(testSessions, {
    fields: [testAnswers.sessionId],
    references: [testSessions.id],
  }),
  question: one(questions, {
    fields: [testAnswers.questionId],
    references: [questions.id],
  }),
}));

export const testResultsRelations = relations(testResults, ({ one }) => ({
  session: one(testSessions, {
    fields: [testResults.sessionId],
    references: [testSessions.id],
  }),
  test: one(practiceTests, {
    fields: [testResults.testId],
    references: [practiceTests.id],
  }),
}));

// ═══════════════════════════════════════════════
// SRS DOMAIN (P12)
// ═══════════════════════════════════════════════

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

/** SRS card content type. */
export const srsCardTypeEnum = pgEnum("srs_card_type", [
  "vocabulary",
  "kanji",
  "grammar",
  "sentence",
  "custom",
]);

/** SRS card learning state (FSRS states). */
export const srsCardStateEnum = pgEnum("srs_card_state", [
  "new",
  "learning",
  "review",
  "relearning",
]);

/** Review rating. */
export const srsRatingEnum = pgEnum("srs_rating", [
  "again",
  "hard",
  "good",
  "easy",
]);

// ─────────────────────────────────────────────
// SRS DECKS
// ─────────────────────────────────────────────

/**
 * A deck groups SRS cards for a learner.
 * e.g. "JLPT N5 Vocabulary", "Kanji Grade 1", custom user deck.
 */
export const srsDecks = pgTable(
  "srs_decks",
  {
    id: text("id").primaryKey(),
    /** Owner. Text FK — resolves to identity_users or learners. */
    learnerId: text("learner_id").notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    /** Whether other users can see/clone this deck */
    isPublic: boolean("is_public").notNull().default(false),
    /** Maximum new cards introduced per day */
    newCardsPerDay: smallint("new_cards_per_day").notNull().default(20),
    /** Maximum reviews per day (0 = unlimited) */
    maxReviewsPerDay: smallint("max_reviews_per_day").notNull().default(0),
    /** Card count (denormalised — updated by triggers or app logic) */
    cardCount: integer("card_count").notNull().default(0),
    /** Icon or colour for the deck */
    icon: varchar("icon", { length: 20 }),
    color: varchar("color", { length: 20 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("srs_decks_learner_idx").on(table.learnerId),
    index("srs_decks_public_idx").on(table.isPublic),
  ],
);

// ─────────────────────────────────────────────
// SRS CARDS
// ─────────────────────────────────────────────

/**
 * An individual SRS flashcard.
 *
 * Front/back are JSONB to support rich content:
 *   { text: "食べる", reading: "たべる", audio: "..." }
 *   { text: "to eat", example: "毎日ご飯を食べます。" }
 *
 * Scheduling fields follow FSRS (Free Spaced Repetition Scheduler).
 * SM-2 compatibility: ease ≈ difficulty, interval ≈ scheduledDays.
 */
export const srsCards = pgTable(
  "srs_cards",
  {
    id: text("id").primaryKey(),
    deckId: text("deck_id")
      .notNull()
      .references(() => srsDecks.id, { onDelete: "cascade" }),

    // ── Content ──
    /** Card type — determines what knowledge entity it represents */
    type: srsCardTypeEnum("type").notNull(),
    /** Front side content (shown during review) */
    front: jsonb("front").notNull(),
    /** Back side content (revealed after flip) */
    back: jsonb("back").notNull(),
    /**
     * Source entity type + ID for cards generated from knowledge data.
     * e.g. sourceType="dictionary_entry", sourceId="de-12345"
     */
    sourceType: varchar("source_type", { length: 50 }),
    sourceId: text("source_id"),

    // ── FSRS scheduling state ──
    state: srsCardStateEnum("state").notNull().default("new"),
    /** Next review date. NULL for new cards that haven't been seen. */
    due: timestamp("due", { withTimezone: true }),
    /** FSRS stability (higher = longer intervals) */
    stability: real("stability").notNull().default(0),
    /** FSRS difficulty (0-10, lower = easier) */
    difficulty: real("difficulty").notNull().default(0),
    /** Days since the previous review */
    elapsedDays: integer("elapsed_days").notNull().default(0),
    /** Scheduled interval in days */
    scheduledDays: integer("scheduled_days").notNull().default(0),
    /** Total number of reviews */
    reps: integer("reps").notNull().default(0),
    /** Total number of lapses (forgot) */
    lapses: integer("lapses").notNull().default(0),
    /** Timestamp of last review */
    lastReviewAt: timestamp("last_review_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("srs_cards_deck_idx").on(table.deckId),
    index("srs_cards_state_idx").on(table.state),
    index("srs_cards_due_idx").on(table.deckId, table.state, table.due),
    index("srs_cards_source_idx").on(table.sourceType, table.sourceId),
  ],
);

// ─────────────────────────────────────────────
// SRS REVIEWS
// ─────────────────────────────────────────────

/**
 * Immutable log of every review event.
 * Append-only — never updated or deleted.
 * Used for review history, analytics, and algorithm tuning.
 */
export const srsReviews = pgTable(
  "srs_reviews",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => srsCards.id, { onDelete: "cascade" }),
    /** Learner who performed the review */
    learnerId: text("learner_id").notNull(),
    /** User's rating of recall difficulty */
    rating: srsRatingEnum("rating").notNull(),
    /** Card state before this review */
    stateBefore: srsCardStateEnum("state_before").notNull(),
    /** Card state after this review */
    stateAfter: srsCardStateEnum("state_after").notNull(),
    /** Time spent reviewing this card in milliseconds */
    reviewDurationMs: integer("review_duration_ms"),
    /** Scheduled interval before this review (days) */
    scheduledDays: integer("scheduled_days").notNull(),
    /** Actual elapsed days since previous review */
    elapsedDays: integer("elapsed_days").notNull(),
    /** When the review was performed */
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("srs_reviews_card_idx").on(table.cardId),
    index("srs_reviews_learner_idx").on(table.learnerId),
    index("srs_reviews_reviewed_at_idx").on(table.reviewedAt),
    index("srs_reviews_learner_date_idx").on(table.learnerId, table.reviewedAt),
  ],
);

// ─────────────────────────────────────────────
// SRS ALGORITHM STATE
// ─────────────────────────────────────────────

/**
 * Per-learner SRS algorithm parameters.
 *
 * FSRS uses global parameters that are optimised per-learner over time
 * based on their review history. This table stores those parameters
 * plus session-level stats.
 *
 * One row per learner. Created on first review.
 */
export const srsAlgorithmState = pgTable(
  "srs_algorithm_state",
  {
    id: text("id").primaryKey(),
    /** One row per learner */
    learnerId: text("learner_id").notNull().unique(),
    /** Algorithm name and version, e.g. "fsrs-5", "sm-2" */
    algorithm: varchar("algorithm", { length: 20 }).notNull().default("fsrs-5"),
    /**
     * FSRS optimised weights — 19 float parameters.
     * Stored as JSONB array: [w0, w1, ..., w18]
     * Default weights from FSRS-5 are used until enough reviews exist
     * for per-learner optimisation.
     */
    weights: jsonb("weights"),
    /** Desired retention rate (0.0 – 1.0), default 0.9 */
    desiredRetention: real("desired_retention").notNull().default(0.9),
    /** Total number of reviews performed by this learner */
    totalReviews: integer("total_reviews").notNull().default(0),
    /** Total number of cards in "review" state */
    matureCards: integer("mature_cards").notNull().default(0),
    /** Total number of cards in "learning" or "relearning" state */
    learningCards: integer("learning_cards").notNull().default(0),
    /** Total number of cards in "new" state */
    newCards: integer("new_cards").notNull().default(0),
    /** Measured retention rate over last 30 days (0.0 – 1.0) */
    measuredRetention: real("measured_retention"),
    /** When the parameters were last optimised */
    lastOptimisedAt: timestamp("last_optimised_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [],
);

// ─────────────────────────────────────────────
// SRS DOMAIN — RELATIONS
// ─────────────────────────────────────────────

export const srsDecksRelations = relations(srsDecks, ({ many }) => ({
  cards: many(srsCards),
}));

export const srsCardsRelations = relations(srsCards, ({ one, many }) => ({
  deck: one(srsDecks, {
    fields: [srsCards.deckId],
    references: [srsDecks.id],
  }),
  reviews: many(srsReviews),
}));

export const srsReviewsRelations = relations(srsReviews, ({ one }) => ({
  card: one(srsCards, {
    fields: [srsReviews.cardId],
    references: [srsCards.id],
  }),
}));

export const srsAlgorithmStateRelations = relations(srsAlgorithmState, () => ({
  // learnerId resolved at application level — no typed FK to a specific user table.
}));

// ═══════════════════════════════════════════════
// PROGRESS DOMAIN (P13)
// ═══════════════════════════════════════════════

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

/** Mastery level for individual knowledge items. */
export const masteryLevelEnum = pgEnum("mastery_level", [
  "unseen",
  "introduced",
  "practicing",
  "familiar",
  "mastered",
]);

/** Overall status of a learner's engagement with a course. */
export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "enrolled",
  "in_progress",
  "completed",
  "dropped",
]);

// ─────────────────────────────────────────────
// USER PROGRESS
// ─────────────────────────────────────────────

/**
 * Top-level progress record per learner per course.
 * One row per (learner, course). Tracks overall completion,
 * cumulative XP, time, and streak within the course.
 */
export const userProgress = pgTable(
  "user_progress",
  {
    id: text("id").primaryKey(),
    /** Learner ID — text FK, resolved at app level. */
    learnerId: text("learner_id").notNull(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    status: enrollmentStatusEnum("status").notNull().default("enrolled"),
    /** Percentage of lessons completed (0.0–1.0) */
    completionPercent: real("completion_percent").notNull().default(0),
    /** Total lessons completed in this course */
    lessonsCompleted: integer("lessons_completed").notNull().default(0),
    /** Total lessons in this course (snapshot, for fast %) */
    totalLessons: integer("total_lessons").notNull().default(0),
    /** Cumulative XP earned in this course */
    xpEarned: integer("xp_earned").notNull().default(0),
    /** Total time spent in seconds */
    timeSpentSeconds: integer("time_spent_seconds").notNull().default(0),
    /** Current streak within this course (consecutive study days) */
    currentStreak: integer("current_streak").notNull().default(0),
    /** Longest streak achieved */
    longestStreak: integer("longest_streak").notNull().default(0),
    /** Date of last activity (YYYY-MM-DD text for timezone-safe comparison) */
    lastActivityDate: varchar("last_activity_date", { length: 10 }),
    /** JLPT level of this course (denormalized for query) */
    jlptLevel: smallint("jlpt_level"),

    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_progress_learner_course_idx").on(table.learnerId, table.courseId),
    index("user_progress_learner_idx").on(table.learnerId),
    index("user_progress_status_idx").on(table.status),
    index("user_progress_course_idx").on(table.courseId),
  ],
);

// ─────────────────────────────────────────────
// LESSON PROGRESS
// ─────────────────────────────────────────────

/**
 * Per-learner per-lesson completion record.
 * Tracks crowns (repeat completions), best score, and accuracy.
 * Matches Repo A's lesson_progress pattern.
 */
export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id").notNull(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    /** Crown count — increments with each completion (Duolingo-style) */
    crowns: smallint("crowns").notNull().default(0),
    /** Best score achieved (percentage 0–100) */
    bestScore: smallint("best_score").notNull().default(0),
    /** Accuracy on most recent attempt (percentage 0–100) */
    lastAccuracy: smallint("last_accuracy").notNull().default(0),
    /** XP earned across all attempts */
    xpEarned: integer("xp_earned").notNull().default(0),
    /** Total time spent across all attempts (seconds) */
    timeSpentSeconds: integer("time_spent_seconds").notNull().default(0),
    /** Number of attempts */
    attempts: integer("attempts").notNull().default(0),
    /** When first completed (NULL if never completed) */
    firstCompletedAt: timestamp("first_completed_at", { withTimezone: true }),
    /** When most recently completed */
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lesson_progress_learner_lesson_idx").on(table.learnerId, table.lessonId),
    index("lesson_progress_learner_idx").on(table.learnerId),
    index("lesson_progress_lesson_idx").on(table.lessonId),
  ],
);

// ─────────────────────────────────────────────
// VOCABULARY PROGRESS
// ─────────────────────────────────────────────

/**
 * Per-learner mastery of individual dictionary entries.
 * Tracks how well the learner knows each word across all contexts
 * (lessons, SRS, tests).
 */
export const vocabularyProgress = pgTable(
  "vocabulary_progress",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id").notNull(),
    /** FK to dictionary_entries */
    entryId: text("entry_id")
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: "cascade" }),
    mastery: masteryLevelEnum("mastery").notNull().default("unseen"),
    /** Number of times this word was seen/practiced */
    encounterCount: integer("encounter_count").notNull().default(0),
    /** Number of correct answers involving this word */
    correctCount: integer("correct_count").notNull().default(0),
    /** Number of incorrect answers */
    incorrectCount: integer("incorrect_count").notNull().default(0),
    /** Accuracy = correct / (correct + incorrect), cached */
    accuracy: real("accuracy"),
    /** Last time the learner interacted with this word */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    /** When this word was first introduced to the learner */
    introducedAt: timestamp("introduced_at", { withTimezone: true }),
    /** When mastery reached "mastered" level */
    masteredAt: timestamp("mastered_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("vocab_progress_learner_entry_idx").on(table.learnerId, table.entryId),
    index("vocab_progress_learner_idx").on(table.learnerId),
    index("vocab_progress_mastery_idx").on(table.learnerId, table.mastery),
    index("vocab_progress_entry_idx").on(table.entryId),
  ],
);

// ─────────────────────────────────────────────
// KANJI PROGRESS
// ─────────────────────────────────────────────

/**
 * Per-learner mastery of individual kanji characters.
 * Tracks recognition, reading recall, and writing separately.
 */
export const kanjiProgress = pgTable(
  "kanji_progress",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id").notNull(),
    /** FK to kanji_entries */
    kanjiId: text("kanji_id")
      .notNull()
      .references(() => kanjiEntries.id, { onDelete: "cascade" }),
    mastery: masteryLevelEnum("mastery").notNull().default("unseen"),
    /** Can the learner recognise the kanji and recall its meaning? */
    meaningAccuracy: real("meaning_accuracy"),
    /** Can the learner produce the correct reading? */
    readingAccuracy: real("reading_accuracy"),
    /** Total encounters */
    encounterCount: integer("encounter_count").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    incorrectCount: integer("incorrect_count").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    introducedAt: timestamp("introduced_at", { withTimezone: true }),
    masteredAt: timestamp("mastered_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("kanji_progress_learner_kanji_idx").on(table.learnerId, table.kanjiId),
    index("kanji_progress_learner_idx").on(table.learnerId),
    index("kanji_progress_mastery_idx").on(table.learnerId, table.mastery),
    index("kanji_progress_kanji_idx").on(table.kanjiId),
  ],
);

// ─────────────────────────────────────────────
// GRAMMAR PROGRESS
// ─────────────────────────────────────────────

/**
 * Per-learner mastery of individual grammar patterns.
 * Tracks recognition, production, and contextual usage.
 */
export const grammarProgress = pgTable(
  "grammar_progress",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id").notNull(),
    /** FK to grammar_patterns */
    grammarId: text("grammar_id")
      .notNull()
      .references(() => grammarPatterns.id, { onDelete: "cascade" }),
    mastery: masteryLevelEnum("mastery").notNull().default("unseen"),
    /** Can the learner recognise the pattern in context? */
    recognitionAccuracy: real("recognition_accuracy"),
    /** Can the learner produce sentences using the pattern? */
    productionAccuracy: real("production_accuracy"),
    encounterCount: integer("encounter_count").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    incorrectCount: integer("incorrect_count").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    introducedAt: timestamp("introduced_at", { withTimezone: true }),
    masteredAt: timestamp("mastered_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("grammar_progress_learner_grammar_idx").on(table.learnerId, table.grammarId),
    index("grammar_progress_learner_idx").on(table.learnerId),
    index("grammar_progress_mastery_idx").on(table.learnerId, table.mastery),
    index("grammar_progress_grammar_idx").on(table.grammarId),
  ],
);

// ─────────────────────────────────────────────
// PROGRESS DOMAIN — RELATIONS
// ─────────────────────────────────────────────

export const userProgressRelations = relations(userProgress, ({ one }) => ({
  course: one(courses, {
    fields: [userProgress.courseId],
    references: [courses.id],
  }),
}));

export const lessonProgressRelations = relations(lessonProgress, ({ one }) => ({
  lesson: one(lessons, {
    fields: [lessonProgress.lessonId],
    references: [lessons.id],
  }),
}));

export const vocabularyProgressRelations = relations(vocabularyProgress, ({ one }) => ({
  entry: one(dictionaryEntries, {
    fields: [vocabularyProgress.entryId],
    references: [dictionaryEntries.id],
  }),
}));

export const kanjiProgressRelations = relations(kanjiProgress, ({ one }) => ({
  kanji: one(kanjiEntries, {
    fields: [kanjiProgress.kanjiId],
    references: [kanjiEntries.id],
  }),
}));

export const grammarProgressRelations = relations(grammarProgress, ({ one }) => ({
  pattern: one(grammarPatterns, {
    fields: [grammarProgress.grammarId],
    references: [grammarPatterns.id],
  }),
}));

// ═══════════════════════════════════════════════
// GAMIFICATION DOMAIN (P14)
// ═══════════════════════════════════════════════

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

/** What activity generated XP. */
export const xpSourceEnum = pgEnum("xp_source", [
  "lesson_complete",
  "lesson_perfect",
  "quiz_complete",
  "test_complete",
  "test_pass",
  "srs_review",
  "streak_bonus",
  "daily_goal",
  "achievement",
  "story_complete",
  "first_lesson",
  "challenge",
  "bonus",
]);

/** Achievement category for grouping in the trophy case. */
export const achievementCategoryEnum = pgEnum("achievement_category", [
  "learning",
  "review",
  "streak",
  "mastery",
  "exploration",
  "social",
  "special",
]);

// ─────────────────────────────────────────────
// XP EVENTS
// ─────────────────────────────────────────────

/**
 * Immutable ledger of every XP award.
 * Append-only — never updated or deleted.
 *
 * The learner's total XP is the SUM of this table,
 * but is also cached on the learner profile for fast reads.
 */
export const xpEvents = pgTable(
  "xp_events",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id").notNull(),
    /** How much XP was awarded (positive) or deducted (negative, rare) */
    amount: integer("amount").notNull(),
    /** What generated this XP */
    source: xpSourceEnum("source").notNull(),
    /** ID of the source entity (lesson, test, card, etc.) */
    sourceId: text("source_id"),
    /** Human-readable description, e.g. "Completed lesson: Saying Hello" */
    description: varchar("description", { length: 300 }),
    /** Whether a 2x multiplier was active */
    doubleXp: boolean("double_xp").notNull().default(false),

    earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("xp_events_learner_idx").on(table.learnerId),
    index("xp_events_earned_at_idx").on(table.earnedAt),
    index("xp_events_learner_date_idx").on(table.learnerId, table.earnedAt),
    index("xp_events_source_idx").on(table.source),
  ],
);

// ─────────────────────────────────────────────
// ACHIEVEMENTS
// ─────────────────────────────────────────────

/**
 * Achievement definitions — the trophy catalog.
 * Rows are created by admins or seed scripts, not by learners.
 *
 * Criteria is a JSONB object that the achievement-check service
 * evaluates against learner state:
 *   { "type": "streak", "days": 7 }
 *   { "type": "xp_total", "amount": 1000 }
 *   { "type": "lessons_completed", "count": 50 }
 *   { "type": "mastery", "domain": "kanji", "level": "mastered", "count": 100 }
 */
export const achievements = pgTable(
  "achievements",
  {
    id: text("id").primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    /** Emoji or icon identifier for display */
    icon: varchar("icon", { length: 50 }).notNull(),
    category: achievementCategoryEnum("category").notNull(),
    /** Machine-readable unlock criteria (evaluated by service layer) */
    criteria: jsonb("criteria").notNull(),
    /** XP bonus awarded when unlocked */
    xpReward: integer("xp_reward").notNull().default(0),
    /** Sort order within category */
    sortOrder: integer("sort_order").notNull().default(0),
    /** Whether this achievement is currently earnable */
    isActive: boolean("is_active").notNull().default(true),
    /** Rarity tier for UI treatment */
    rarity: varchar("rarity", { length: 20 }).notNull().default("common"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("achievements_category_idx").on(table.category),
    index("achievements_active_idx").on(table.isActive),
  ],
);

// ─────────────────────────────────────────────
// USER ACHIEVEMENTS
// ─────────────────────────────────────────────

/**
 * Junction: which learner has unlocked which achievement.
 * One row per (learner, achievement). Created when criteria are met.
 */
export const userAchievements = pgTable(
  "user_achievements",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id").notNull(),
    achievementId: text("achievement_id")
      .notNull()
      .references(() => achievements.id, { onDelete: "cascade" }),
    /** When the achievement was unlocked */
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
    /** Whether the learner has seen the unlock notification */
    seen: boolean("seen").notNull().default(false),
  },
  (table) => [
    uniqueIndex("user_achievements_learner_achievement_idx").on(
      table.learnerId,
      table.achievementId,
    ),
    index("user_achievements_learner_idx").on(table.learnerId),
    index("user_achievements_unseen_idx").on(table.learnerId, table.seen),
  ],
);

// ─────────────────────────────────────────────
// STREAKS
// ─────────────────────────────────────────────

/**
 * Per-learner streak tracking.
 * One row per learner. Created on first activity.
 *
 * Streak logic:
 *   - If lastActivityDate === today → streak already counted
 *   - If lastActivityDate === yesterday → increment currentStreak
 *   - If lastActivityDate < yesterday → reset currentStreak to 1
 *     (unless freezeCount > 0, then decrement freeze and preserve streak)
 */
export const streaks = pgTable(
  "streaks",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id").notNull().unique(),
    /** Current consecutive-day streak */
    currentStreak: integer("current_streak").notNull().default(0),
    /** All-time longest streak */
    longestStreak: integer("longest_streak").notNull().default(0),
    /** Date of last qualifying activity (YYYY-MM-DD) */
    lastActivityDate: varchar("last_activity_date", { length: 10 }),
    /** Number of streak-freeze items available (purchased in shop) */
    freezeCount: integer("freeze_count").notNull().default(0),
    /** Date a freeze was last consumed (YYYY-MM-DD), to prevent double-freeze */
    lastFreezeDate: varchar("last_freeze_date", { length: 10 }),
    /** Total number of days with activity (lifetime) */
    totalActiveDays: integer("total_active_days").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [],
);

// ─────────────────────────────────────────────
// DAILY GOALS
// ─────────────────────────────────────────────

/**
 * Per-learner daily goal tracking.
 * One row per learner per day. Created on first activity of the day.
 *
 * Tracks XP progress toward the daily target, plus activity breakdown.
 */
export const dailyGoals = pgTable(
  "daily_goals",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id").notNull(),
    /** The date this record covers (YYYY-MM-DD) */
    date: varchar("date", { length: 10 }).notNull(),
    /** Target XP for the day (from learner preferences) */
    targetXp: integer("target_xp").notNull().default(20),
    /** XP earned so far today */
    earnedXp: integer("earned_xp").notNull().default(0),
    /** Whether the daily goal was reached */
    goalMet: boolean("goal_met").notNull().default(false),
    /** Lessons completed today */
    lessonsCompleted: integer("lessons_completed").notNull().default(0),
    /** SRS reviews completed today */
    reviewsCompleted: integer("reviews_completed").notNull().default(0),
    /** Tests completed today */
    testsCompleted: integer("tests_completed").notNull().default(0),
    /** Stories completed today */
    storiesCompleted: integer("stories_completed").notNull().default(0),
    /** Total time spent today in seconds */
    timeSpentSeconds: integer("time_spent_seconds").notNull().default(0),
    /** When the goal was met (NULL if not yet met) */
    goalMetAt: timestamp("goal_met_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("daily_goals_learner_date_idx").on(table.learnerId, table.date),
    index("daily_goals_learner_idx").on(table.learnerId),
    index("daily_goals_date_idx").on(table.date),
    index("daily_goals_goal_met_idx").on(table.learnerId, table.goalMet),
  ],
);

// ─────────────────────────────────────────────
// GAMIFICATION DOMAIN — RELATIONS
// ─────────────────────────────────────────────

export const xpEventsRelations = relations(xpEvents, () => ({
  // learnerId resolved at application level.
}));

export const achievementsRelations = relations(achievements, ({ many }) => ({
  userAchievements: many(userAchievements),
}));

export const userAchievementsRelations = relations(userAchievements, ({ one }) => ({
  achievement: one(achievements, {
    fields: [userAchievements.achievementId],
    references: [achievements.id],
  }),
}));

export const streaksRelations = relations(streaks, () => ({
  // learnerId resolved at application level.
}));

export const dailyGoalsRelations = relations(dailyGoals, () => ({
  // learnerId resolved at application level.
}));

// ═══════════════════════════════════════════════
// USER BOOKMARKS (P36)
// ═══════════════════════════════════════════════

/**
 * Polymorphic bookmarks/favorites. A learner can bookmark any knowledge entity.
 * Matches Repo A's kg_bookmarks pattern.
 */
export const userBookmarks = pgTable(
  "user_bookmarks",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id").notNull(),
    /** "dictionary_entry", "kanji_entry", "grammar_pattern", "sentence" */
    targetType: varchar("target_type", { length: 30 }).notNull(),
    targetId: text("target_id").notNull(),
    /** Optional user note */
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_bookmarks_unique").on(table.learnerId, table.targetType, table.targetId),
    index("user_bookmarks_learner_idx").on(table.learnerId),
    index("user_bookmarks_target_idx").on(table.targetType, table.targetId),
  ],
);
