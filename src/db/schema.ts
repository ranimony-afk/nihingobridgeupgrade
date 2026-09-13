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
  // Fixture provenance is test-only and is never production-trusted unless an
  // ETL command explicitly opts into fixture mode.
  isFixture: boolean("is_fixture").notNull().default(false),
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

/* =========================================================================
 * PHASE 04.3 — KANJI (KANJIDIC2)
 * Additive only. Shares etl_import_runs for provenance (Rule 5).
 * ========================================================================= */

export const kanjiCharacters = pgTable(
  "kanji_characters",
  {
    id: serial("id").primaryKey(),
    source: varchar("source", { length: 64 }).notNull().default("kanjidic2"),
    literal: varchar("literal", { length: 8 }).notNull(),
    importRunId: integer("import_run_id").references(() => etlImportRuns.id, {
      onDelete: "set null",
    }),
    codepointUcs: varchar("codepoint_ucs", { length: 16 }).notNull().default(""),
    strokeCount: integer("stroke_count"),
    // Alternative stroke counts recorded by KANJIDIC2 (miscounts / variants).
    strokeMiscounts: jsonb("stroke_miscounts").notNull().default([]),
    radicalClassical: integer("radical_classical"),
    radicalNelson: integer("radical_nelson"),
    // 1-6 kyouiku, 8 jouyou, 9-10 jinmeiyou.
    grade: integer("grade"),
    frequencyRank: integer("frequency_rank"),
    // KANJIDIC2 ships the LEGACY 4-level JLPT scale (1-4), NOT modern N1-N5.
    jlptOld: integer("jlpt_old"),
    // Modern N5-N1, populated by a later enrichment phase.
    jlptLevel: varchar("jlpt_level", { length: 4 }),
    variants: jsonb("variants").notNull().default([]),
    dictionaryRefs: jsonb("dictionary_refs").notNull().default({}),
    queryCodes: jsonb("query_codes").notNull().default({}),
    nanori: jsonb("nanori").notNull().default([]),
    contentHash: varchar("content_hash", { length: 64 }).notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    literalUnique: uniqueIndex("kanji_characters_source_literal_unique").on(
      t.source,
      t.literal,
    ),
    gradeIdx: index("kanji_characters_grade_idx").on(t.grade),
    strokeIdx: index("kanji_characters_stroke_idx").on(t.strokeCount),
    freqIdx: index("kanji_characters_freq_idx").on(t.frequencyRank),
  }),
);

export const kanjiReadings = pgTable(
  "kanji_readings",
  {
    id: serial("id").primaryKey(),
    kanjiId: integer("kanji_id")
      .notNull()
      .references(() => kanjiCharacters.id, { onDelete: "cascade" }),
    // ja_on | ja_kun | pinyin | korean_r | korean_h | vietnam ...
    type: varchar("type", { length: 16 }).notNull(),
    value: text("value").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    kanjiIdx: index("kanji_readings_kanji_idx").on(t.kanjiId),
    typeIdx: index("kanji_readings_type_idx").on(t.type),
    valueIdx: index("kanji_readings_value_idx").on(t.value),
  }),
);

export const kanjiMeanings = pgTable(
  "kanji_meanings",
  {
    id: serial("id").primaryKey(),
    kanjiId: integer("kanji_id")
      .notNull()
      .references(() => kanjiCharacters.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 8 }).notNull().default("en"),
    value: text("value").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    kanjiIdx: index("kanji_meanings_kanji_idx").on(t.kanjiId),
    langIdx: index("kanji_meanings_language_idx").on(t.language),
    valueIdx: index("kanji_meanings_value_idx").on(t.value),
  }),
);

/* =========================================================================
 * PHASE 04.4 — SENTENCES (Tatoeba)
 * Additive only. Shares etl_import_runs for provenance (Rule 5).
 *
 * LICENSING (verified — see reports/phase-04/TATOEBA-LICENSING-AND-SCHEMA-
 * VERIFICATION.md): Tatoeba text is CC BY 2.0 FR, which REQUIRES citing the
 * author of each sentence. Attribution is therefore a first-class, NOT NULL
 * column — not optional metadata.
 * ========================================================================= */

