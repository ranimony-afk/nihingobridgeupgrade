import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type ExercisePayload = {
  prompt: string;
  promptJa?: string;
  hint?: string;
  speak?: string;
  options?: string[];
  answer: string | string[];
  accepted?: string[];
  pairs?: { left: string; right: string }[];
  tiles?: string[];
  explanation?: string;
};

export const learners = pgTable("learners", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  avatar: text("avatar").notNull().default("mochi"),
  xp: integer("xp").notNull().default(0),
  gems: integer("gems").notNull().default(500),
  hearts: integer("hearts").notNull().default(5),
  maxHearts: integer("max_hearts").notNull().default(5),
  heartsUpdatedAt: timestamp("hearts_updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  streak: integer("streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastStudyDate: text("last_study_date"),
  streakFreezes: integer("streak_freezes").notNull().default(1),
  dailyGoalXp: integer("daily_goal_xp").notNull().default(20),
  levelHint: text("level_hint").notNull().default("beginner"),
  doubleXpUntil: timestamp("double_xp_until", { withTimezone: true }),
  isBot: boolean("is_bot").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const units = pgTable("units", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull(),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const lessons = pgTable("lessons", {
  id: text("id").primaryKey(),
  unitId: text("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  sortOrder: integer("sort_order").notNull(),
  xpReward: integer("xp_reward").notNull().default(10),
  kind: text("kind").notNull().default("lesson"),
});

export const exercises = pgTable("exercises", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  sortOrder: integer("sort_order").notNull(),
  payload: jsonb("payload").$type<ExercisePayload>().notNull(),
});

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    crowns: integer("crowns").notNull().default(0),
    bestScore: integer("best_score").notNull().default(0),
    lastAccuracy: integer("last_accuracy").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("progress_learner_lesson").on(table.learnerId, table.lessonId)],
);

export const dailyXp = pgTable(
  "daily_xp",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    xp: integer("xp").notNull().default(0),
    lessonsCompleted: integer("lessons_completed").notNull().default(0),
    reviewsCompleted: integer("reviews_completed").notNull().default(0),
    storiesCompleted: integer("stories_completed").notNull().default(0),
  },
  (table) => [uniqueIndex("daily_xp_learner_date").on(table.learnerId, table.date)],
);

export const achievements = pgTable("achievements", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
});

export const learnerAchievements = pgTable(
  "learner_achievements",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    achievementId: text("achievement_id")
      .notNull()
      .references(() => achievements.id, { onDelete: "cascade" }),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("learner_achievement_unique").on(table.learnerId, table.achievementId)],
);

export const shopItems = pgTable("shop_items", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  cost: integer("cost").notNull(),
  kind: text("kind").notNull(),
  value: text("value").notNull(),
  icon: text("icon").notNull(),
});

