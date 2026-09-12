/**
 * NihongoBridge — canonical Drizzle schema.
 *
 * This is the ONE schema file (DATABASE_OWNERSHIP §1). Repository B's
 * competing uuid-keyed schema is never applied.
 *
 * Conventions (DATABASE_OWNERSHIP §3):
 *   - text primary keys, application-generated
 *   - timestamptz everywhere
 *   - explicit indexes
 *   - additive migrations only; no DROP without an authorising decision
 *
 * Phase 02.1 — Identity domain. Owned exclusively by src/services/auth.
 */

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────
// IDENTITY — enums
// ─────────────────────────────────────────────

/** Account lifecycle. Only `active` accounts may authenticate. */
export const identityUserStatusEnum = pgEnum("identity_user_status", [
  "active",
  "suspended",
  "deleted",
]);

/** RBAC roles (ARCHITECTURE_FREEZE §3.1). */
export const identityRoleEnum = pgEnum("identity_role", [
  "learner",
  "reviewer",
  "content_editor",
  "admin",
  "super_admin",
]);

/**
 * How a session token is carried. Both transports resolve to the same
 * identity_users.id, so web and Flutter share one identity.
 */
export const identitySessionTransportEnum = pgEnum("identity_session_transport", [
  "cookie",
  "bearer",
]);

/** Who may see a learner's profile. Defaults to the most private option. */
export const profileVisibilityEnum = pgEnum("profile_visibility", [
  "private",
  "public",
]);

/** UI colour scheme. `system` follows the operating system setting. */
export const themePreferenceEnum = pgEnum("theme_preference", [
  "system",
  "light",
  "dark",
]);

/**
 * How furigana is shown over kanji. Learners at higher levels typically want
 * it hidden, so this is a first-class preference rather than a toggle buried
 * in the UI.
 */
export const furiganaModeEnum = pgEnum("furigana_mode", [
  "always",
  "hover",
  "never",
]);

// ─────────────────────────────────────────────
// IDENTITY — tables
// ─────────────────────────────────────────────

/**
 * The canonical user record. Every `learner_id` elsewhere in the schema is a
 * foreign key to this table (DATABASE_OWNERSHIP §4).
 */
export const identityUsers = pgTable(
  "identity_users",
  {
    id: text("id").primaryKey(),
    /** Stored as supplied, for display. Uniqueness is case-insensitive. */
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    status: identityUserStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Case-insensitive uniqueness: "Aiko@x.com" and "aiko@x.com" are one account.
    uniqueIndex("identity_users_email_lower_idx").on(sql`lower(${table.email})`),
    index("identity_users_status_idx").on(table.status),
  ],
);

/**
 * Password material, kept in a separate table so a user row can be read,
 * logged, or serialised without ever carrying a hash alongside it.
 */
export const identityCredentials = pgTable(
  "identity_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => identityUsers.id, { onDelete: "cascade" }),
    /** Self-describing digest: scrypt$N$r$p$salt$hash */
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("identity_credentials_user_idx").on(table.userId)],
);

/**
 * Server-side sessions. The raw token is returned to the client exactly once
 * and never stored; the database keeps only its SHA-256 digest, so a database
 * disclosure does not hand an attacker usable sessions.
 */
export const identitySessions = pgTable(
  "identity_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => identityUsers.id, { onDelete: "cascade" }),
    /** SHA-256 of the bearer/cookie token, hex encoded. */
    tokenHash: text("token_hash").notNull(),
    transport: identitySessionTransportEnum("transport").notNull().default("cookie"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Set when the session is explicitly ended. Revocation is immediate. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: varchar("user_agent", { length: 400 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("identity_sessions_token_idx").on(table.tokenHash),
    index("identity_sessions_user_idx").on(table.userId),
    index("identity_sessions_expires_idx").on(table.expiresAt),
  ],
);

/** Role grants. A user with no rows here is treated as a plain learner. */
export const identityUserRoles = pgTable(
  "identity_user_roles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => identityUsers.id, { onDelete: "cascade" }),
    role: identityRoleEnum("role").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("identity_user_roles_unique").on(table.userId, table.role),
    index("identity_user_roles_role_idx").on(table.role),
  ],
);

/**
 * Learner profile — who the user is, as distinct from how they authenticate.
 *
 * Kept separate from `identity_users` because the two have different
 * lifecycles and privacy classes: the users row is credential-adjacent and
 * rarely changes, while a profile is learner-editable and may be shown to
 * other people. Exactly one row per user, created with the account.
 */
export const identityProfiles = pgTable(
  "identity_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => identityUsers.id, { onDelete: "cascade" }),

    avatarUrl: text("avatar_url"),
    bio: varchar("bio", { length: 500 }),

    /**
     * IANA zone, e.g. "Asia/Tokyo". Streaks and daily goals are evaluated
     * against the learner's local day, so this is required rather than
     * inferred per request (DOMAIN_OWNERSHIP §8).
     */
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),

    /** UI and gloss language. */
    locale: varchar("locale", { length: 12 }).notNull().default("en"),
    /** The learner's first language, used to pick gloss translations. */
    nativeLanguage: varchar("native_language", { length: 12 }),

    /** JLPT goal. smallint 5 = N5 … 1 = N1, NULL = not chosen. */
    targetJlptLevel: smallint("target_jlpt_level"),
    /** Self-reported current level, same encoding. */
    currentJlptLevel: smallint("current_jlpt_level"),

    visibility: profileVisibilityEnum("visibility").notNull().default("private"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("identity_profiles_user_idx").on(table.userId),
    index("identity_profiles_target_level_idx").on(table.targetJlptLevel),
    // The frozen JLPT encoding is enforced by the database, not only by
    // application code, so a bad write cannot corrupt level filtering.
    check(
      "identity_profiles_target_level_check",
      sql`${table.targetJlptLevel} IS NULL OR ${table.targetJlptLevel} BETWEEN 1 AND 5`,
    ),
    check(
      "identity_profiles_current_level_check",
      sql`${table.currentJlptLevel} IS NULL OR ${table.currentJlptLevel} BETWEEN 1 AND 5`,
    ),
  ],
);

/**
 * Learner preferences — how the application should behave for this user.
 *
 * Separate from the profile because these are private, change frequently, and
 * are read on nearly every render, whereas profile fields are comparatively
 * static. Every column is NOT NULL with a default so a client never has to
 * handle a partially configured account.
 */
export const identityPreferences = pgTable(
  "identity_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => identityUsers.id, { onDelete: "cascade" }),

    // ── Presentation ──
    theme: themePreferenceEnum("theme").notNull().default("system"),
    furiganaMode: furiganaModeEnum("furigana_mode").notNull().default("hover"),
    /** Show romaji alongside kana. Off by default: it slows kana acquisition. */
    showRomaji: boolean("show_romaji").notNull().default(false),
    /** Respects prefers-reduced-motion for learners who need it. */
    reducedMotion: boolean("reduced_motion").notNull().default(false),
    soundEnabled: boolean("sound_enabled").notNull().default(true),

    // ── Study targets ──
    dailyGoalMinutes: smallint("daily_goal_minutes").notNull().default(15),
    /** Cap on new SRS cards introduced per day. */
    srsDailyNewLimit: smallint("srs_daily_new_limit").notNull().default(20),
    /** Cap on SRS reviews per day, so a backlog cannot become unmanageable. */
    srsDailyReviewLimit: integer("srs_daily_review_limit").notNull().default(200),

    // ── Notifications ──
    emailDigest: boolean("email_digest").notNull().default(true),
    reviewReminders: boolean("review_reminders").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("identity_preferences_user_idx").on(table.userId),
    check(
      "identity_preferences_daily_goal_check",
      sql`${table.dailyGoalMinutes} BETWEEN 1 AND 1440`,
    ),
    check(
      "identity_preferences_srs_new_check",
      sql`${table.srsDailyNewLimit} BETWEEN 0 AND 500`,
    ),
    check(
      "identity_preferences_srs_review_check",
      sql`${table.srsDailyReviewLimit} BETWEEN 0 AND 10000`,
    ),
  ],
);

// ─────────────────────────────────────────────
// IDENTITY — relations
// ─────────────────────────────────────────────

export const identityUsersRelations = relations(identityUsers, ({ one, many }) => ({
  credential: one(identityCredentials, {
    fields: [identityUsers.id],
    references: [identityCredentials.userId],
  }),
  profile: one(identityProfiles, {
    fields: [identityUsers.id],
    references: [identityProfiles.userId],
  }),
  preferences: one(identityPreferences, {
    fields: [identityUsers.id],
    references: [identityPreferences.userId],
  }),
  sessions: many(identitySessions),
  roles: many(identityUserRoles),
}));

export const identityProfilesRelations = relations(identityProfiles, ({ one }) => ({
  user: one(identityUsers, {
    fields: [identityProfiles.userId],
    references: [identityUsers.id],
  }),
}));

export const identityPreferencesRelations = relations(identityPreferences, ({ one }) => ({
  user: one(identityUsers, {
    fields: [identityPreferences.userId],
    references: [identityUsers.id],
  }),
}));