export const sentences = pgTable(
  "sentences",
  {
    id: serial("id").primaryKey(),
    source: varchar("source", { length: 64 }).notNull().default("tatoeba"),
    sourceId: varchar("source_id", { length: 32 }).notNull(), // Tatoeba sentence id
    importRunId: integer("import_run_id").references(() => etlImportRuns.id, {
      onDelete: "set null",
    }),
    lang: varchar("lang", { length: 8 }).notNull(), // ISO 639-3, e.g. jpn / eng
    text: text("text").notNull(),
    // --- CC BY 2.0 FR compliance (constraint C1/C2) ---
    ownerUsername: varchar("owner_username", { length: 128 }).notNull().default(""),
    ownerUnknown: boolean("owner_unknown").notNull().default(false),
    attribution: text("attribution").notNull(),
    license: varchar("license", { length: 32 }).notNull().default("CC BY 2.0 FR"),
    // --- quality signals (constraint C4) ---
    charLength: integer("char_length").notNull().default(0),
    isReviewed: boolean("is_reviewed").notNull().default(false),
    contentHash: varchar("content_hash", { length: 64 }).notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    sourceUnique: uniqueIndex("sentences_source_unique").on(t.source, t.sourceId),
    langIdx: index("sentences_lang_idx").on(t.lang),
    lengthIdx: index("sentences_length_idx").on(t.charLength),
  }),
);

// Translation pairs. Self-referential many-to-many; Tatoeba lists each pair in
// both directions, and dangling endpoints are filtered out before insert.
export const sentenceLinks = pgTable(
  "sentence_links",
  {
    id: serial("id").primaryKey(),
    sentenceId: integer("sentence_id")
      .notNull()
      .references(() => sentences.id, { onDelete: "cascade" }),
    translationId: integer("translation_id")
      .notNull()
      .references(() => sentences.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pairUnique: uniqueIndex("sentence_links_pair_unique").on(
      t.sentenceId,
      t.translationId,
    ),
    sentenceIdx: index("sentence_links_sentence_idx").on(t.sentenceId),
  }),
);

/* =========================================================================
 * PHASE 04.5 — KNOWLEDGE ENRICHMENT
 *
 * One canonical, provenance-bound enrichment ledger. `value` is structured by
 * `kind`; all values are validated in etl/enrichment before reaching storage.
 * `source_import_run_id` is mandatory so untraceable enrichment cannot exist.
 * ========================================================================= */
export const knowledgeEnrichments = pgTable(
  "knowledge_enrichments",
  {
    id: serial("id").primaryKey(),
    // dictionary_entry | kanji_character
    subjectType: varchar("subject_type", { length: 32 }).notNull(),
    subjectId: integer("subject_id").notNull(),
    // furigana | jlpt | frequency | radical | strokes | pitch | conjugation
    kind: varchar("kind", { length: 32 }).notNull(),
    // A stable sub-key: e.g. reading for pitch, empty for one-per-subject kinds.
    variantKey: varchar("variant_key", { length: 255 }).notNull().default(""),
    value: jsonb("value").notNull(),
    sourceImportRunId: integer("source_import_run_id")
      .notNull()
      .references(() => etlImportRuns.id),
    // e.g. jmdict:1000001; pinpoints the source record used.
    sourceRecordKey: varchar("source_record_key", { length: 160 }).notNull(),
    // Direct source projection or named deterministic derivation.
    derivationMethod: varchar("derivation_method", { length: 96 }).notNull(),
    derivationVersion: varchar("derivation_version", { length: 32 }).notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    currentUnique: uniqueIndex("knowledge_enrichments_current_unique").on(
      t.subjectType,
      t.subjectId,
      t.kind,
      t.variantKey,
      t.derivationMethod,
      t.derivationVersion,
    ),
    kindIdx: index("knowledge_enrichments_kind_idx").on(t.kind),
    subjectIdx: index("knowledge_enrichments_subject_idx").on(t.subjectType, t.subjectId),
    provenanceIdx: index("knowledge_enrichments_provenance_idx").on(t.sourceImportRunId),
  }),
);

/* =========================================================================
 * PHASE 04.6 — PRODUCTION ETL OPERATIONS
 *
 * Checkpoints, dead letters, and reports are additive operational records.
 * They reference the existing canonical `etl_import_runs` provenance ledger;
 * imported knowledge tables are never dropped, truncated, or overwritten by
 * these operational records.
 * ========================================================================= */