export const purchases = pgTable("purchases", {
  id: text("id").primaryKey(),
  learnerId: text("learner_id")
    .notNull()
    .references(() => learners.id, { onDelete: "cascade" }),
  itemId: text("item_id")
    .notNull()
    .references(() => shopItems.id, { onDelete: "cascade" }),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chests = pgTable("chests", {
  id: text("id").primaryKey(),
  afterIndex: integer("after_index").notNull(),
  gems: integer("gems").notNull(),
  title: text("title").notNull(),
});

export const learnerChests = pgTable(
  "learner_chests",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    chestId: text("chest_id")
      .notNull()
      .references(() => chests.id, { onDelete: "cascade" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("learner_chest_unique").on(table.learnerId, table.chestId)],
);

export const stories = pgTable("stories", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  teaser: text("teaser").notNull(),
  cover: text("cover").notNull(),
  minutes: integer("minutes").notNull().default(3),
  level: text("level").notNull(),
  lines: jsonb("lines")
    .$type<{ ja: string; romaji: string; en: string }[]>()
    .notNull(),
  quiz: jsonb("quiz")
    .$type<
      {
        prompt: string;
        options: string[];
        answer: string;
      }[]
    >()
    .notNull(),
});

export const storyProgress = pgTable(
  "story_progress",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    storyId: text("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    score: integer("score").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("story_progress_unique").on(table.learnerId, table.storyId)],
);

export const reviewCards = pgTable("review_cards", {
  id: text("id").primaryKey(),
  learnerId: text("learner_id")
    .notNull()
    .references(() => learners.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id"),
  prompt: text("prompt").notNull(),
  speak: text("speak"),
  answer: text("answer").notNull(),
  options: jsonb("options").$type<string[]>(),
  type: text("type").notNull().default("select"),
  intervalDays: integer("interval_days").notNull().default(0),
  ease: integer("ease").notNull().default(250),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
  reps: integer("reps").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
});

export const staffUsers = pgTable("staff_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("editor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditReports = pgTable("audit_reports", {
  id: text("id").primaryKey(),
  phase: text("phase").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  version: text("version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditFindings = pgTable(
  "audit_findings",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => auditReports.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    category: text("category").notNull(),
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    evidence: text("evidence").notNull(),
    recommendation: text("recommendation").notNull(),
    status: text("status").notNull().default("open"),
    effort: text("effort").notNull(),
    priority: integer("priority").notNull(),
  },
  (table) => [uniqueIndex("audit_findings_report_title").on(table.reportId, table.title)],
);

export const auditRoadmap = pgTable("audit_roadmap", {
  id: text("id").primaryKey(),
  reportId: text("report_id")
    .notNull()
    .references(() => auditReports.id, { onDelete: "cascade" }),
  phase: text("phase").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  dependsOn: text("depends_on"),
  status: text("status").notNull().default("planned"),
  sortOrder: integer("sort_order").notNull(),
});

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  findingId: text("finding_id").references(() => auditFindings.id, { onDelete: "cascade" }),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const errorEvents = pgTable("error_events", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  message: text("message").notNull(),
  stack: text("stack"),
  meta: jsonb("meta").$type<Record<string, string | number | boolean | null>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const analyticsEvents = pgTable("analytics_events", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path"),
  actorId: text("actor_id"),
  meta: jsonb("meta").$type<Record<string, string | number | boolean | null>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const backupRuns = pgTable("backup_runs", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  bytes: integer("bytes").notNull().default(0),
  status: text("status").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  staffId: text("staff_id")
    .notNull()
    .references(() => staffUsers.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const institutions = pgTable("institutions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("institution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const identityUsers = pgTable("identity_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("student"),
  plan: text("plan").notNull().default("free"),
  status: text("status").notNull().default("active"),
  institutionId: text("institution_id").references(() => institutions.id, { onDelete: "set null" }),
  learnerId: text("learner_id").references(() => learners.id, { onDelete: "set null" }),
  staffId: text("staff_id").references(() => staffUsers.id, { onDelete: "set null" }),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const identityAccounts = pgTable(
  "identity_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => identityUsers.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("identity_accounts_provider_uid").on(table.provider, table.providerAccountId)],
);

export const identityRefreshTokens = pgTable("identity_refresh_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => identityUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const identityChallenges = pgTable("identity_challenges", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => identityUsers.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  kind: text("kind").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const identityPermissions = pgTable("identity_permissions", {
  key: text("key").primaryKey(),
  description: text("description").notNull(),
});

export const identityRolePermissions = pgTable(
  "identity_role_permissions",
  {
    role: text("role").notNull(),
    permission: text("permission")
      .notNull()
      .references(() => identityPermissions.key, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("identity_role_permission_pk").on(table.role, table.permission)],
);

export const identityMail = pgTable("identity_mail", {
  id: text("id").primaryKey(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  kind: text("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const billingPlans = pgTable("billing_plans", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  interval: text("interval").notNull(),
  currency: text("currency").notNull(),
  amount: integer("amount").notNull(),
  entitles: text("entitles").notNull(),
  active: boolean("active").notNull().default(true),
});

export const billingCoupons = pgTable("billing_coupons", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  kind: text("kind").notNull(),
  percentOff: integer("percent_off"),
  amountOff: integer("amount_off"),
  active: boolean("active").notNull().default(true),
  maxRedemptions: integer("max_redemptions"),
  redeemed: integer("redeemed").notNull().default(0),
});

export const billingProfiles = pgTable("billing_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => identityUsers.id, { onDelete: "cascade" }),
  referralCode: text("referral_code").notNull().unique(),
  creditPaise: integer("credit_paise").notNull().default(0),
  referredBy: text("referred_by"),
});

export const billingCheckouts = pgTable("billing_checkouts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => identityUsers.id, { onDelete: "cascade" }),
  planId: text("plan_id")
    .notNull()
    .references(() => billingPlans.id),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("open"),
  couponCode: text("coupon_code"),
  referralCode: text("referral_code"),
  currency: text("currency").notNull(),
  subtotal: integer("subtotal").notNull(),
  discount: integer("discount").notNull().default(0),
  tax: integer("tax").notNull().default(0),
  total: integer("total").notNull(),
  providerRef: text("provider_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const billingSubscriptions = pgTable("billing_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => identityUsers.id, { onDelete: "cascade" }),
  planId: text("plan_id")
    .notNull()
    .references(() => billingPlans.id),
  status: text("status").notNull(),
  provider: text("provider").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const billingInvoices = pgTable("billing_invoices", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => identityUsers.id, { onDelete: "cascade" }),
  checkoutId: text("checkout_id"),
  number: text("number").notNull().unique(),
  currency: text("currency").notNull(),
  subtotal: integer("subtotal").notNull(),
  tax: integer("tax").notNull(),
  cgst: integer("cgst").notNull().default(0),
  sgst: integer("sgst").notNull().default(0),
  total: integer("total").notNull(),
  gstin: text("gstin"),
  status: text("status").notNull().default("paid"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const billingInvoiceLines = pgTable("billing_invoice_lines", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => billingInvoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
});

export const billingRefunds = pgTable("billing_refunds", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => billingInvoices.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const billingWebhookEvents = pgTable("billing_webhook_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  processed: boolean("processed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const kgSources = pgTable("kg_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  license: text("license").notNull(),
});

export const kgImportRuns = pgTable("kg_import_runs", {
  id: text("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => kgSources.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  cursor: text("cursor"),
  counts: jsonb("counts").$type<Record<string, number>>().notNull(),
  errors: integer("errors").notNull().default(0),
  checksum: text("checksum"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kgLexemes = pgTable(
  "kg_lexemes",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => kgSources.id),
    externalId: text("external_id").notNull(),
    lemma: text("lemma").notNull(),
    reading: text("reading").notNull(),
    pos: text("pos").notNull(),
    jlpt: text("jlpt"),
    searchDocument: text("search_document").notNull(),
    checksum: text("checksum").notNull(),
  },
  (table) => [
    uniqueIndex("kg_lexemes_source_ext").on(table.sourceId, table.externalId),
    index("kg_lexemes_lemma_idx").on(table.lemma),
    index("kg_lexemes_reading_idx").on(table.reading),
  ],
);

export const kgSenses = pgTable("kg_senses", {
  id: text("id").primaryKey(),
  lexemeId: text("lexeme_id")
    .notNull()
    .references(() => kgLexemes.id, { onDelete: "cascade" }),
  senseIndex: integer("sense_index").notNull(),
  notes: text("notes"),
});

export const kgGlosses = pgTable("kg_glosses", {
  id: text("id").primaryKey(),
  senseId: text("sense_id")
    .notNull()
    .references(() => kgSenses.id, { onDelete: "cascade" }),
  lang: text("lang").notNull(),
  text: text("text").notNull(),
});

export const kgKanji = pgTable(
  "kg_kanji",
  {
    id: text("id").primaryKey(),
    character: text("character").notNull().unique(),
    strokes: integer("strokes").notNull(),
    grade: integer("grade"),
    jlpt: text("jlpt"),
    freq: integer("freq"),
    radical: text("radical"),
    heisig: text("heisig"),
    searchDocument: text("search_document").notNull(),
    checksum: text("checksum").notNull(),
  },
  (table) => [index("kg_kanji_jlpt_idx").on(table.jlpt)],
);

export const kgKanjiReadings = pgTable("kg_kanji_readings", {
  id: text("id").primaryKey(),
  kanjiId: text("kanji_id")
    .notNull()
    .references(() => kgKanji.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  reading: text("reading").notNull(),
});

export const kgNames = pgTable("kg_names", {
  id: text("id").primaryKey(),
  surface: text("surface").notNull(),
  reading: text("reading").notNull(),
  kind: text("kind").notNull(),
  gloss: text("gloss").notNull(),
});

export const kgSentences = pgTable(
  "kg_sentences",
  {
    id: text("id").primaryKey(),
    externalId: text("external_id").notNull().unique(),
    ja: text("ja").notNull(),
    en: text("en").notNull(),
    level: text("level"),
    searchDocument: text("search_document").notNull(),
  },
  (table) => [index("kg_sentences_ja_idx").on(table.ja)],
);

export const kgSentenceLexemes = pgTable(
  "kg_sentence_lexemes",
  {
    sentenceId: text("sentence_id")
      .notNull()
      .references(() => kgSentences.id, { onDelete: "cascade" }),
    lexemeId: text("lexeme_id")
      .notNull()
      .references(() => kgLexemes.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("kg_sentence_lexemes_pk").on(table.sentenceId, table.lexemeId)],
);

export const kgGrammar = pgTable("kg_grammar", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  structure: text("structure").notNull(),
  level: text("level").notNull(),
  explanation: text("explanation").notNull(),
});

export const kgIdioms = pgTable("kg_idioms", {
  id: text("id").primaryKey(),
  ja: text("ja").notNull(),
  reading: text("reading").notNull(),
  en: text("en").notNull(),
});

export const kgCollocations = pgTable("kg_collocations", {
  id: text("id").primaryKey(),
  leftJa: text("left_ja").notNull(),
  rightJa: text("right_ja").notNull(),
  en: text("en").notNull(),
});

export const kgPitch = pgTable("kg_pitch", {
  id: text("id").primaryKey(),
  lexemeId: text("lexeme_id")
    .notNull()
    .references(() => kgLexemes.id, { onDelete: "cascade" }),
  pattern: integer("pattern").notNull(),
  mora: text("mora").notNull(),
});

export const kgStrokes = pgTable("kg_strokes", {
  id: text("id").primaryKey(),
  kanjiId: text("kanji_id")
    .notNull()
    .references(() => kgKanji.id, { onDelete: "cascade" }),
  strokeNo: integer("stroke_no").notNull(),
  path: text("path").notNull(),
});

export const kgFurigana = pgTable("kg_furigana", {
  id: text("id").primaryKey(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  surface: text("surface").notNull(),
  reading: text("reading").notNull(),
});

export const kgFrequency = pgTable("kg_frequency", {
  id: text("id").primaryKey(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  corpus: text("corpus").notNull(),
  rank: integer("rank").notNull(),
});

export const kgTags = pgTable("kg_tags", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  kind: text("kind").notNull(),
});

export const kgTaggings = pgTable("kg_taggings", {
  id: text("id").primaryKey(),
  tagId: text("tag_id")
    .notNull()
    .references(() => kgTags.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
});

export const kgAudio = pgTable("kg_audio", {
  id: text("id").primaryKey(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  kind: text("kind").notNull(),
  value: text("value").notNull(),
});

export const kgAiMeta = pgTable("kg_ai_meta", {
  id: text("id").primaryKey(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  model: text("model").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
});

export const kgSrs = pgTable(
  "kg_srs",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
    intervalDays: integer("interval_days").notNull().default(0),
    ease: integer("ease").notNull().default(250),
  },
  (table) => [uniqueIndex("kg_srs_learner_target").on(table.learnerId, table.targetType, table.targetId)],
);

export const kgLinks = pgTable(
  "kg_links",
  {
    id: text("id").primaryKey(),
    fromId: text("from_id").notNull(),
    toId: text("to_id").notNull(),
    kind: text("kind").notNull(),
  },
  (table) => [uniqueIndex("kg_links_unique").on(table.fromId, table.toId, table.kind)],
);

export const kgForms = pgTable("kg_forms", {
  id: text("id").primaryKey(),
  lexemeId: text("lexeme_id")
    .notNull()
    .references(() => kgLexemes.id, { onDelete: "cascade" }),
  style: text("style").notNull(),
  surface: text("surface").notNull(),
  reading: text("reading").notNull(),
});

export const kgConjugations = pgTable("kg_conjugations", {
  id: text("id").primaryKey(),
  lexemeId: text("lexeme_id")
    .notNull()
    .references(() => kgLexemes.id, { onDelete: "cascade" }),
  form: text("form").notNull(),
  surface: text("surface").notNull(),
  reading: text("reading").notNull(),
});

export const kgLexemeGrammar = pgTable(
  "kg_lexeme_grammar",
  {
    lexemeId: text("lexeme_id")
      .notNull()
      .references(() => kgLexemes.id, { onDelete: "cascade" }),
    grammarId: text("grammar_id")
      .notNull()
      .references(() => kgGrammar.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("kg_lexeme_grammar_pk").on(table.lexemeId, table.grammarId)],
);

export const kgBookmarks = pgTable(
  "kg_bookmarks",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("kg_bookmarks_unique").on(table.learnerId, table.targetType, table.targetId)],
);

export const kgOfflinePacks = pgTable("kg_offline_packs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: integer("version").notNull(),
  bytes: integer("bytes").notNull(),
  checksum: text("checksum").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});