export const identityCredentialsRelations = relations(identityCredentials, ({ one }) => ({
  user: one(identityUsers, {
    fields: [identityCredentials.userId],
    references: [identityUsers.id],
  }),
}));

export const identitySessionsRelations = relations(identitySessions, ({ one }) => ({
  user: one(identityUsers, {
    fields: [identitySessions.userId],
    references: [identityUsers.id],
  }),
}));

export const identityUserRolesRelations = relations(identityUserRoles, ({ one }) => ({
  user: one(identityUsers, {
    fields: [identityUserRoles.userId],
    references: [identityUsers.id],
  }),
}));

// ═════════════════════════════════════════════
// KNOWLEDGE DOMAIN
//
// Owned exclusively by src/services/knowledge (DOMAIN_OWNERSHIP §2).
// Written only by ETL and Admin; learners never write these tables.
//
// Two rules shape every table here:
//
//   1. Nothing exists without provenance. Each imported row records which
//      source it came from, which upstream identifier it had, and which
//      import run wrote it. The audit found unresolved licence conflicts
//      (JMdict CC BY-SA 3.0 vs 4.0), so this is a legal requirement, not
//      bookkeeping.
//
//   2. Normalised, not JSON blobs. Repository B stored meanings and readings
//      as JSONB arrays on one row; we split them into child tables so they
//      can be indexed, ordered, and queried individually (DEC-0010).
// ═════════════════════════════════════════════

// ─────────────────────────────────────────────
// KNOWLEDGE — enums
// ─────────────────────────────────────────────

/** Whether a source may be imported from. */
export const knowledgeSourceStatusEnum = pgEnum("knowledge_source_status", [
  "active",
  "deprecated",
  /** Licence unresolved or terms prohibit our use. Import must refuse. */
  "blocked",
]);

/** Outcome of a single import run. */
export const provenanceStatusEnum = pgEnum("provenance_status", [
  "running",
  "succeeded",
  "partial",
  "failed",
]);

/** A dictionary headword form: kana reading or written (kanji) form. */
export const dictionaryFormKindEnum = pgEnum("dictionary_form_kind", [
  "kana",
  "kanji",
]);

/** Kanji reading categories. */
export const kanjiReadingKindEnum = pgEnum("kanji_reading_kind", [
  "on",
  "kun",
  /** Readings used only in names. */
  "nanori",
]);

/** Where a component sits inside a kanji. */
export const kanjiComponentPositionEnum = pgEnum("kanji_component_position", [
  "hen", // left
  "tsukuri", // right
  "kanmuri", // top
  "ashi", // bottom
  "tare", // top-left wrap
  "nyou", // bottom-left wrap
  "kamae", // enclosure
  "unknown",
]);

/** Formality register of a grammar pattern. */
export const grammarRegisterEnum = pgEnum("grammar_register", [
  "casual",
  "neutral",
  "polite",
  "formal",
  "written",
]);

/** Inflection class, which determines how a word conjugates. */
export const wordClassEnum = pgEnum("word_class", [
  "ichidan",
  "godan",
  "suru_irregular",
  "kuru_irregular",
  "i_adjective",
  "na_adjective",
  "copula",
]);

export const politenessEnum = pgEnum("politeness", ["plain", "polite"]);
export const polarityEnum = pgEnum("polarity", ["affirmative", "negative"]);
export const tenseEnum = pgEnum("tense", ["nonpast", "past", "atemporal"]);

// ─────────────────────────────────────────────
// PROVENANCE
// ─────────────────────────────────────────────

/**
 * Registry of every external data source.
 *
 * `licenseVerified` is a gate, not a note. The Phase 00 audit found the same
 * dataset described under two different licence versions in the two
 * repositories, and TTS audio whose redistribution terms were never
 * established. A source stays unusable until someone records that the licence
 * was actually checked.
 */
export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    /** Stable machine key: "jmdict", "kanjidic2", "tatoeba". */
    id: text("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),

    /** SPDX identifier where one exists, otherwise the licence name. */
    license: varchar("license", { length: 120 }).notNull(),
    licenseUrl: text("license_url"),
    /** Attribution text that must be displayed wherever this data appears. */
    attribution: text("attribution").notNull(),

    homepageUrl: text("homepage_url"),
    downloadUrl: text("download_url"),

    /** Upstream release identifier, e.g. "2024-07-01". */
    version: varchar("version", { length: 80 }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),

    /** False until a human confirms the licence permits our use. */
    licenseVerified: boolean("license_verified").notNull().default(false),
    licenseVerifiedAt: timestamp("license_verified_at", { withTimezone: true }),
    licenseNote: text("license_note"),

    status: knowledgeSourceStatusEnum("status").notNull().default("blocked"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("knowledge_sources_status_idx").on(table.status),
    // A source can only be active once its licence has been verified.
    check(
      "knowledge_sources_active_requires_license_check",
      sql`${table.status} <> 'active' OR ${table.licenseVerified} = true`,
    ),
  ],
);

/**
 * One row per import run. Gives every knowledge row a traceable lineage:
 * which file, which pipeline version, when, and with what outcome.
 */
export const knowledgeProvenance = pgTable(
  "knowledge_provenance",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "restrict" }),

    /** Source version as it was at import time; sources move on. */
    sourceVersion: varchar("source_version", { length: 80 }).notNull(),
    /** Version of the ETL pipeline that performed the run. */
    pipelineVersion: varchar("pipeline_version", { length: 80 }).notNull(),
    /** SHA-256 of the downloaded artefact, proving what was actually read. */
    inputChecksum: varchar("input_checksum", { length: 64 }),

    status: provenanceStatusEnum("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    recordsRead: integer("records_read").notNull().default(0),
    recordsWritten: integer("records_written").notNull().default(0),
    recordsSkipped: integer("records_skipped").notNull().default(0),
    recordsFailed: integer("records_failed").notNull().default(0),

    notes: text("notes"),
    error: text("error"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("knowledge_provenance_source_idx").on(table.sourceId),
    index("knowledge_provenance_status_idx").on(table.status),
    index("knowledge_provenance_started_idx").on(table.startedAt),
  ],
);

// ─────────────────────────────────────────────
// DICTIONARY
// ─────────────────────────────────────────────

/**
 * A dictionary headword. One row per upstream entry (a JMdict `ent_seq`).
 *
 * `id` is derived deterministically from (sourceId, sourceRef), so re-running
 * an import updates rows in place instead of duplicating them.
 */
export const dictionaryEntries = pgTable(
  "dictionary_entries",
  {
    id: text("id").primaryKey(),

    sourceId: text("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "restrict" }),
    /** Upstream identifier within that source. */
    sourceRef: varchar("source_ref", { length: 120 }).notNull(),
    provenanceId: text("provenance_id").references(() => knowledgeProvenance.id, {
      onDelete: "set null",
    }),
    /** Hash of the upstream record, so unchanged rows can be skipped. */
    checksum: varchar("checksum", { length: 64 }),

    /** Primary written form — kanji if the word has one, otherwise kana. */
    headword: varchar("headword", { length: 200 }).notNull(),
    /** Primary kana reading. */
    reading: varchar("reading", { length: 200 }).notNull(),
    romaji: varchar("romaji", { length: 240 }),

    /** Marked common by the upstream corpus (JMdict news/ichi/spec tags). */
    isCommon: boolean("is_common").notNull().default(false),
    /** 5 = N5 … 1 = N1. NULL when unclassified. */
    jlptLevel: smallint("jlpt_level"),
    frequencyRank: integer("frequency_rank"),

    /** Entry-level parts of speech; sense-level detail lives on the sense. */
    partsOfSpeech: text("parts_of_speech").array(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("dictionary_entries_source_ref_idx").on(table.sourceId, table.sourceRef),
    index("dictionary_entries_headword_idx").on(table.headword),
    index("dictionary_entries_reading_idx").on(table.reading),
    index("dictionary_entries_jlpt_idx").on(table.jlptLevel),
    index("dictionary_entries_common_idx").on(table.isCommon),
    index("dictionary_entries_frequency_idx").on(table.frequencyRank),
    index("dictionary_entries_provenance_idx").on(table.provenanceId),
    // Fuzzy search indexes. pg_trgm is created by the same migration, so the
    // search service never has to assume an extension is present.
    index("dictionary_entries_headword_trgm_idx").using(
      "gin",
      sql`${table.headword} gin_trgm_ops`,
    ),
    index("dictionary_entries_reading_trgm_idx").using(
      "gin",
      sql`${table.reading} gin_trgm_ops`,
    ),
    check(
      "dictionary_entries_jlpt_check",
      sql`${table.jlptLevel} IS NULL OR ${table.jlptLevel} BETWEEN 1 AND 5`,
    ),
    check("dictionary_entries_headword_not_blank", sql`btrim(${table.headword}) <> ''`),
  ],
);

/**
 * Alternative surface forms for an entry.
 *
 * Covers both alternative kana readings and alternative written forms, which
 * is why `kind` exists: JMdict models these as separate elements, but they
 * behave identically for lookup and differ only in script.
 */
export const dictionaryReadings = pgTable(
  "dictionary_readings",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id")
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: "cascade" }),

    kind: dictionaryFormKindEnum("kind").notNull().default("kana"),
    text: varchar("text", { length: 200 }).notNull(),
    romaji: varchar("romaji", { length: 240 }),

    isPrimary: boolean("is_primary").notNull().default(false),
    /** Written forms this reading is restricted to, when not all of them. */
    restrictions: text("restrictions").array(),
    /** Upstream tags such as "ok" (outdated) or "ik" (irregular). */
    tags: text("tags").array(),
    position: smallint("position").notNull().default(0),
  },
  (table) => [
    index("dictionary_readings_entry_idx").on(table.entryId),
    index("dictionary_readings_text_idx").on(table.text),
    index("dictionary_readings_text_trgm_idx").using("gin", sql`${table.text} gin_trgm_ops`),
    uniqueIndex("dictionary_readings_unique").on(table.entryId, table.kind, table.text),
  ],
);