// Exactly one logical import run owns one resumable checkpoint. The cursor is
// advanced only after a committed batch; replay after a crash is therefore
// safe because every domain loader is idempotent.
export const etlCheckpoints = pgTable(
  "etl_checkpoints",
  {
    id: serial("id").primaryKey(),
    importRunId: integer("import_run_id")
      .notNull()
      .unique()
      .references(() => etlImportRuns.id, { onDelete: "cascade" }),
    pipeline: varchar("pipeline", { length: 64 }).notNull(),
    source: varchar("source", { length: 64 }).notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceChecksumSha256: varchar("source_checksum_sha256", { length: 64 }).notNull(),
    // Number of source records for which all previous work is durably committed.
    lastCommittedCursor: integer("last_committed_cursor").notNull().default(0),
    batchesCommitted: integer("batches_committed").notNull().default(0),
    // Cumulative counters persisted with each checkpoint for accurate reports
    // after a resumed execution.
    progress: jsonb("progress").notNull().default({}),
    // running | failed | complete
    status: varchar("status", { length: 16 }).notNull().default("running"),
    resumeCount: integer("resume_count").notNull().default(0),
    lastError: text("last_error").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    resumableIdx: index("etl_checkpoints_resumable_idx").on(
      t.pipeline,
      t.source,
      t.sourceChecksumSha256,
      t.status,
    ),
  }),
);

// Rejected source records are durable and queryable, not merely console logs.
// `payload` is bounded/truncated by the writer to avoid unbounded DB growth.
export const etlDeadLetters = pgTable(
  "etl_dead_letters",
  {
    id: serial("id").primaryKey(),
    importRunId: integer("import_run_id")
      .notNull()
      .references(() => etlImportRuns.id, { onDelete: "cascade" }),
    pipeline: varchar("pipeline", { length: 64 }).notNull(),
    stage: varchar("stage", { length: 32 }).notNull(), // parse | validate | transform | load | pipeline
    sourceRecordKey: varchar("source_record_key", { length: 160 }).notNull().default(""),
    errorCode: varchar("error_code", { length: 96 }).notNull(),
    errorMessage: text("error_message").notNull(),
    payload: jsonb("payload").notNull().default({}),
    retryable: boolean("retryable").notNull().default(false),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    recordUnique: uniqueIndex("etl_dead_letters_record_unique").on(
      t.importRunId,
      t.pipeline,
      t.stage,
      t.sourceRecordKey,
      t.errorCode,
    ),
    runIdx: index("etl_dead_letters_run_idx").on(t.importRunId),
    stageIdx: index("etl_dead_letters_stage_idx").on(t.pipeline, t.stage),
  }),
);

