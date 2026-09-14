import { pgTable, text, timestamp, boolean, integer, jsonb, real } from "drizzle-orm/pg-core";
import type { SessionQueueOrder } from "@/types/srs";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  avatarUrl: text("avatar_url"),
  targetJlptLevel: text("target_jlpt_level").default("N5").notNull(),
  targetDate: text("target_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