/**
 * One meaning group of an entry.
 *
 * Glosses are keyed by language — `{"en": ["to eat"], "fr": ["manger"]}` — so
 * adding a language is data, not a migration.
 */
export const dictionarySenses = pgTable(
  "dictionary_senses",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id")
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: "cascade" }),

    /** Order within the entry; sense 0 is the primary meaning. */
    position: smallint("position").notNull().default(0),
    glosses: jsonb("glosses").notNull(),

    partsOfSpeech: text("parts_of_speech").array(),
    /** Domain labels: "medicine", "computing". */
    fields: text("fields").array(),
    /** Usage tags: "uk" (usually kana), "arch" (archaic). */
    misc: text("misc").array(),
    dialects: text("dialects").array(),
    info: text("info"),
    /** Headwords of related entries. */
    crossReferences: text("cross_references").array(),
    antonyms: text("antonyms").array(),
  },
  (table) => [
    index("dictionary_senses_entry_idx").on(table.entryId),
    uniqueIndex("dictionary_senses_position_idx").on(table.entryId, table.position),
    // GIN over the gloss document supports containment queries per language.
    index("dictionary_senses_glosses_idx").using("gin", table.glosses),
    check("dictionary_senses_glosses_object", sql`jsonb_typeof(${table.glosses}) = 'object'`),
  ],
);

// ─────────────────────────────────────────────
// KANJI AND RADICALS
// ─────────────────────────────────────────────

/**
 * The 214 classical Kangxi radicals.
 *
 * A closed, well-known set, so `number` is a real constraint rather than an
 * arbitrary integer. Kept separate from kanji because a radical is a
 * classification system, not a character that learners study as vocabulary.
 */