// One final operational import report per logical import run. The import run
// itself remains the immutable source/provenance record; this holds metrics.
export const etlImportReports = pgTable(
  "etl_import_reports",
  {
    id: serial("id").primaryKey(),
    importRunId: integer("import_run_id")
      .notNull()
      .unique()
      .references(() => etlImportRuns.id, { onDelete: "cascade" }),
    pipeline: varchar("pipeline", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    sourceChecksumSha256: varchar("source_checksum_sha256", { length: 64 }).notNull(),
    resumed: boolean("resumed").notNull().default(false),
    resumeCount: integer("resume_count").notNull().default(0),
    report: jsonb("report").notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({ pipelineIdx: index("etl_import_reports_pipeline_idx").on(t.pipeline, t.status) }),
);

// Stage-level validation summary, retained separately from sampled dead letters
// so operators can audit acceptance ratios without replaying raw source data.
export const etlValidationReports = pgTable(
  "etl_validation_reports",
  {
    id: serial("id").primaryKey(),
    importRunId: integer("import_run_id")
      .notNull()
      .references(() => etlImportRuns.id, { onDelete: "cascade" }),
    pipeline: varchar("pipeline", { length: 64 }).notNull(),
    stage: varchar("stage", { length: 32 }).notNull().default("validation"),
    totalRecords: integer("total_records").notNull().default(0),
    validRecords: integer("valid_records").notNull().default(0),
    invalidRecords: integer("invalid_records").notNull().default(0),
    duplicateRecords: integer("duplicate_records").notNull().default(0),
    sampledErrors: jsonb("sampled_errors").notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ runIdx: index("etl_validation_reports_run_idx").on(t.importRunId, t.stage) }),
);

export type EtlCheckpoint = typeof etlCheckpoints.$inferSelect;
export type EtlDeadLetter = typeof etlDeadLetters.$inferSelect;
export type EtlImportReport = typeof etlImportReports.$inferSelect;
export type EtlValidationReport = typeof etlValidationReports.$inferSelect;

export type KnowledgeEnrichment = typeof knowledgeEnrichments.$inferSelect;

export type Sentence = typeof sentences.$inferSelect;
export type SentenceLink = typeof sentenceLinks.$inferSelect;

/* =========================================================================
 * PHASE 06.3 — RADICAL / COMPONENT RELATIONSHIPS
 *
 * Two distinct concepts, modelled separately and explicitly:
 *
 *  - RADICAL: the single classifying element of a kanji (Kangxi 1–214).
 *    Previously only a bare number lived on kanji_characters; this table
 *    gives that number an identity (character, variants, strokes, meaning).
 *
 *  - COMPONENT: every visual piece a kanji is built from (many per kanji).
 *    Previously a JSON array inside an enrichment blob, which cannot be
 *    indexed, joined, reverse-queried, or AND-filtered. Now a first-class
 *    relationship row.
 * ========================================================================= */

export const radicals = pgTable(
  "radicals",
  {
    id: serial("id").primaryKey(),
    /** Kangxi radical number, 1–214. */
    number: integer("number").notNull().unique(),
    /** Canonical radical character, e.g. 水. */
    character: varchar("character", { length: 8 }).notNull(),
    /** Positional variants, e.g. ["氵","氺"] for radical 85. */
    variants: jsonb("variants").notNull().default([]),
    strokeCount: integer("stroke_count").notNull(),
    /** Short English descriptor, e.g. "water". */
    meaning: text("meaning").notNull().default(""),
    /** Japanese name of the radical form, e.g. "さんずい". */
    reading: text("reading").notNull().default(""),
    importRunId: integer("import_run_id").references(() => etlImportRuns.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    characterIdx: index("radicals_character_idx").on(t.character),
    strokeIdx: index("radicals_stroke_idx").on(t.strokeCount),
  }),
);

/**
 * Many-to-many kanji ↔ component relationship.
 *
 * `radicalId` is populated when the component is itself a Kangxi radical (or a
 * recognised variant of one), which links the two systems together without
 * conflating them.
 */
export const kanjiComponents = pgTable(
  "kanji_components",
  {
    id: serial("id").primaryKey(),
    kanjiId: integer("kanji_id")
      .notNull()
      .references(() => kanjiCharacters.id, { onDelete: "cascade" }),
    /** The component character itself. */
    component: varchar("component", { length: 8 }).notNull(),
    /** Set when this component maps to a Kangxi radical. */
    radicalId: integer("radical_id").references(() => radicals.id, {
      onDelete: "set null",
    }),
    position: integer("position").notNull().default(0),
    /** Provenance is mandatory: untraceable relationships cannot exist. */
    sourceImportRunId: integer("source_import_run_id")
      .notNull()
      .references(() => etlImportRuns.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pairUnique: uniqueIndex("kanji_components_pair_unique").on(t.kanjiId, t.component),
    kanjiIdx: index("kanji_components_kanji_idx").on(t.kanjiId),
    // Drives reverse lookup (component → kanji) and multi-component AND search.
    componentIdx: index("kanji_components_component_idx").on(t.component),
    radicalIdx: index("kanji_components_radical_idx").on(t.radicalId),
  }),
);

export type Radical = typeof radicals.$inferSelect;
export type KanjiComponent = typeof kanjiComponents.$inferSelect;

export type KanjiCharacter = typeof kanjiCharacters.$inferSelect;
export type KanjiReading = typeof kanjiReadings.$inferSelect;
export type KanjiMeaning = typeof kanjiMeanings.$inferSelect;

export type EtlImportRun = typeof etlImportRuns.$inferSelect;
export type DictionaryEntry = typeof dictionaryEntries.$inferSelect;
export type DictionaryKanji = typeof dictionaryKanji.$inferSelect;
export type DictionaryReading = typeof dictionaryReadings.$inferSelect;
export type DictionarySense = typeof dictionarySenses.$inferSelect;
