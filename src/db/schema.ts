import { pgTable, text, timestamp, boolean, integer, jsonb, real, uniqueIndex, index } from "drizzle-orm/pg-core";
import type { SessionQueueOrder } from "@/types/srs";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    avatarUrl: text("avatar_url"),
    targetJlptLevel: text("target_jlpt_level").default("N5").notNull(),
    targetDate: text("target_date"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    /* ============================================================
     * PHASE 13.4D-1 — application identity foundation (additive only).
     *
     * `authProvider` + `authSubject` record the external authentication
     * identity (e.g. provider "supabase", subject = Auth `sub` claim) that
     * this internal user was provisioned from. Both are NULLABLE so legacy
     * rows stay valid; Postgres unique indexes treat NULLs as distinct, so
     * unmapped rows can never collide. When both are set, the pair is
     * globally unique: no two application users may represent the same
     * provider identity. Deliberately NOT a foreign key and NOT equal to
     * users.id — the mapping stays explicit and provider-independent, and
     * can later grow into a `user_identities` table if a second provider
     * is ever introduced (not needed now).
     *
     * `role` is the APPLICATION-level CMS role. It is owned here, never
     * sourced from provider JWT claims. Validity is enforced at the
     * application layer (consistent with this schema: zero CHECK
     * constraints exist repository-wide). Default `learner`: existing rows
     * and new rows are least-privileged unless explicitly elevated by a
     * future audited operation.
     * ============================================================ */
    /** External auth provider key, e.g. "supabase". NULL = not yet mapped. */
    authProvider: text("auth_provider"),
    /** Stable provider subject, e.g. Supabase Auth `sub`. NULL = unmapped. */
    authSubject: text("auth_subject"),
    /** Controlled: learner | editor | reviewer | admin. Default learner. */
    role: text("role").default("learner").notNull(),
  },
  (table) => [
    uniqueIndex("idx_users_auth_identity_unique").on(
      table.authProvider,
      table.authSubject
    ),
  ]
);