export const radicals = pgTable(
  "radicals",
  {
    id: text("id").primaryKey(),
    /** Kangxi radical number, 1–214. */
    number: smallint("number").notNull(),
    character: varchar("character", { length: 8 }).notNull(),
    /** Positional variants, e.g. 亻 for 人. */
    variants: text("variants").array(),
    strokeCount: smallint("stroke_count").notNull(),

    meaning: varchar("meaning", { length: 200 }).notNull(),
    /** Japanese name of the radical, e.g. "にんべん". */
    readingJa: varchar("reading_ja", { length: 120 }),
    readingRomaji: varchar("reading_romaji", { length: 120 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("radicals_number_idx").on(table.number),
    uniqueIndex("radicals_character_idx").on(table.character),
    index("radicals_stroke_count_idx").on(table.strokeCount),
    check("radicals_number_check", sql`${table.number} BETWEEN 1 AND 214`),
    check("radicals_stroke_count_check", sql`${table.strokeCount} BETWEEN 1 AND 64`),
  ],
);

/** An individual kanji character. */
export const kanjiEntries = pgTable(
  "kanji_entries",
  {
    id: text("id").primaryKey(),

    sourceId: text("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "restrict" }),
    sourceRef: varchar("source_ref", { length: 120 }).notNull(),
    provenanceId: text("provenance_id").references(() => knowledgeProvenance.id, {
      onDelete: "set null",
    }),
    checksum: varchar("checksum", { length: 64 }),

    character: varchar("character", { length: 8 }).notNull(),
    /** Unicode codepoint in "U+98DF" form. */
    codepoint: varchar("codepoint", { length: 12 }).notNull(),
    strokeCount: smallint("stroke_count").notNull(),

    /** Japanese school grade 1–10; NULL when not taught at school level. */
    grade: smallint("grade"),
    /** 5 = N5 … 1 = N1. */
    jlptLevel: smallint("jlpt_level"),
    frequencyRank: integer("frequency_rank"),

    meanings: text("meanings").array().notNull(),

    /** Classifying radical. */
    radicalId: text("radical_id").references(() => radicals.id, { onDelete: "set null" }),
    /** Raw upstream radical number, kept even if the radical row is missing. */
    classicalRadicalNumber: smallint("classical_radical_number"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("kanji_entries_character_idx").on(table.character),
    uniqueIndex("kanji_entries_source_ref_idx").on(table.sourceId, table.sourceRef),
    index("kanji_entries_jlpt_idx").on(table.jlptLevel),
    index("kanji_entries_grade_idx").on(table.grade),
    index("kanji_entries_stroke_count_idx").on(table.strokeCount),
    index("kanji_entries_frequency_idx").on(table.frequencyRank),
    index("kanji_entries_radical_idx").on(table.radicalId),
    check(
      "kanji_entries_jlpt_check",
      sql`${table.jlptLevel} IS NULL OR ${table.jlptLevel} BETWEEN 1 AND 5`,
    ),
    check(
      "kanji_entries_grade_check",
      sql`${table.grade} IS NULL OR ${table.grade} BETWEEN 1 AND 10`,
    ),
    check("kanji_entries_stroke_count_check", sql`${table.strokeCount} BETWEEN 1 AND 64`),
  ],
);

/** Readings of a kanji, split by category. */
export const kanjiReadings = pgTable(
  "kanji_readings",
  {
    id: text("id").primaryKey(),
    kanjiId: text("kanji_id")
      .notNull()
      .references(() => kanjiEntries.id, { onDelete: "cascade" }),

    kind: kanjiReadingKindEnum("kind").notNull(),
    /** Raw form including okurigana notation, e.g. "た.べる". */
    reading: varchar("reading", { length: 120 }).notNull(),
    /** Reading with the okurigana marker removed, for matching: "たべる". */
    readingNormalized: varchar("reading_normalized", { length: 120 }).notNull(),
    romaji: varchar("romaji", { length: 160 }),

    isPrimary: boolean("is_primary").notNull().default(false),
    position: smallint("position").notNull().default(0),
  },
  (table) => [
    index("kanji_readings_kanji_idx").on(table.kanjiId),
    index("kanji_readings_normalized_idx").on(table.readingNormalized),
    index("kanji_readings_kind_idx").on(table.kind),
    uniqueIndex("kanji_readings_unique").on(table.kanjiId, table.kind, table.reading),
  ],
);

/**
 * Decomposition of a kanji into its visual parts.
 *
 * A component may be a radical, another kanji, or a shape that is neither, so
 * both foreign keys are nullable and `componentCharacter` is the source of
 * truth. This is what makes "show me every kanji containing 氵" answerable.
 */
export const kanjiComponents = pgTable(
  "kanji_components",
  {
    id: text("id").primaryKey(),
    kanjiId: text("kanji_id")
      .notNull()
      .references(() => kanjiEntries.id, { onDelete: "cascade" }),

    componentCharacter: varchar("component_character", { length: 8 }).notNull(),
    /** Set when the component is itself a kanji we hold. */
    componentKanjiId: text("component_kanji_id").references(() => kanjiEntries.id, {
      onDelete: "set null",
    }),
    /** Set when the component is a classical radical. */
    radicalId: text("radical_id").references(() => radicals.id, { onDelete: "set null" }),

    /** True for the component that classifies the kanji. */
    isClassifyingRadical: boolean("is_classifying_radical").notNull().default(false),
    position: kanjiComponentPositionEnum("position").notNull().default("unknown"),
    ordinal: smallint("ordinal").notNull().default(0),
  },
  (table) => [
    index("kanji_components_kanji_idx").on(table.kanjiId),
    index("kanji_components_character_idx").on(table.componentCharacter),
    index("kanji_components_radical_idx").on(table.radicalId),
    uniqueIndex("kanji_components_unique").on(table.kanjiId, table.componentCharacter),
  ],
);

// ─────────────────────────────────────────────
// GRAMMAR
// ─────────────────────────────────────────────

/** A grammar pattern such as 〜てください. */
export const grammarPatterns = pgTable(
  "grammar_patterns",
  {
    id: text("id").primaryKey(),

    sourceId: text("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "restrict" }),
    sourceRef: varchar("source_ref", { length: 120 }),
    provenanceId: text("provenance_id").references(() => knowledgeProvenance.id, {
      onDelete: "set null",
    }),

    /** URL-safe identifier, e.g. "te-kudasai". */
    slug: varchar("slug", { length: 160 }).notNull(),
    /** Display form including the 〜 placeholder. */
    pattern: varchar("pattern", { length: 200 }).notNull(),
    /** Placeholder-free form, for matching against sentence text. */
    patternNormalized: varchar("pattern_normalized", { length: 200 }).notNull(),

    meaning: text("meaning").notNull(),
    /** Additional languages: {"ja": "…"}. English lives in `meaning`. */
    meaningTranslations: jsonb("meaning_translations"),
    /** How the pattern attaches, e.g. "verb て-form + ください". */
    formation: text("formation"),

    jlptLevel: smallint("jlpt_level"),
    register: grammarRegisterEnum("register").notNull().default("neutral"),

    notes: text("notes"),
    commonMistakes: text("common_mistakes"),
    /** Slugs of patterns a learner often confuses with this one. */
    relatedSlugs: text("related_slugs").array(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("grammar_patterns_slug_idx").on(table.slug),
    index("grammar_patterns_jlpt_idx").on(table.jlptLevel),
    index("grammar_patterns_normalized_idx").on(table.patternNormalized),
    index("grammar_patterns_pattern_trgm_idx").using("gin", sql`${table.pattern} gin_trgm_ops`),
    check(
      "grammar_patterns_jlpt_check",
      sql`${table.jlptLevel} IS NULL OR ${table.jlptLevel} BETWEEN 1 AND 5`,
    ),
    check("grammar_patterns_slug_not_blank", sql`btrim(${table.slug}) <> ''`),
  ],
);

// ─────────────────────────────────────────────
// SENTENCES
// ─────────────────────────────────────────────

/** An example sentence with its translations. */
export const sentences = pgTable(
  "sentences",
  {
    id: text("id").primaryKey(),

    sourceId: text("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "restrict" }),
    sourceRef: varchar("source_ref", { length: 120 }),
    provenanceId: text("provenance_id").references(() => knowledgeProvenance.id, {
      onDelete: "set null",
    }),
    checksum: varchar("checksum", { length: 64 }),

    japanese: text("japanese").notNull(),
    /** Full kana reading of the sentence. */
    reading: text("reading"),
    /**
     * Ruby segments: [{"t":"食","r":"た"},{"t":"べる"}].
     * Precomputed during ETL because morphological analysis is too slow to
     * run per request (INTEGRATION_BOUNDARIES §3.4).
     */
    furigana: jsonb("furigana"),

    /** Keyed by language: {"en": "I eat bread."}. */
    translations: jsonb("translations").notNull(),

    jlptLevel: smallint("jlpt_level"),
    tags: text("tags").array(),
    audioUrl: text("audio_url"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sentences_source_ref_idx").on(table.sourceId, table.sourceRef),
    index("sentences_jlpt_idx").on(table.jlptLevel),
    index("sentences_provenance_idx").on(table.provenanceId),
    index("sentences_japanese_trgm_idx").using("gin", sql`${table.japanese} gin_trgm_ops`),
    index("sentences_translations_idx").using("gin", table.translations),
    check("sentences_japanese_not_blank", sql`btrim(${table.japanese}) <> ''`),
    check(
      "sentences_translations_object",
      sql`jsonb_typeof(${table.translations}) = 'object'`,
    ),
    check(
      "sentences_jlpt_check",
      sql`${table.jlptLevel} IS NULL OR ${table.jlptLevel} BETWEEN 1 AND 5`,
    ),
  ],
);

// ─────────────────────────────────────────────
// CONJUGATIONS
// ─────────────────────────────────────────────

/**
 * Derived inflected forms of a dictionary entry.
 *
 * Materialised rather than computed on demand for one reason: a learner who
 * searches 食べなかった must find 食べる. Reverse lookup of an inflected form
 * is a lookup problem, and it needs an index.
 *
 * Rows are generated, so a re-run replaces them; `isGenerated` marks the few
 * that may be hand-corrected for irregular words.
 */
export const conjugations = pgTable(
  "conjugations",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id")
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: "cascade" }),

    wordClass: wordClassEnum("word_class").notNull(),
    /** Canonical form name, e.g. "te", "past_plain", "causative_passive". */
    form: varchar("form", { length: 60 }).notNull(),

    /** The inflected surface text. */
    surface: varchar("surface", { length: 240 }).notNull(),
    /** Kana reading of the inflected form. */
    reading: varchar("reading", { length: 240 }),

    politeness: politenessEnum("politeness").notNull().default("plain"),
    polarity: polarityEnum("polarity").notNull().default("affirmative"),
    tense: tenseEnum("tense").notNull().default("nonpast"),

    /** False when a human corrected an irregular form. */
    isGenerated: boolean("is_generated").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("conjugations_entry_form_idx").on(table.entryId, table.form),
    index("conjugations_entry_idx").on(table.entryId),
    // The reverse-lookup index: inflected form → dictionary entry.
    index("conjugations_surface_idx").on(table.surface),
    index("conjugations_surface_trgm_idx").using("gin", sql`${table.surface} gin_trgm_ops`),
    check("conjugations_surface_not_blank", sql`btrim(${table.surface}) <> ''`),
  ],
);

// ─────────────────────────────────────────────
// KNOWLEDGE — relations
// ─────────────────────────────────────────────

export const knowledgeSourcesRelations = relations(knowledgeSources, ({ many }) => ({
  runs: many(knowledgeProvenance),
  dictionaryEntries: many(dictionaryEntries),
  kanjiEntries: many(kanjiEntries),
  sentences: many(sentences),
}));

export const knowledgeProvenanceRelations = relations(knowledgeProvenance, ({ one }) => ({
  source: one(knowledgeSources, {
    fields: [knowledgeProvenance.sourceId],
    references: [knowledgeSources.id],
  }),
}));

export const dictionaryEntriesRelations = relations(dictionaryEntries, ({ one, many }) => ({
  source: one(knowledgeSources, {
    fields: [dictionaryEntries.sourceId],
    references: [knowledgeSources.id],
  }),
  readings: many(dictionaryReadings),
  senses: many(dictionarySenses),
  conjugations: many(conjugations),
}));

export const dictionaryReadingsRelations = relations(dictionaryReadings, ({ one }) => ({
  entry: one(dictionaryEntries, {
    fields: [dictionaryReadings.entryId],
    references: [dictionaryEntries.id],
  }),
}));

export const dictionarySensesRelations = relations(dictionarySenses, ({ one }) => ({
  entry: one(dictionaryEntries, {
    fields: [dictionarySenses.entryId],
    references: [dictionaryEntries.id],
  }),
}));

export const radicalsRelations = relations(radicals, ({ many }) => ({
  kanji: many(kanjiEntries),
  components: many(kanjiComponents),
}));

export const kanjiEntriesRelations = relations(kanjiEntries, ({ one, many }) => ({
  source: one(knowledgeSources, {
    fields: [kanjiEntries.sourceId],
    references: [knowledgeSources.id],
  }),
  radical: one(radicals, {
    fields: [kanjiEntries.radicalId],
    references: [radicals.id],
  }),
  readings: many(kanjiReadings),
  components: many(kanjiComponents),
}));

export const kanjiReadingsRelations = relations(kanjiReadings, ({ one }) => ({
  kanji: one(kanjiEntries, {
    fields: [kanjiReadings.kanjiId],
    references: [kanjiEntries.id],
  }),
}));

export const kanjiComponentsRelations = relations(kanjiComponents, ({ one }) => ({
  kanji: one(kanjiEntries, {
    fields: [kanjiComponents.kanjiId],
    references: [kanjiEntries.id],
  }),
  radical: one(radicals, {
    fields: [kanjiComponents.radicalId],
    references: [radicals.id],
  }),
}));

export const grammarPatternsRelations = relations(grammarPatterns, ({ one }) => ({
  source: one(knowledgeSources, {
    fields: [grammarPatterns.sourceId],
    references: [knowledgeSources.id],
  }),
}));

export const sentencesRelations = relations(sentences, ({ one }) => ({
  source: one(knowledgeSources, {
    fields: [sentences.sourceId],
    references: [knowledgeSources.id],
  }),
}));

export const conjugationsRelations = relations(conjugations, ({ one }) => ({
  entry: one(dictionaryEntries, {
    fields: [conjugations.entryId],
    references: [dictionaryEntries.id],
  }),
}));

// ═════════════════════════════════════════════
// LEARNING DOMAIN
//
// Owned by src/services/learning (DOMAIN_OWNERSHIP §4, §5).
//
// Structure:  courses → units → lessons → lesson_items
//                                      └→ exercises → questions → answers
// Learner:    attempts (one per answered question) → progress (per lesson)
//
// Three decisions shape these tables:
//
//   1. learner columns are REAL foreign keys to identity_users. The Phase 00
//      audit recorded RISK-0013: the inherited schema carried `learner_id` as
//      unbound text with no users table, so nothing stopped progress rows
//      referencing accounts that never existed. Identity exists now, so this
//      domain is bound to it from the first migration.
//
//   2. attempts are recorded per QUESTION, not per exercise sitting. Exercise
//      scores are an aggregate over attempts. Item-level history is what SRS
//      scheduling and per-item mastery need, and a sitting-level row could not
//      be decomposed back into it.
//
//   3. course and unit progress are NOT stored. They are aggregates over
//      lesson progress, so they cannot drift out of step with the rows they
//      summarise.
// ═════════════════════════════════════════════

// ─────────────────────────────────────────────
// LEARNING — enums
// ─────────────────────────────────────────────

/** Editorial lifecycle. Only `published` content is visible to learners. */
export const publishStatusEnum = pgEnum("publish_status", [
  "draft",
  "published",
  "archived",
]);

/** What a lesson primarily teaches. */
export const lessonKindEnum = pgEnum("lesson_kind", [
  "vocabulary",
  "kanji",
  "grammar",
  "reading",
  "listening",
  "review",
  "mixed",
]);

/** What a lesson item points at. */
export const lessonItemKindEnum = pgEnum("lesson_item_kind", [
  "dictionary_entry",
  "kanji_entry",
  "grammar_pattern",
  "sentence",
  /** Free-text explanation written by an editor; references nothing. */
  "note",
]);

/** How an exercise is used. */
export const exerciseKindEnum = pgEnum("exercise_kind", [
  "practice",
  "quiz",
  "review",
  "assessment",
]);

/** The eight question types graded by QuizEngine (DOMAIN_OWNERSHIP §4). */
export const questionTypeEnum = pgEnum("question_type", [
  "multiple_choice",
  "type_answer",
  "reading",
  "listening",
  "matching",
  "fill_blank",
  "translation",
  "kanji_recognition",
]);

export const progressStatusEnum = pgEnum("progress_status", [
  "not_started",
  "in_progress",
  "completed",
]);

// ─────────────────────────────────────────────
// CURRICULUM
// ─────────────────────────────────────────────

/** A course: the largest unit of curriculum, e.g. "JLPT N5 Complete". */
export const courses = pgTable(
  "courses",
  {
    id: text("id").primaryKey(),
    slug: varchar("slug", { length: 160 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    subtitle: varchar("subtitle", { length: 300 }),
    description: text("description"),

    /** 5 = N5 … 1 = N1. NULL for courses that span levels. */
    jlptLevel: smallint("jlpt_level"),
    status: publishStatusEnum("status").notNull().default("draft"),
    /** Display order within the catalogue. */
    position: integer("position").notNull().default(0),
    estimatedMinutes: integer("estimated_minutes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("courses_slug_idx").on(table.slug),
    index("courses_status_idx").on(table.status),
    index("courses_jlpt_idx").on(table.jlptLevel),
    check(
      "courses_jlpt_check",
      sql`${table.jlptLevel} IS NULL OR ${table.jlptLevel} BETWEEN 1 AND 5`,
    ),
    check("courses_position_check", sql`${table.position} >= 0`),
    check("courses_slug_not_blank", sql`btrim(${table.slug}) <> ''`),
  ],
);

/** A unit: an ordered section of a course. */
export const units = pgTable(
  "units",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),

    slug: varchar("slug", { length: 160 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    position: integer("position").notNull().default(0),
    status: publishStatusEnum("status").notNull().default("draft"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("units_course_slug_idx").on(table.courseId, table.slug),
    // Ordering is unique within a course, so a curriculum cannot have two
    // "step 3"s and render nondeterministically.
    uniqueIndex("units_course_position_idx").on(table.courseId, table.position),
    index("units_course_idx").on(table.courseId),
    check("units_position_check", sql`${table.position} >= 0`),
  ],
);

/** A lesson: the atomic unit a learner completes. */
export const lessons = pgTable(
  "lessons",
  {
    id: text("id").primaryKey(),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),

    slug: varchar("slug", { length: 160 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    summary: text("summary"),
    kind: lessonKindEnum("kind").notNull().default("mixed"),
    position: integer("position").notNull().default(0),
    estimatedMinutes: integer("estimated_minutes"),
    status: publishStatusEnum("status").notNull().default("draft"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lessons_unit_slug_idx").on(table.unitId, table.slug),
    uniqueIndex("lessons_unit_position_idx").on(table.unitId, table.position),
    index("lessons_unit_idx").on(table.unitId),
    index("lessons_status_idx").on(table.status),
    check("lessons_position_check", sql`${table.position} >= 0`),
  ],
);

/**
 * A single piece of study content inside a lesson.
 *
 * This is the join between curriculum and knowledge: a lesson teaches actual
 * dictionary entries, kanji, grammar patterns and sentences rather than
 * duplicating their content.
 *
 * `kind` and the four nullable references are kept consistent by a check
 * constraint — exactly one reference is set, and it is the one `kind` names.
 * Without that, a row could claim to be a kanji item while pointing at a
 * sentence, and every reader would need defensive code.
 */
export const lessonItems = pgTable(
  "lesson_items",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),

    kind: lessonItemKindEnum("kind").notNull(),
    position: integer("position").notNull().default(0),

    dictionaryEntryId: text("dictionary_entry_id").references(() => dictionaryEntries.id, {
      onDelete: "cascade",
    }),
    kanjiEntryId: text("kanji_entry_id").references(() => kanjiEntries.id, {
      onDelete: "cascade",
    }),
    grammarPatternId: text("grammar_pattern_id").references(() => grammarPatterns.id, {
      onDelete: "cascade",
    }),
    sentenceId: text("sentence_id").references(() => sentences.id, { onDelete: "cascade" }),

    /** Editorial commentary. Required for `note`, optional elsewhere. */
    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lesson_items_lesson_position_idx").on(table.lessonId, table.position),
    index("lesson_items_lesson_idx").on(table.lessonId),
    index("lesson_items_dictionary_idx").on(table.dictionaryEntryId),
    index("lesson_items_kanji_idx").on(table.kanjiEntryId),
    index("lesson_items_grammar_idx").on(table.grammarPatternId),
    index("lesson_items_sentence_idx").on(table.sentenceId),
    check("lesson_items_position_check", sql`${table.position} >= 0`),
    // A note references nothing; every other kind references exactly one thing.
    check(
      "lesson_items_target_count_check",
      sql`(
        CASE WHEN ${table.kind} = 'note' THEN
          num_nonnulls(${table.dictionaryEntryId}, ${table.kanjiEntryId},
                       ${table.grammarPatternId}, ${table.sentenceId}) = 0
          AND ${table.note} IS NOT NULL
        ELSE
          num_nonnulls(${table.dictionaryEntryId}, ${table.kanjiEntryId},
                       ${table.grammarPatternId}, ${table.sentenceId}) = 1
        END
      )`,
    ),
    // …and that one reference must be the column `kind` names.
    check(
      "lesson_items_target_matches_kind_check",
      sql`(
        (${table.kind} <> 'dictionary_entry' OR ${table.dictionaryEntryId} IS NOT NULL)
        AND (${table.kind} <> 'kanji_entry' OR ${table.kanjiEntryId} IS NOT NULL)
        AND (${table.kind} <> 'grammar_pattern' OR ${table.grammarPatternId} IS NOT NULL)
        AND (${table.kind} <> 'sentence' OR ${table.sentenceId} IS NOT NULL)
      )`,
    ),
  ],
);

// ─────────────────────────────────────────────
// ASSESSMENT
// ─────────────────────────────────────────────

/** A set of questions attached to a lesson. */
export const exercises = pgTable(
  "exercises",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),

    slug: varchar("slug", { length: 160 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    instructions: text("instructions"),
    kind: exerciseKindEnum("kind").notNull().default("practice"),
    position: integer("position").notNull().default(0),

    /** Percentage correct required to pass, 0–100. */
    passThreshold: smallint("pass_threshold").notNull().default(80),
    /** Optional time limit for timed assessments. */
    timeLimitSeconds: integer("time_limit_seconds"),
    /** Whether question order is randomised per sitting. */
    shuffleQuestions: boolean("shuffle_questions").notNull().default(false),

    status: publishStatusEnum("status").notNull().default("draft"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("exercises_lesson_slug_idx").on(table.lessonId, table.slug),
    index("exercises_lesson_idx").on(table.lessonId),
    check("exercises_position_check", sql`${table.position} >= 0`),
    check(
      "exercises_pass_threshold_check",
      sql`${table.passThreshold} BETWEEN 0 AND 100`,
    ),
    check(
      "exercises_time_limit_check",
      sql`${table.timeLimitSeconds} IS NULL OR ${table.timeLimitSeconds} > 0`,
    ),
  ],
);

/**
 * A question within an exercise.
 *
 * The knowledge references are optional provenance: when a question is
 * generated from a dictionary entry or grammar pattern, recording which one
 * lets the platform explain *why* a learner saw it, and lets SRS credit the
 * right item.
 */
export const questions = pgTable(
  "questions",
  {
    id: text("id").primaryKey(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),

    type: questionTypeEnum("type").notNull(),
    position: integer("position").notNull().default(0),

    /** Question text shown to the learner. */
    prompt: text("prompt").notNull(),
    /** Japanese stimulus, when the prompt needs one. */
    promptJa: text("prompt_ja"),
    hint: text("hint"),
    /** Shown after answering, right or wrong. */
    explanation: text("explanation"),

    /** 1 (easiest) to 5 (hardest). */
    difficulty: smallint("difficulty").notNull().default(3),
    points: smallint("points").notNull().default(1),
    audioUrl: text("audio_url"),

    /** What this question tests, for SRS credit and analytics. */
    dictionaryEntryId: text("dictionary_entry_id").references(() => dictionaryEntries.id, {
      onDelete: "set null",
    }),
    kanjiEntryId: text("kanji_entry_id").references(() => kanjiEntries.id, {
      onDelete: "set null",
    }),
    grammarPatternId: text("grammar_pattern_id").references(() => grammarPatterns.id, {
      onDelete: "set null",
    }),
    sentenceId: text("sentence_id").references(() => sentences.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("questions_exercise_position_idx").on(table.exerciseId, table.position),
    index("questions_exercise_idx").on(table.exerciseId),
    index("questions_type_idx").on(table.type),
    index("questions_dictionary_idx").on(table.dictionaryEntryId),
    index("questions_kanji_idx").on(table.kanjiEntryId),
    index("questions_grammar_idx").on(table.grammarPatternId),
    check("questions_position_check", sql`${table.position} >= 0`),
    check("questions_difficulty_check", sql`${table.difficulty} BETWEEN 1 AND 5`),
    check("questions_points_check", sql`${table.points} > 0`),
    check("questions_prompt_not_blank", sql`btrim(${table.prompt}) <> ''`),
  ],
);

/**
 * A candidate answer for a question.
 *
 * Used both for multiple-choice options and for the accepted responses of a
 * typed answer — 食べる and たべる can both be correct, which is why
 * correctness is a per-row flag rather than a single `correct_answer` column.
 *
 * `normalized` holds the comparison form (trimmed, case-folded, width-folded)
 * so grading never re-derives it at request time.
 */
export const answers = pgTable(
  "answers",
  {
    id: text("id").primaryKey(),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),

    position: integer("position").notNull().default(0),
    text: text("text").notNull(),
    normalized: text("normalized").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
    /** Explanation for choosing this option, shown after answering. */
    feedback: text("feedback"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("answers_question_position_idx").on(table.questionId, table.position),
    index("answers_question_idx").on(table.questionId),
    // Grading a typed answer is an indexed lookup, not a table scan.
    index("answers_normalized_idx").on(table.questionId, table.normalized),
    check("answers_position_check", sql`${table.position} >= 0`),
    check("answers_text_not_blank", sql`btrim(${table.text}) <> ''`),
  ],
);

// ─────────────────────────────────────────────
// LEARNER ACTIVITY
// ─────────────────────────────────────────────

/**
 * One learner's answer to one question.
 *
 * Recorded per question rather than per sitting: SRS scheduling and per-item
 * mastery both need item-level history, and a sitting-level row could not be
 * decomposed back into it. A sitting is reconstructed by grouping on
 * `submissionId`, and an exercise score is an aggregate over these rows.
 *
 * `exerciseId` is denormalised so "score this sitting" does not need a join
 * through questions.
 *
 * The foreign key to questions is RESTRICT, not CASCADE: deleting a question
 * that learners have already answered would silently destroy their history.
 * Content that is live should be archived, not deleted.
 */
export const attempts = pgTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => identityUsers.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),

    /** Groups every answer given in one sitting of an exercise. */
    submissionId: text("submission_id").notNull(),
    /** 1 for a learner's first attempt at this question, 2 for the next, … */
    attemptNumber: integer("attempt_number").notNull().default(1),

    /** Set for option-based questions. */
    selectedAnswerId: text("selected_answer_id").references(() => answers.id, {
      onDelete: "set null",
    }),
    /** Set for typed questions. */
    responseText: text("response_text"),

    /** Graded server-side by QuizEngine; a client-submitted verdict is ignored. */
    isCorrect: boolean("is_correct").notNull(),
    pointsAwarded: smallint("points_awarded").notNull().default(0),
    durationMs: integer("duration_ms"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("attempts_user_idx").on(table.userId),
    index("attempts_question_idx").on(table.questionId),
    index("attempts_submission_idx").on(table.submissionId),
    // The hot path: this learner's history for this question.
    index("attempts_user_question_idx").on(table.userId, table.questionId),
    index("attempts_user_exercise_idx").on(table.userId, table.exerciseId),
    index("attempts_created_idx").on(table.createdAt),
    uniqueIndex("attempts_unique_try_idx").on(
      table.userId,
      table.questionId,
      table.submissionId,
      table.attemptNumber,
    ),
    check("attempts_attempt_number_check", sql`${table.attemptNumber} >= 1`),
    check("attempts_points_check", sql`${table.pointsAwarded} >= 0`),
    check(
      "attempts_duration_check",
      sql`${table.durationMs} IS NULL OR ${table.durationMs} >= 0`,
    ),
    // An attempt must actually contain a response of some kind.
    check(
      "attempts_response_present_check",
      sql`${table.selectedAnswerId} IS NOT NULL OR ${table.responseText} IS NOT NULL`,
    ),
  ],
);

/**
 * A learner's state for one lesson.
 *
 * One row per (learner, lesson). Course and unit progress are deliberately
 * NOT stored: they are aggregates over these rows, so they cannot drift out
 * of step with the lessons they summarise. `courseId` is denormalised so that
 * aggregation is a single indexed scan rather than a three-table join.
 */
export const progress = pgTable(
  "progress",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => identityUsers.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),

    status: progressStatusEnum("status").notNull().default("not_started"),
    /** 0–100. */
    completionPercent: smallint("completion_percent").notNull().default(0),
    /** Best score achieved on this lesson's exercises, 0–100. */
    bestScorePercent: smallint("best_score_percent"),
    attemptsCount: integer("attempts_count").notNull().default(0),
    timeSpentSeconds: integer("time_spent_seconds").notNull().default(0),

    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("progress_user_lesson_idx").on(table.userId, table.lessonId),
    index("progress_user_idx").on(table.userId),
    // Course-level aggregation for a learner.
    index("progress_user_course_idx").on(table.userId, table.courseId),
    index("progress_status_idx").on(table.userId, table.status),
    index("progress_last_activity_idx").on(table.userId, table.lastActivityAt),
    check(
      "progress_completion_check",
      sql`${table.completionPercent} BETWEEN 0 AND 100`,
    ),
    check(
      "progress_best_score_check",
      sql`${table.bestScorePercent} IS NULL OR ${table.bestScorePercent} BETWEEN 0 AND 100`,
    ),
    check("progress_attempts_check", sql`${table.attemptsCount} >= 0`),
    check("progress_time_check", sql`${table.timeSpentSeconds} >= 0`),
    // A completed lesson must record when, and be at 100%.
    check(
      "progress_completed_consistency_check",
      sql`${table.status} <> 'completed'
          OR (${table.completedAt} IS NOT NULL AND ${table.completionPercent} = 100)`,
    ),
  ],
);

// ─────────────────────────────────────────────
// LEARNING — relations
// ─────────────────────────────────────────────

export const coursesRelations = relations(courses, ({ many }) => ({
  units: many(units),
  progress: many(progress),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  course: one(courses, { fields: [units.courseId], references: [courses.id] }),
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  unit: one(units, { fields: [lessons.unitId], references: [units.id] }),
  items: many(lessonItems),
  exercises: many(exercises),
  progress: many(progress),
}));

export const lessonItemsRelations = relations(lessonItems, ({ one }) => ({
  lesson: one(lessons, { fields: [lessonItems.lessonId], references: [lessons.id] }),
  dictionaryEntry: one(dictionaryEntries, {
    fields: [lessonItems.dictionaryEntryId],
    references: [dictionaryEntries.id],
  }),
  kanjiEntry: one(kanjiEntries, {
    fields: [lessonItems.kanjiEntryId],
    references: [kanjiEntries.id],
  }),
  grammarPattern: one(grammarPatterns, {
    fields: [lessonItems.grammarPatternId],
    references: [grammarPatterns.id],
  }),
  sentence: one(sentences, { fields: [lessonItems.sentenceId], references: [sentences.id] }),
}));

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  lesson: one(lessons, { fields: [exercises.lessonId], references: [lessons.id] }),
  questions: many(questions),
  attempts: many(attempts),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  exercise: one(exercises, { fields: [questions.exerciseId], references: [exercises.id] }),
  answers: many(answers),
  attempts: many(attempts),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  question: one(questions, { fields: [answers.questionId], references: [questions.id] }),
}));

export const attemptsRelations = relations(attempts, ({ one }) => ({
  user: one(identityUsers, { fields: [attempts.userId], references: [identityUsers.id] }),
  question: one(questions, { fields: [attempts.questionId], references: [questions.id] }),
  exercise: one(exercises, { fields: [attempts.exerciseId], references: [exercises.id] }),
  selectedAnswer: one(answers, {
    fields: [attempts.selectedAnswerId],
    references: [answers.id],
  }),
}));

export const progressRelations = relations(progress, ({ one }) => ({
  user: one(identityUsers, { fields: [progress.userId], references: [identityUsers.id] }),
  lesson: one(lessons, { fields: [progress.lessonId], references: [lessons.id] }),
  course: one(courses, { fields: [progress.courseId], references: [courses.id] }),
}));

// ═════════════════════════════════════════════
// SRS DOMAIN
//
// Owned by src/services/srs. Exactly one scheduler exists: FSRS-5 with SM-2
// as a fallback (ARCHITECTURE_FREEZE §9). Repository B's separate SM-2 engine
// is deprecated — two schedulers writing one deck corrupts intervals.
//
// Scheduling is SERVER-AUTHORITATIVE. Clients submit a rating; they never
// compute a due date. The schema enforces that by making an incoherent
// schedule row impossible rather than trusting callers to behave.
//
// Split across two tables on purpose:
//
//   srs_cards     WHAT to study — stable identity, written once
//   srs_schedule  WHEN to study it — mutable FSRS state, rewritten on every
//                 review, and the only table the due-query touches
//
// That separation means "reset this card's scheduling" does not disturb card
// identity or its review history, and the hot path is a single narrow index
// scan instead of a join.
// ═════════════════════════════════════════════

// ─────────────────────────────────────────────
// SRS — enums
// ─────────────────────────────────────────────

/** FSRS card states. */
export const srsCardStateEnum = pgEnum("srs_card_state", [
  "new",
  "learning",
  "review",
  "relearning",
]);

/** The four FSRS grades a learner can give. */
export const srsRatingEnum = pgEnum("srs_rating", ["again", "hard", "good", "easy"]);

/** Which direction of recall a card tests. */
export const srsDirectionEnum = pgEnum("srs_direction", [
  /** Japanese shown, meaning recalled. */
  "recognition",
  /** Meaning shown, Japanese produced. */
  "recall",
  /** Character production, for kanji. */
  "writing",
]);

/** Scheduling algorithm that produced a row's state. */
export const srsAlgorithmEnum = pgEnum("srs_algorithm", ["fsrs_5", "sm_2"]);

// ─────────────────────────────────────────────
// DECKS
// ─────────────────────────────────────────────

/**
 * A learner's collection of cards.
 *
 * `cardCount` is deliberately NOT stored. It is an aggregate over srs_cards,
 * and a stored copy drifts the moment anything writes cards outside the one
 * path that maintains it — the same reasoning that kept course progress
 * derived in Phase 03.2.
 */
export const srsDecks = pgTable(
  "srs_decks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => identityUsers.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),

    /** The deck new cards go to when none is chosen. At most one per learner. */
    isDefault: boolean("is_default").notNull().default(false),

    /** Per-deck overrides of the learner's global limits. NULL = inherit. */
    dailyNewLimit: smallint("daily_new_limit"),
    dailyReviewLimit: integer("daily_review_limit"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("srs_decks_user_name_idx").on(table.userId, table.name),
    index("srs_decks_user_idx").on(table.userId),
    // Referenced by the composite foreign key on srs_cards below, which is
    // what stops a card being filed into another learner's deck.
    unique("srs_decks_id_user_key").on(table.id, table.userId),
    // At most one default deck per learner, enforced by a partial index.
    uniqueIndex("srs_decks_one_default_idx")
      .on(table.userId)
      .where(sql`${table.isDefault} = true`),
    check("srs_decks_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check(
      "srs_decks_new_limit_check",
      sql`${table.dailyNewLimit} IS NULL OR ${table.dailyNewLimit} BETWEEN 0 AND 500`,
    ),
    check(
      "srs_decks_review_limit_check",
      sql`${table.dailyReviewLimit} IS NULL OR ${table.dailyReviewLimit} BETWEEN 0 AND 10000`,
    ),
  ],
);

// ─────────────────────────────────────────────
// CARDS
// ─────────────────────────────────────────────

/**
 * One studiable item for one learner.
 *
 * Identity only: which knowledge entity, in which direction, in which deck.
 * Everything that changes when the card is reviewed lives in srs_schedule.
 *
 * The same exactly-one-target discipline as lesson_items: `targetKind` names
 * the column that must be set, and check constraints keep the two in step.
 */
export const srsCards = pgTable(
  "srs_cards",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => identityUsers.id, { onDelete: "cascade" }),
    deckId: text("deck_id").notNull(),

    /** Reuses the knowledge entity vocabulary from lesson_items. */
    targetKind: lessonItemKindEnum("target_kind").notNull(),
    direction: srsDirectionEnum("direction").notNull().default("recognition"),

    dictionaryEntryId: text("dictionary_entry_id").references(() => dictionaryEntries.id, {
      onDelete: "cascade",
    }),
    kanjiEntryId: text("kanji_entry_id").references(() => kanjiEntries.id, {
      onDelete: "cascade",
    }),
    grammarPatternId: text("grammar_pattern_id").references(() => grammarPatterns.id, {
      onDelete: "cascade",
    }),
    sentenceId: text("sentence_id").references(() => sentences.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A card can only sit in a deck owned by the same learner. Without this
    // composite key, a mis-set deckId would silently expose one learner's
    // study material inside another learner's deck.
    foreignKey({
      name: "srs_cards_deck_owner_fk",
      columns: [table.deckId, table.userId],
      foreignColumns: [srsDecks.id, srsDecks.userId],
    }).onDelete("cascade"),

    index("srs_cards_user_idx").on(table.userId),
    index("srs_cards_deck_idx").on(table.deckId),
    index("srs_cards_dictionary_idx").on(table.dictionaryEntryId),
    index("srs_cards_kanji_idx").on(table.kanjiEntryId),
    index("srs_cards_grammar_idx").on(table.grammarPatternId),
    index("srs_cards_sentence_idx").on(table.sentenceId),

    // One card per learner per item per direction. Recognition and recall of
    // the same word are distinct cards; two recognition cards are a bug.
    uniqueIndex("srs_cards_unique_dictionary_idx")
      .on(table.userId, table.dictionaryEntryId, table.direction)
      .where(sql`${table.dictionaryEntryId} IS NOT NULL`),
    uniqueIndex("srs_cards_unique_kanji_idx")
      .on(table.userId, table.kanjiEntryId, table.direction)
      .where(sql`${table.kanjiEntryId} IS NOT NULL`),
    uniqueIndex("srs_cards_unique_grammar_idx")
      .on(table.userId, table.grammarPatternId, table.direction)
      .where(sql`${table.grammarPatternId} IS NOT NULL`),
    uniqueIndex("srs_cards_unique_sentence_idx")
      .on(table.userId, table.sentenceId, table.direction)
      .where(sql`${table.sentenceId} IS NOT NULL`),

    check(
      "srs_cards_target_count_check",
      sql`num_nonnulls(${table.dictionaryEntryId}, ${table.kanjiEntryId},
                       ${table.grammarPatternId}, ${table.sentenceId}) = 1`,
    ),
    check(
      "srs_cards_target_matches_kind_check",
      sql`(
        (${table.targetKind} <> 'dictionary_entry' OR ${table.dictionaryEntryId} IS NOT NULL)
        AND (${table.targetKind} <> 'kanji_entry' OR ${table.kanjiEntryId} IS NOT NULL)
        AND (${table.targetKind} <> 'grammar_pattern' OR ${table.grammarPatternId} IS NOT NULL)
        AND (${table.targetKind} <> 'sentence' OR ${table.sentenceId} IS NOT NULL)
        AND ${table.targetKind} <> 'note'
      )`,
    ),
  ],
);

// ─────────────────────────────────────────────
// SCHEDULE
// ─────────────────────────────────────────────

/**
 * The live FSRS state of a card: exactly one row per card.
 *
 * `userId` is denormalised from the card so the due-query is a single indexed
 * scan rather than a join — the same trade made for `progress.courseId`.
 *
 * Suspension lives here, not on the card, because suspending is a scheduling
 * decision ("do not show me this for now"), not a change to what the card is.
 * That also keeps the due-query on one table.
 *
 * The check constraints below encode FSRS invariants so an incoherent row
 * cannot be written even by a buggy scheduler or a manual UPDATE.
 */
export const srsSchedule = pgTable(
  "srs_schedule",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => srsCards.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => identityUsers.id, { onDelete: "cascade" }),

    state: srsCardStateEnum("state").notNull().default("new"),
    algorithm: srsAlgorithmEnum("algorithm").notNull().default("fsrs_5"),

    /** When this card next becomes available. Never computed by a client. */
    due: timestamp("due", { withTimezone: true }).notNull().defaultNow(),

    /** FSRS memory stability, in days. NULL until first reviewed. */
    stability: doublePrecision("stability"),
    /** FSRS difficulty, 1–10. NULL until first reviewed. */
    difficulty: doublePrecision("difficulty"),
    /** Interval the scheduler chose at the last review, in days. */
    intervalDays: integer("interval_days").notNull().default(0),

    reps: integer("reps").notNull().default(0),
    /** Times this card was forgotten after having been learned. */
    lapses: integer("lapses").notNull().default(0),

    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    /** Excluded from review queues while true. */
    suspended: boolean("suspended").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("srs_schedule_card_idx").on(table.cardId),
    // The hot path: "what is due for this learner right now", answered from
    // one partial index that already excludes suspended cards.
    index("srs_schedule_due_idx")
      .on(table.userId, table.due)
      .where(sql`${table.suspended} = false`),
    index("srs_schedule_user_state_idx").on(table.userId, table.state),

    check("srs_schedule_reps_check", sql`${table.reps} >= 0`),
    check("srs_schedule_lapses_check", sql`${table.lapses} >= 0`),
    check("srs_schedule_interval_check", sql`${table.intervalDays} >= 0`),
    check(
      "srs_schedule_difficulty_check",
      sql`${table.difficulty} IS NULL OR ${table.difficulty} BETWEEN 1 AND 10`,
    ),
    check(
      "srs_schedule_stability_check",
      sql`${table.stability} IS NULL OR ${table.stability} > 0`,
    ),
    // A card cannot have lapsed more often than it has been reviewed.
    check("srs_schedule_lapses_bound_check", sql`${table.lapses} <= ${table.reps}`),
    // An unreviewed card is 'new' with no history; a reviewed one is not 'new'.
    check(
      "srs_schedule_new_state_check",
      sql`(${table.state} = 'new') = (${table.reps} = 0 AND ${table.lastReviewedAt} IS NULL)`,
    ),
    // Anything in the review state has been through the scheduler, so it must
    // carry the memory parameters the scheduler produced.
    check(
      "srs_schedule_review_requires_memory_check",
      sql`${table.state} <> 'review'
          OR (${table.stability} IS NOT NULL AND ${table.difficulty} IS NOT NULL)`,
    ),
  ],
);

// ─────────────────────────────────────────────
// REVIEWS
// ─────────────────────────────────────────────

/**
 * Append-only log of every review ever performed.
 *
 * Both the before and after state are recorded. That is what makes FSRS
 * parameter optimisation possible later: the optimiser replays a learner's
 * full history to fit weights, and it cannot do that from current state alone.
 * It is also the audit trail for "why is this card due then".
 *
 * Append-only is enforced by a database trigger created in the migration, not
 * merely by convention — see 0005. Cards use ON DELETE CASCADE here because a
 * deleted card's review history has no subject; the learner-level history that
 * matters for optimisation is retained for as long as the card exists.
 */
export const srsReviews = pgTable(
  "srs_reviews",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => srsCards.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => identityUsers.id, { onDelete: "cascade" }),

    rating: srsRatingEnum("rating").notNull(),
    algorithm: srsAlgorithmEnum("algorithm").notNull().default("fsrs_5"),

    stateBefore: srsCardStateEnum("state_before").notNull(),
    stateAfter: srsCardStateEnum("state_after").notNull(),
    stabilityBefore: doublePrecision("stability_before"),
    stabilityAfter: doublePrecision("stability_after"),
    difficultyBefore: doublePrecision("difficulty_before"),
    difficultyAfter: doublePrecision("difficulty_after"),
    intervalBefore: integer("interval_before").notNull().default(0),
    intervalAfter: integer("interval_after").notNull().default(0),

    /** Days that actually elapsed since the previous review. */
    elapsedDays: integer("elapsed_days"),
    /** Time the learner spent on this card, for analytics. */
    durationMs: integer("duration_ms"),

    /** When the card next became due as a result of this review. */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("srs_reviews_card_idx").on(table.cardId),
    index("srs_reviews_user_idx").on(table.userId),
    // Chronological replay for parameter optimisation.
    index("srs_reviews_user_reviewed_idx").on(table.userId, table.reviewedAt),
    index("srs_reviews_card_reviewed_idx").on(table.cardId, table.reviewedAt),
    check("srs_reviews_interval_before_check", sql`${table.intervalBefore} >= 0`),
    check("srs_reviews_interval_after_check", sql`${table.intervalAfter} >= 0`),
    check(
      "srs_reviews_duration_check",
      sql`${table.durationMs} IS NULL OR ${table.durationMs} >= 0`,
    ),
    check(
      "srs_reviews_elapsed_check",
      sql`${table.elapsedDays} IS NULL OR ${table.elapsedDays} >= 0`,
    ),
  ],
);

