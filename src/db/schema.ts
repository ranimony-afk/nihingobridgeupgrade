import {
  boolean,
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