export const questions = pgTable("questions", {
  id: text("id").primaryKey(),
  jlptLevel: text("jlpt_level").notNull(), // 'N5' | 'N4' | 'N3' | 'N2' | 'N1'
  section: text("section").notNull(), // 'vocab' | 'grammar' | 'reading' | 'listening'
  category: text("category").notNull(), // 'kanji_reading' | 'orthography' | 'contextual_use' | 'paraphrase' | 'usage' | 'grammar_form' | 'sentence_order' | 'text_grammar' | 'reading_short' | 'reading_mid' | 'reading_info' | 'listening_task' | 'listening_point' | 'listening_utterance' | 'listening_quick'
  mondaiNumber: integer("mondai_number").notNull(), // 1, 2, 3, etc.
  mondaiTitle: text("mondai_title").notNull(), // e.g. "問題１ つぎの ぶんの の ことばは どう かきますか。"
  questionType: text("question_type").notNull(), // 'multiple_choice' | 'star_order' | 'reading_passage' | 'listening_comprehension' | 'fill_in_blank'
  
  prompt: text("prompt").notNull(), // Japanese text with or without ruby
  promptFurigana: text("prompt_furigana"), // JSON or ruby HTML
  promptTranslation: text("prompt_translation").notNull(), // English translation
  
  passage: text("passage"), // Context passage for reading / dialogue
  passageFurigana: text("passage_furigana"),
  passageTranslation: text("passage_translation"),
  
  audioScript: text("audio_script"), // Audio transcript for listening
  audioUrl: text("audio_url"), // Optional audio file url
  
  // Options for multiple choice: [{ id: "1", text: "...", furigana?: "...", translation?: "..." }]
  options: jsonb("options").notNull().$type<Array<{
    id: string;
    text: string;
    furigana?: string;
    translation?: string;
  }>>(),
  
  // For star order questions: 4 parts, star position (1-4), correct order array e.g. [2, 4, 1, 3]
  starOrderParts: jsonb("star_order_parts").$type<{
    parts: Array<{ id: string; text: string; furigana?: string }>;
    correctOrder: string[]; // e.g. ["2", "4", "1", "3"]
    starPosition: number; // 1-indexed (usually 3 in official JLPT)
  }>(),
  
  correctAnswer: text("correct_answer").notNull(), // Option ID, e.g. "2" or part ID
  
  explanation: text("explanation").notNull(), // Comprehensive explanation in Japanese & English
  explanationBreakdown: jsonb("explanation_breakdown").$type<{
    grammarPoints?: Array<{ title: string; explanation: string; example?: string }>;
    vocabNotes?: Array<{ word: string; reading: string; meaning: string }>;
    whyWrong?: Record<string, string>;
    strategyTip?: string;
  }>(),
  
  difficulty: integer("difficulty").default(3).notNull(), // 1 to 5
  tags: jsonb("tags").default([]).notNull().$type<string[]>(), // e.g. ["particles", "verbs", "daily-life"]
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jlptTests = pgTable("jlpt_tests", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  jlptLevel: text("jlpt_level").notNull(), // 'N5' | 'N4' | 'N3' | 'N2' | 'N1'
  code: text("code").notNull(), // e.g. "JLPT-N5-SAMPLE-01"
  description: text("description").notNull(),
  totalDurationMinutes: integer("total_duration_minutes").notNull(), // Total minutes (e.g. 90)
  
  // Section timing in minutes: e.g. { vocabGrammarReading: 60, listening: 30 }
  sectionDurations: jsonb("section_durations").notNull().$type<Record<string, number>>(),
  
  passingScore: integer("passing_score").default(80).notNull(),
  totalScore: integer("total_score").default(180).notNull(),
  
  // Sectional requirements: { "language_knowledge_reading": { maxScore: 120, passScore: 38 }, "listening": { maxScore: 60, passScore: 19 } }
  sectionConfigs: jsonb("section_configs").notNull().$type<Record<string, {
    title: string;
    maxScore: number;
    passScore: number;
    durationMinutes: number;
    mondaiList: number[];
  }>>(),
  
  isPublished: boolean("is_published").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jlptTestQuestions = pgTable("jlpt_test_questions", {
  id: text("id").primaryKey(),
  testId: text("test_id").notNull(),
  questionId: text("question_id").notNull(),
  sectionKey: text("section_key").notNull(), // 'vocab' | 'grammar_reading' | 'listening' | 'language_knowledge_reading'
  mondaiNumber: integer("mondai_number").notNull(),
  orderIndex: integer("order_index").notNull(),
  points: real("points").default(1.0).notNull(),
});

export const testSessions = pgTable("test_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  testId: text("test_id"), // Null if custom drill
  quizType: text("quiz_type").notNull(), // 'jlpt_mock' | 'quick_drill' | 'section_practice' | 'weakness_drill' | 'custom_quiz'
  jlptLevel: text("jlpt_level").notNull(),
  sectionFilter: text("section_filter").default("all").notNull(),
  status: text("status").default("in_progress").notNull(), // 'in_progress' | 'completed' | 'abandoned' | 'timed_out'
  
  isTimed: boolean("is_timed").default(true).notNull(),
  timeLimitSeconds: integer("time_limit_seconds").notNull(),
  timeRemainingSeconds: integer("time_remaining_seconds").notNull(),
  totalTimeSpentSeconds: integer("total_time_spent_seconds").default(0).notNull(),
  
  currentSectionIndex: integer("current_section_index").default(0).notNull(),
  
  score: real("score"), // Scaled score (e.g. 142/180 or percentage)
  maxScore: real("max_score"),
  passed: boolean("passed"),
  
  // Section breakdown: { "language_knowledge_reading": { earned: 85, max: 120, passed: true }, "listening": { earned: 42, max: 60, passed: true } }
  sectionScores: jsonb("section_scores").$type<Record<string, {
    title: string;
    earned: number;
    max: number;
    percentage: number;
    passed: boolean;
    requiredScore: number;
  }>>(),
  
  // Category breakdown: { "kanji_reading": { correct: 5, total: 6, percentage: 83.3 }, ... }
  categoryBreakdown: jsonb("category_breakdown").$type<Record<string, {
    categoryName: string;
    correct: number;
    total: number;
    percentage: number;
    grade: "A" | "B" | "C"; // JLPT official A (>=67%), B (34-66%), C (<34%)
  }>>(),
  
  // Actionable recommendations & weaknesses
  recommendations: jsonb("recommendations").$type<Array<{
    title: string;
    description: string;
    level: "N5" | "N4" | "N3" | "N2" | "N1";
    domain: string;
    severity: "high" | "medium" | "low";
  }>>(),
  
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const testAnswers = pgTable("test_answers", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  questionId: text("question_id").notNull(),
  selectedAnswer: text("selected_answer"), // Option ID or serialized star ordering
  starOrderSubmitted: jsonb("star_order_submitted").$type<string[]>(),
  isCorrect: boolean("is_correct"),
  timeSpentSeconds: integer("time_spent_seconds").default(0).notNull(),
  isFlagged: boolean("is_flagged").default(false).notNull(),
  answeredAt: timestamp("answered_at").defaultNow().notNull(),
});

/* ============================================================
 * PHASE 11 — SRS (Spaced Repetition System)
 *
 * ARCHITECTURAL NOTE (Prompt 11.1):
 * NO scheduling algorithm is hard-coded into the database.
 * The database persists only:
 *   - `schedulerKey`  -> a registry lookup key (string)
 *   - `schedulerParams` -> algorithm parameters (jsonb)
 *   - `paramsSnapshot`  -> immutable audit copy at review time
 * All interval math lives in versioned code strategies
 * (see src/services/srs/strategies/*).
 * ============================================================ */

/**
 * Mirror of the in-code scheduler registry. Exists purely for
 * provenance / admin introspection and audit trails. It NEVER
 * contains algorithm logic — only descriptors and default params.
 */
export const srsSchedulers = pgTable("srs_schedulers", {
  key: text("key").primaryKey(), // 'sm2' | 'leitner-box' | 'fsrs-lite' | 'fixed-ladder'
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  version: text("version").notNull(),
  description: text("description").notNull(),
  strengths: jsonb("strengths").default([]).notNull().$type<string[]>(),
  defaultParams: jsonb("default_params").notNull().$type<Record<string, unknown>>(),
  isBuiltIn: boolean("is_built_in").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
});

export const srsDecks = pgTable("srs_decks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  jlptLevel: text("jlpt_level").default("N5").notNull(),
  ownerId: text("owner_id").default("anonymous-user").notNull(),

  // Pluggable algorithm binding — the ONLY algorithm reference stored.
  schedulerKey: text("scheduler_key").notNull(),
  schedulerParams: jsonb("scheduler_params")
    .default({})
    .notNull()
    .$type<Record<string, unknown>>(),

  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const srsCards = pgTable("srs_cards", {
  id: text("id").primaryKey(),
  deckId: text("deck_id").notNull(),
  userId: text("user_id").default("anonymous-user").notNull(),

  cardType: text("card_type").notNull(), // 'vocabulary' | 'kanji' | 'grammar' | 'question'
  front: text("front").notNull(),
  back: text("back").notNull(),
  reading: text("reading"),
  meaning: text("meaning"),
  hint: text("hint"),

  // Knowledge provenance (ties SRS to dictionary/kanji/grammar/questions)
  sourceType: text("source_type").default("manual").notNull(),
  sourceRef: text("source_ref"),
  sourceQuestionId: text("source_question_id"),

  /* ---- Mutable scheduling state (algorithm-agnostic superset) ----
   * Every column below is a generic container. Different algorithms
   * read/write only the fields they care about, so adding a new
   * algorithm never requires a schema migration.
   */
  repetitions: integer("repetitions").default(0).notNull(),
  easeFactor: real("ease_factor").default(2.5).notNull(),
  intervalDays: real("interval_days").default(0).notNull(),
  lapses: integer("lapses").default(0).notNull(),
  box: integer("box").default(0).notNull(),
  stabilityDays: real("stability_days").default(0).notNull(),
  difficulty: real("difficulty").default(5).notNull(),
  stepIndex: integer("step_index").default(0).notNull(),
  isLearning: boolean("is_learning").default(true).notNull(),
  phase: text("phase").default("learning").notNull(), // learning|review|relearning|graduated
  totalReviews: integer("total_reviews").default(0).notNull(),
  correctReviews: integer("correct_reviews").default(0).notNull(),

  // Last scheduler that touched this card (audit, not logic)
  schedulerKey: text("scheduler_key").notNull(),

  dueAt: timestamp("due_at").defaultNow().notNull(),
  lastReviewedAt: timestamp("last_reviewed_at"),
  isSuspended: boolean("is_suspended").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const srsReviews = pgTable("srs_reviews", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull(),
  deckId: text("deck_id").notNull(),
  userId: text("user_id").default("anonymous-user").notNull(),

  rating: text("rating").notNull(), // again | hard | good | easy
  wasCorrect: boolean("was_correct").default(true).notNull(),
  timeSpentMs: integer("time_spent_ms").default(0).notNull(),

  intervalDays: real("interval_days").default(0).notNull(),
  previousIntervalDays: real("previous_interval_days").default(0).notNull(),
  dueAt: timestamp("due_at").notNull(),

  // Immutable audit: which algorithm + params produced this interval
  schedulerKey: text("scheduler_key").notNull(),
  schedulerVersion: text("scheduler_version").notNull(),
  paramsSnapshot: jsonb("params_snapshot")
    .default({})
    .notNull()
    .$type<Record<string, unknown>>(),
  stateBefore: jsonb("state_before").default({}).notNull().$type<Record<string, unknown>>(),
  stateAfter: jsonb("state_after").default({}).notNull().$type<Record<string, unknown>>(),
  explanation: text("explanation").default("").notNull(),

  /** Prompt 11.2 — links the review to its review session (null for ad-hoc grades). */
  sessionId: text("session_id"),

  /* ---- Prompt 11.4: SRS synchronization ----
   * clientId is the DEVICE-generated idempotency key. A device that retries a
   * push must never cause a review to be applied twice, so this column carries
   * a UNIQUE constraint. NULL is allowed for server-originated reviews.
   */
  clientId: text("client_id").unique(),
  /** Device that produced this review (null = server/web origin). */
  deviceId: text("device_id"),

  reviewedAt: timestamp("reviewed_at").defaultNow().notNull(),
});

/* ============================================================
 * PHASE 11 — Prompt 11.4: SRS Synchronization
 *
 * Mobile/Flutter and web clients study against the same account.
 * This table tracks each device so clients can:
 *   - pull only changes since their last cursor (delta pull)
 *   - push offline-collected review events idempotently
 * ============================================================ */
export const srsSyncDevices = pgTable("srs_sync_devices", {
  id: text("id").primaryKey(),
  userId: text("user_id").default("anonymous-user").notNull(),
  /** Client-generated stable device identifier. */
  deviceId: text("device_id").notNull(),
  name: text("name").default("Unnamed device").notNull(),
  platform: text("platform").default("web").notNull(), // web | ios | android | desktop
  appVersion: text("app_version").default("unknown").notNull(),

  /** ISO timestamp of the last successful pull (delta cursor). */
  lastPulledAt: timestamp("last_pulled_at"),
  /** ISO timestamp of the last successful push. */
  lastPushedAt: timestamp("last_pushed_at"),
  /** Last scheduler-registry fingerprint the device acknowledged. */
  lastRegistryFingerprint: text("last_registry_fingerprint"),

  /** Set when a device is lost/wiped so it can be revoked. */
  isRevoked: boolean("is_revoked").default(false).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
});

/**
 * Append-only audit of sync operations. Never used as a data source for
 * scheduling — the review log remains the single source of truth.
 */
export const srsSyncLog = pgTable("srs_sync_log", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  userId: text("user_id").default("anonymous-user").notNull(),
  /** push | pull | snapshot | register */
  operation: text("operation").notNull(),
  status: text("status").default("ok").notNull(), // ok | partial | failed

  accepted: integer("accepted").default(0).notNull(),
  duplicatesSkipped: integer("duplicates_skipped").default(0).notNull(),
  conflictsResolved: integer("conflicts_resolved").default(0).notNull(),
  cardsTouched: integer("cards_touched").default(0).notNull(),
  payloadCount: integer("payload_count").default(0).notNull(),

  cursorBefore: text("cursor_before"),
  cursorAfter: text("cursor_after"),
  registryFingerprint: text("registry_fingerprint"),
  detail: jsonb("detail").default({}).notNull().$type<Record<string, unknown>>(),
  message: text("message").default("").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ============================================================
 * PHASE 11 — Prompt 11.2: Review Session
 *
 * A persisted, resumable review session. The queue is stored once at
 * plan time; ALL progress (cursor, rating counts, accuracy, duration)
 * is DERIVED from srs_reviews.session_id so the review log remains the
 * single source of truth and can never drift from the session.
 * ============================================================ */
export const srsReviewSessions = pgTable("srs_review_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").default("anonymous-user").notNull(),
  /** Null => session draws from every non-archived deck owned by the user. */
  deckId: text("deck_id"),

  // 'active' | 'completed' | 'abandoned'
  status: text("status").default("active").notNull(),

  /** Frozen planner input: limits, ordering, daily-budget decision. */
  config: jsonb("config").default({}).notNull().$type<{
    newLimit: number;
    reviewLimit: number;
    maxCards: number;
    order: SessionQueueOrder;
    dailyNewBudget: number;
    dailyNewUsedAtPlan: number;
    deckName: string;
    schedulerKeys: string[];
  }>(),

  /** Ordered plan. kind is advisory (for stats); scheduling is still per-deck. */
  queue: jsonb("queue")
    .default([])
    .notNull()
    .$type<Array<{ cardId: string; kind: "new" | "review" }>>(),

  startedAt: timestamp("started_at").defaultNow().notNull(),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  cancelledReason: text("cancelled_reason"),
});

/* ============================================================
 * PHASE 11 — Prompt 11.3: Daily Due Queue
 *
 * Per-user scheduling preferences that govern how "today" is defined
 * and how much work each day should contain.
 *
 * NOTE: no daily *counts* are persisted anywhere. Streaks, history,
 * and daily workload are always DERIVED from srs_reviews grouped by
 * the learner's local day, so the dashboard can never drift from the
 * review log (single source of truth).
 * ============================================================ */
export const srsUserSettings = pgTable("srs_user_settings", {
  userId: text("user_id").primaryKey(),
  /** IANA zone used to resolve the learner's local calendar day. */
  timezone: text("timezone").default("UTC").notNull(),
  /** Local hour at which one study day rolls into the next (Anki-style cutoff). */
  dayCutoffHour: integer("day_cutoff_hour").default(4).notNull(),

  dailyNewTarget: integer("daily_new_target").default(20).notNull(),
  dailyReviewTarget: integer("daily_review_target").default(200).notNull(),
  /** Hard ceiling on reviews pulled per day. 0 = unlimited. */
  maxDailyReviews: integer("max_daily_reviews").default(0).notNull(),
  /** Hard ceiling on new cards introduced per day. 0 = unlimited. */
  maxDailyNew: integer("max_daily_new").default(0).notNull(),

  /** Suggest redistributing a heavy backlog across following days. */
  loadBalanceBacklog: boolean("load_balance_backlog").default(true).notNull(),
  /** How many days forward the forecast horizon spans. */
  forecastDays: integer("forecast_days").default(14).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/* ============================================================
 * PHASE 11 — Prompt 11.5: Personalized Review
 *
 * Stores USER INTENT ONLY (weighting preferences).
 * Deliberately NO derived profile columns: accuracy, weakness,
 * velocity and retention are always computed live from
 * srs_reviews, so the profile can never drift from the log.
 * ============================================================ */
export const srsPersonalization = pgTable("srs_personalization", {
  userId: text("user_id").primaryKey(),
  weaknessWeight: real("weakness_weight").default(0.5).notNull(),
  urgencyWeight: real("urgency_weight").default(0.3).notNull(),
  difficultyWeight: real("difficulty_weight").default(0.2).notNull(),
  preferWeakAreas: boolean("prefer_weak_areas").default(true).notNull(),
  maxWeakCardsPerSession: integer("max_weak_cards_per_session").default(0).notNull(),
  autoAdaptTargets: boolean("auto_adapt_targets").default(true).notNull(),
  weakFirst: boolean("weak_first").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/* ============================================================
 * KNOWLEDGE LAYER — Kana Charts & Kanji Mind Tree
 *
 * Original, first-party reference data (no third-party datasets).
 * Provenance is recorded per row via sourceRef so any future import
 * from a licensed source can replace it without schema change.
 * ============================================================ */

/** Hiragana / katakana reference table. */
export const kanaEntries = pgTable("kana_entries", {
  id: text("id").primaryKey(), // "hira-a" | "kata-kya"
  character: text("character").notNull(),
  /** hiragana | katakana */
  script: text("script").notNull(),
  romaji: text("romaji").notNull(),
  /** gojuon | dakuten | handakuten | yoon */
  category: text("category").notNull(),
  /** Consonant row: a | k | s | t | n | h | m | y | r | w | n-final */
  rowKey: text("row_key").notNull(),
  /** Vowel column: a | i | u | e | o */
  columnKey: text("column_key").notNull(),
  /** Unmodified base kana for dakuten / yoon forms. */
  baseCharacter: text("base_character"),
  /** True when the kana is historically obsolete but shown for completeness. */
  isArchaic: boolean("is_archaic").default(false).notNull(),
  mnemonic: text("mnemonic"),
  sourceRef: text("source_ref").notNull(),
  orderIndex: integer("order_index").notNull(),
});

/**
 * Master element table for the mind tree. Holds classic radicals AND
 * non-radical "primitive" components (building-block kanji), because a
 * kanji's meaningful parts are frequently full characters (e.g. 寺 in 時).
 */
export const kanjiRadicals = pgTable("kanji_radicals", {
  id: text("id").primaryKey(),
  character: text("character").notNull().unique(),
  /** Variant shapes the element takes inside a kanji (e.g. 氵 for 水). */
  altForms: jsonb("alt_forms").default([]).notNull().$type<string[]>(),
  meaning: text("meaning").notNull(),
  readingKun: text("reading_kun"),
  readingOn: text("reading_on"),
  strokeCount: integer("stroke_count").notNull(),
  /** Kangxi radical index when the element is a classical radical. */
  kangxiNumber: integer("kangxi_number"),
  /** radical | primitive */
  category: text("category").notNull(),
  /** semantic | phonetic | positional | structural */
  typicalRole: text("typical_role").notNull(),
  mnemonic: text("mnemonic"),
  sourceRef: text("source_ref").notNull(),
});

/** Kanji headwords. */
export const kanjiEntries = pgTable("kanji_entries", {
  id: text("id").primaryKey(),
  character: text("character").notNull().unique(),
  meaning: text("meaning").notNull(),
  readingsKun: jsonb("readings_kun").default([]).notNull().$type<string[]>(),
  readingsOn: jsonb("readings_on").default([]).notNull().$type<string[]>(),
  strokeCount: integer("stroke_count").notNull(),
  jlptLevel: text("jlpt_level").notNull(),
  gradeLevel: integer("grade_level"),
  /** Primary / governing element. */
  primaryRadicalId: text("primary_radical_id"),
  mnemonic: text("mnemonic"),
  /** Example vocabulary built on this kanji. */
  vocabulary: jsonb("vocabulary").default([]).notNull().$type<
    Array<{ word: string; reading: string; meaning: string }>
  >(),
  sourceRef: text("source_ref").notNull(),
});

/** Mind-tree edges: which elements make up which kanji, and how. */
export const kanjiComposition = pgTable("kanji_composition", {
  id: text("id").primaryKey(),
  kanjiId: text("kanji_id").notNull(),
  elementId: text("element_id").notNull(),
  /** semantic | phonetic | positional | structural */
  role: text("role").notNull(),
  /** left | right | top | bottom | enclosure | anywhere */
  position: text("position"),
  /** Shape as it actually appears inside the kanji (may be an alt form). */
  renderedAs: text("rendered_as").notNull(),
  orderIndex: integer("order_index").default(0).notNull(),
});

/* ============================================================
 * PHASE 12 — Prompt 12.1: Event-Based XP
 *
 * XP is an APPEND-ONLY LEDGER, never a mutable counter.
 *   - Totals, levels and streak bonuses are DERIVED by summing events.
 *   - `dedupeKey` carries a UNIQUE constraint, so replaying the same
 *     domain event (e.g. a synced review from Phase 11.4) can never
 *     award XP twice.
 *   - Reversals are recorded via `revokedAt`, not by deleting rows,
 *     so the ledger stays auditable.
 *
 * No scoring logic lives in the database: rules are versioned code
 * (see src/services/gamification/rules/*), mirroring the Phase 11.1
 * scheduler registry.
 * ============================================================ */
export const xpEvents = pgTable("xp_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").default("anonymous-user").notNull(),

  /** Domain event that triggered the award, e.g. "review.graded". */
  eventType: text("event_type").notNull(),
  /** Rule that scored it. */
  ruleKey: text("rule_key").notNull(),
  ruleVersion: text("rule_version").notNull(),

  /** Net XP awarded (already capped/multiplied). */
  points: integer("points").notNull(),
  /** Points before multipliers, for audit. */
  basePoints: integer("base_points").default(0).notNull(),
  /** Combined multiplier actually applied. */
  multiplier: real("multiplier").default(1).notNull(),

  /**
   * Idempotency key derived from the source entity,
   * e.g. "review:rev-123" or "jlpt:session-9".
   */
  dedupeKey: text("dedupe_key").unique(),

  /** Provenance back into the originating domain. */
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id"),

  /** Human-readable scoring breakdown for the ledger UI. */
  breakdown: jsonb("breakdown").default([]).notNull().$type<
    Array<{ label: string; value: number; kind: "base" | "bonus" | "multiplier" | "cap" }>
  >(),
  detail: jsonb("detail").default({}).notNull().$type<Record<string, unknown>>(),

  /** Set when the originating action is undone (Phase 11.2 undo). */
  revokedAt: timestamp("revoked_at"),
  revokedReason: text("revoked_reason"),

  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Mirror of the in-code XP rule registry — provenance and admin
 * introspection only. Contains descriptors and default params,
 * never scoring logic.
 */
export const xpRules = pgTable("xp_rules", {
  key: text("key").primaryKey(),
  version: text("version").notNull(),
  eventType: text("event_type").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  basePoints: integer("base_points").notNull(),
  dailyCap: integer("daily_cap").default(0).notNull(),
  defaultParams: jsonb("default_params").notNull().$type<Record<string, unknown>>(),
  isActive: boolean("is_active").default(true).notNull(),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
});

export const userAnalytics = pgTable("user_analytics", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  jlptLevel: text("jlpt_level").notNull(),
  testsCompleted: integer("tests_completed").default(0).notNull(),
  drillsCompleted: integer("drills_completed").default(0).notNull(),
  totalQuestionsAnswered: integer("total_questions_answered").default(0).notNull(),
  totalCorrectAnswers: integer("total_correct_answers").default(0).notNull(),
  averageScorePercent: real("average_score_percent").default(0).notNull(),
  streakDays: integer("streak_days").default(1).notNull(),
  lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
  categoryMastery: jsonb("category_mastery").$type<Record<string, {
    attempted: number;
    correct: number;
    masteryPercent: number;
  }>>(),
  weakGrammarPoints: jsonb("weak_grammar_points").$type<string[]>(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/* ============================================================
 * PHASE 13 — Prompt 13.2: Knowledge retrieval corpus
 *
 * Additive tables only. These complete the four knowledge domains the
 * AI layer retrieves from (dictionary, kanji, grammar, sentences).
 * Kanji already exists above (kanji_entries / kanji_radicals /
 * kanji_composition) and is NOT redefined here — there is one
 * canonical kanji table.
 *
 * Every row carries `sourceRef`, which points at `knowledge_sources`
 * so retrieval can return provenance (source, version, license) with
 * each record. No AI provider logic lives in these tables.
 * ============================================================ */

/** Provenance registry: who supplied a knowledge record, and under what licence. */
export const knowledgeSources = pgTable("knowledge_sources", {
  /** Stable ref used by every knowledge row, e.g. "first-party:dictionary-core:v1". */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  /** SPDX identifier or plain-language licence statement. */
  license: text("license").notNull(),
  url: text("url"),
  description: text("description").notNull(),
  /** dictionary | kanji | grammar | sentence | mixed */
  domain: text("domain").notNull(),
  recordCount: integer("record_count").default(0).notNull(),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
});

/** Dictionary headwords with structured senses. */
export const dictionaryEntries = pgTable("dictionary_entries", {
  id: text("id").primaryKey(),
  /** Written form (kanji or kana), e.g. 水 */
  headword: text("headword").notNull(),
  /** Kana reading, e.g. みず */
  reading: text("reading").notNull(),
  /** Romaji reading for latin-script queries, e.g. mizu */
  romaji: text("romaji").notNull(),
  jlptLevel: text("jlpt_level").notNull(),
  isCommon: boolean("is_common").default(true).notNull(),
  frequencyRank: integer("frequency_rank"),
  partsOfSpeech: jsonb("parts_of_speech").default([]).notNull().$type<string[]>(),
  /** Ordered meaning groups. */
  senses: jsonb("senses").default([]).notNull().$type<
    Array<{ glosses: string[]; note?: string | null }>
  >(),
  /** Kanji characters used by the headword — links into kanji_entries. */
  kanjiCharacters: jsonb("kanji_characters").default([]).notNull().$type<string[]>(),
  tags: jsonb("tags").default([]).notNull().$type<string[]>(),
  sourceRef: text("source_ref").notNull(),
});

/** Grammar patterns (one row per teachable pattern). */
export const grammarPatterns = pgTable("grammar_patterns", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  /** Display title, e.g. 〜てから */
  title: text("title").notNull(),
  /** Formation skeleton, e.g. "Verb て-form + から" */
  structure: text("structure").notNull(),
  /** Short English meaning. */
  meaning: text("meaning").notNull(),
  /** Longer teaching explanation. */
  explanation: text("explanation").notNull(),
  formation: text("formation"),
  jlptLevel: text("jlpt_level").notNull(),
  /** Typical learner errors, used by correction and tutoring flows. */
  commonMistakes: jsonb("common_mistakes").default([]).notNull().$type<string[]>(),
  tags: jsonb("tags").default([]).notNull().$type<string[]>(),
  sourceRef: text("source_ref").notNull(),
});

/** Example sentences, optionally linked to a grammar pattern and vocabulary. */
export const exampleSentences = pgTable("example_sentences", {
  id: text("id").primaryKey(),
  japanese: text("japanese").notNull(),
  /** Kana reading of the full sentence. */
  reading: text("reading").notNull(),
  english: text("english").notNull(),
  jlptLevel: text("jlpt_level").notNull(),
  /** Optional link to grammar_patterns.id */
  grammarId: text("grammar_id"),
  /** Linked dictionary_entries.id values. */
  dictionaryEntryIds: jsonb("dictionary_entry_ids").default([]).notNull().$type<string[]>(),
  /** Kanji characters appearing in the sentence. */
  kanjiCharacters: jsonb("kanji_characters").default([]).notNull().$type<string[]>(),
  tags: jsonb("tags").default([]).notNull().$type<string[]>(),
  sourceRef: text("source_ref").notNull(),
});

/* ============================================================
 * PHASE 12B — Multilingual Translation Storage & Reverse Lookup
 *
 * Dedicated additive translation repository separating localised
 * content from canonical Japanese records.
 * Languages: en (English), ta (Tamil), ml (Malayalam)
 * Sources: canonical | verified_human | machine
 * ============================================================ */
export const entityTranslations = pgTable(
  "entity_translations",
  {
    id: text("id").primaryKey(),
    /** Controlled: dictionary | kanji | grammar | sentence | radical | jlpt */
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /** Controlled: en | ta | ml */
    language: text("language").notNull(),
    /** Primary localized searchable gloss (normalized) */
    translatedText: text("translated_text").notNull(),
    /** Optional secondary transliteration or romanization */
    secondaryText: text("secondary_text"),
    /** Optional cultural, contextual, or grammatical notes */
    contextNotes: text("context_notes"),
    /** Controlled: canonical | verified_human | machine */
    sourceType: text("source_type").notNull(),
    /** Attribution reference, e.g. dataset ref or model version */
    sourceRef: text("source_ref"),
    /** Whether the translation has been verified by a qualified speaker */
    isVerified: boolean("is_verified").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_entity_translations_unique").on(
      table.entityType,
      table.entityId,
      table.language,
      table.translatedText
    ),
    index("idx_entity_translations_lookup").on(
      table.entityType,
      table.entityId,
      table.language
    ),
    index("idx_entity_translations_reverse").on(
      table.language,
      table.translatedText
    ),
  ]
);

/* ============================================================
 * PHASE 13.2 — Knowledge CMS: editorial overlay lifecycle
 *
 * ADDITIVE ONLY. These three tables form the versioned editorial
 * overlay on top of the canonical ETL knowledge baseline. They NEVER
 * modify canonical tables:
 *   - `entity_id IS NOT NULL` → overlay for an existing canonical entity
 *     (validated at the application level; NO polymorphic FK by design)
 *   - `entity_id IS NULL` → CMS-originated content with no canonical entity
 *
 * Controlled vocabularies are documented on each column and enforced by
 * the CMS service layer (Phase 13.3+), consistent with the rest of this
 * schema (e.g. srs_reviews.rating, questions.jlpt_level): no CHECK
 * constraints, so vocabulary evolution never requires a migration.
 *
 * No foreign keys — including author/reviewer/actor references to users.
 * The existing schema keeps every cross-table reference as an
 * application-validated text key (zero FKs repository-wide); introducing
 * FKs here would couple the CMS lifecycle to the users-table lifecycle
 * and break that consistency. Trade-off documented per Phase 13.2 §7.
 *
 * Learner-visibility rule (resolved by a later CMS resolver, NOT here):
 * published CMS payload if present, otherwise the canonical ETL record.
 * Draft/review/approved/scheduled content is never learner-visible.
 * ============================================================ */

/** Current editorial object per CMS-managed knowledge item. */
export const cmsContentItems = pgTable(
  "cms_content_items",
  {
    id: text("id").primaryKey(),
    /** Controlled: dictionary | kanji | radical | grammar | sentence | jlpt | article | learning_resource */
    contentType: text("content_type").notNull(),
    /** Canonical entity key when overlaying ETL content; NULL when CMS-originated. No FK (polymorphic). */
    entityId: text("entity_id"),
    title: text("title").notNull(),
    /** Controlled: draft | review | approved | scheduled | published | archived */
    status: text("status").default("draft").notNull(),
    /** Denormalized pointer to the latest cms_content_versions.version_number (1-based). Maintained by the CMS service under concurrency protection. */
    currentVersion: integer("current_version").default(1).notNull(),
    /** Editable working payload; published resolution uses the published version snapshot. */
    stagedPayload: jsonb("staged_payload")
      .default({})
      .notNull()
      .$type<Record<string, unknown>>(),
    /** Provenance ref into knowledge_sources (or a first-party editorial ref). Required on every item. */
    sourceRef: text("source_ref").notNull(),
    /** Controlled: canonical_override | editorial_curated | community_verified */
    provenanceType: text("provenance_type").notNull(),
    /** Canonical source preserved when this item overrides ETL content. */
    originalSourceRef: text("original_source_ref"),
    /** Author user key. No FK — consistent with users references elsewhere (e.g. srs_cards.user_id). */
    authorId: text("author_id").notNull(),
    reviewerId: text("reviewer_id"),
    editorialNotes: text("editorial_notes"),
    scheduledAt: timestamp("scheduled_at"),
    publishedAt: timestamp("published_at"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_cms_content_items_type_status").on(
      table.contentType,
      table.status
    ),
    index("idx_cms_content_items_entity").on(table.entityId),
    index("idx_cms_content_items_status_scheduled").on(
      table.status,
      table.scheduledAt
    ),
  ]
);

/** Immutable editorial snapshots. Rows are insert-only; never updated in place. */
export const cmsContentVersions = pgTable(
  "cms_content_versions",
  {
    id: text("id").primaryKey(),
    /** Parent cms_content_items.id. No FK — application-validated, consistent with this schema. */
    contentItemId: text("content_item_id").notNull(),
    /** 1-based per item; unique with contentItemId so a version can never be silently overwritten. */
    versionNumber: integer("version_number").notNull(),
    snapshotPayload: jsonb("snapshot_payload")
      .notNull()
      .$type<Record<string, unknown>>(),
    /** Item status at snapshot time (same controlled vocabulary as cms_content_items.status). */
    statusAtSnapshot: text("status_at_snapshot").notNull(),
    createdById: text("created_by_id").notNull(),
    changeSummary: text("change_summary"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_cms_content_versions_unique").on(
      table.contentItemId,
      table.versionNumber
    ),
  ]
);

/** Immutable editorial action history. Rows are insert-only. */
export const cmsAuditLog = pgTable(
  "cms_audit_log",
  {
    id: text("id").primaryKey(),
    /** Nullable so item-scoped and item-independent actions share one history. */
    contentItemId: text("content_item_id"),
    actorId: text("actor_id").notNull(),
    /** Controlled: create_draft | edit | submit_review | approve | schedule | publish | archive | rollback | verify_translation */
    action: text("action").notNull(),
    /** Structured action context (status transitions, version refs, rejection reasons, ...). */
    details: jsonb("details").default({}).notNull().$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_cms_audit_log_item_occurred").on(
      table.contentItemId,
      table.occurredAt
    ),
    index("idx_cms_audit_log_actor_occurred").on(
      table.actorId,
      table.occurredAt
    ),
  ]
);