// ─────────────────────────────────────────────
// SRS — relations
// ─────────────────────────────────────────────

export const srsDecksRelations = relations(srsDecks, ({ one, many }) => ({
  user: one(identityUsers, { fields: [srsDecks.userId], references: [identityUsers.id] }),
  cards: many(srsCards),
}));

export const srsCardsRelations = relations(srsCards, ({ one, many }) => ({
  user: one(identityUsers, { fields: [srsCards.userId], references: [identityUsers.id] }),
  deck: one(srsDecks, { fields: [srsCards.deckId], references: [srsDecks.id] }),
  schedule: one(srsSchedule, { fields: [srsCards.id], references: [srsSchedule.cardId] }),
  reviews: many(srsReviews),
  dictionaryEntry: one(dictionaryEntries, {
    fields: [srsCards.dictionaryEntryId],
    references: [dictionaryEntries.id],
  }),
  kanjiEntry: one(kanjiEntries, {
    fields: [srsCards.kanjiEntryId],
    references: [kanjiEntries.id],
  }),
  grammarPattern: one(grammarPatterns, {
    fields: [srsCards.grammarPatternId],
    references: [grammarPatterns.id],
  }),
  sentence: one(sentences, { fields: [srsCards.sentenceId], references: [sentences.id] }),
}));

export const srsScheduleRelations = relations(srsSchedule, ({ one }) => ({
  card: one(srsCards, { fields: [srsSchedule.cardId], references: [srsCards.id] }),
  user: one(identityUsers, { fields: [srsSchedule.userId], references: [identityUsers.id] }),
}));

export const srsReviewsRelations = relations(srsReviews, ({ one }) => ({
  card: one(srsCards, { fields: [srsReviews.cardId], references: [srsCards.id] }),
  user: one(identityUsers, { fields: [srsReviews.userId], references: [identityUsers.id] }),
}));

// ─────────────────────────────────────────────
// Inferred types
// ─────────────────────────────────────────────

export type SrsDeck = typeof srsDecks.$inferSelect;
export type NewSrsDeck = typeof srsDecks.$inferInsert;
export type SrsCard = typeof srsCards.$inferSelect;
export type NewSrsCard = typeof srsCards.$inferInsert;
export type SrsSchedule = typeof srsSchedule.$inferSelect;
export type NewSrsSchedule = typeof srsSchedule.$inferInsert;
export type SrsReview = typeof srsReviews.$inferSelect;
export type NewSrsReview = typeof srsReviews.$inferInsert;
export type SrsRating = (typeof srsRatingEnum.enumValues)[number];
export type SrsCardState = (typeof srsCardStateEnum.enumValues)[number];

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type Unit = typeof units.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;
export type LessonItem = typeof lessonItems.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type Answer = typeof answers.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type NewAttempt = typeof attempts.$inferInsert;
export type Progress = typeof progress.$inferSelect;
export type NewProgress = typeof progress.$inferInsert;

export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type NewKnowledgeSource = typeof knowledgeSources.$inferInsert;
export type KnowledgeProvenance = typeof knowledgeProvenance.$inferSelect;
export type DictionaryEntry = typeof dictionaryEntries.$inferSelect;
export type NewDictionaryEntry = typeof dictionaryEntries.$inferInsert;
export type DictionaryReading = typeof dictionaryReadings.$inferSelect;
export type DictionarySense = typeof dictionarySenses.$inferSelect;
export type Radical = typeof radicals.$inferSelect;
export type KanjiEntry = typeof kanjiEntries.$inferSelect;
export type NewKanjiEntry = typeof kanjiEntries.$inferInsert;
export type KanjiReading = typeof kanjiReadings.$inferSelect;
export type KanjiComponent = typeof kanjiComponents.$inferSelect;
export type GrammarPattern = typeof grammarPatterns.$inferSelect;
export type Sentence = typeof sentences.$inferSelect;
export type Conjugation = typeof conjugations.$inferSelect;

export type IdentityUser = typeof identityUsers.$inferSelect;
export type NewIdentityUser = typeof identityUsers.$inferInsert;
export type IdentitySession = typeof identitySessions.$inferSelect;
export type IdentityRole = (typeof identityRoleEnum.enumValues)[number];
export type IdentityProfile = typeof identityProfiles.$inferSelect;
export type NewIdentityProfile = typeof identityProfiles.$inferInsert;
export type IdentityPreferences = typeof identityPreferences.$inferSelect;
export type NewIdentityPreferences = typeof identityPreferences.$inferInsert;
