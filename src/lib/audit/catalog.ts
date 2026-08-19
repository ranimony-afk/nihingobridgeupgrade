import type { FindingSeed, RoadmapSeed } from "./types";

export const PHASE1_REPORT = {
  id: "phase-1",
  phase: "1",
  title: "NihongoBridge Repository Audit",
  version: "1.0.0",
  summary:
    "This working tree is a production-ready Duolingo-style Japanese LMS MVP on Next.js App Router, Drizzle, and PostgreSQL. It is not yet the enterprise NihongoBridge platform described in the target architecture (NextAuth/JWT, /api/v1 REST, CMS, dictionary/kanji/grammar/conversation, JMdict family, Flutter, AI tutors). Phase 1 records the gap without rewriting the working lesson loop.",
};

export const PHASE1_FINDINGS: FindingSeed[] = [
  {
    id: "f-arch-monolith-modules",
    domain: "architecture",
    category: "architecture",
    severity: "high",
    title: "Domain logic lives in two god modules instead of bounded contexts",
    description:
      "Learner identity, hearts, streaks, XP, achievements, path unlocking, practice decks, and leaderboards are all implemented in src/lib/learner.ts (~468 lines). Game mutations share src/lib/game.ts. There is no src/db/schema/* split, no application service layer, and no separation between LMS, CMS, and identity.",
    evidence: "src/lib/learner.ts, src/lib/game.ts, src/db/schema.ts (single file, 16 LMS tables + 5 audit tables)",
    recommendation:
      "Keep current functions as the public API. Extract domains incrementally: identity, progress, catalog, commerce, audit. Re-export from the existing modules so /api/game and pages do not break.",
    effort: "L",
    priority: 10,
  },
  {
    id: "f-folder-flat-src",
    domain: "folder-structure",
    category: "architecture",
    severity: "medium",
    title: "Flat src/ tree cannot host CMS, mobile contracts, or ETL",
    description:
      "Source is src/app, src/components, src/db, src/lib only. Target enterprise layout (schema/*, apps/mobile, services/etl, docs/, tests/) is absent aside from this Phase 1 addition.",
    evidence: "src/** — 33 TypeScript modules, no packages/, no apps/, no middleware.ts",
    recommendation:
      "Add folders by extension: src/db/schema/, src/modules/{lms,audit,identity}, tests/, docs/, drizzle/. Do not move working lesson components until a later phase.",
    effort: "M",
    priority: 20,
  },
  {
    id: "f-api-god-endpoint",
    domain: "api-routes",
    category: "architecture",
    severity: "high",
    title: "All gameplay mutations share a single unversioned POST /api/game",
    description:
      "Onboarding, answer checking, lesson completion, shop, chests, stories, practice, and profile edits are dispatched by a string action union. There is no OpenAPI document, no /api/v1 LMS split, and GET /api/me is the only learner read model.",
    evidence: "src/app/api/game/route.ts, src/lib/game.ts GameAction, src/app/api/me/route.ts",
    recommendation:
      "Preserve POST /api/game as a compatibility facade. Add versioned resources under /api/v1/* that call the same handleGame/loadLearner helpers.",
    effort: "M",
    priority: 15,
  },
  {
    id: "f-db-single-schema",
    domain: "database",
    category: "data",
    severity: "medium",
    title: "Curriculum and progress share one schema file with sparse indexes",
    description:
      "Tables are well-normalized for an LMS MVP (learners, units, lessons, exercises, progress, daily_xp, review_cards). Missing: users/accounts/sessions, dictionary, kanji, grammar, CMS pages, media, payments, brands. review_cards.due_at and learners.is_bot have no secondary indexes.",
    evidence: "src/db/schema.ts, drizzle.config.json points at a single schema entrypoint",
    recommendation:
      "Keep tables. Add schema modules that re-export through src/db/schema.ts. Add indexes for due_at, is_bot, and weekly XP queries.",
    effort: "M",
    priority: 25,
  },
  {
    id: "f-auth-unsigned-cookie",
    domain: "authentication",
    category: "security",
    severity: "critical",
    title: "Learner session is an unsigned cookie containing a raw primary key",
    description:
      "nb_learner stores the learner UUID with httpOnly and SameSite=lax but no HMAC, expiry rotation, or server-side session table. Anyone who learns or guesses an id can impersonate that learner. There is no NextAuth, JWT, password, or email identity.",
    evidence: "src/lib/learner.ts LEARNER_COOKIE / setLearnerCookie / getLearnerId",
    recommendation:
      "Phase 2: introduce NextAuth + signed session while still honoring existing nb_learner cookies during migration. Do not delete the cookie contract until dual-read is live.",
    effort: "L",
    priority: 1,
  },
  {
    id: "f-middleware-absent",
    domain: "middleware",
    category: "missing",
    severity: "high",
    title: "No Next.js middleware for auth, i18n, or security headers",
    description:
      "Protected pages redirect in each server component via getPublicLearner(). There is no middleware.ts, no CSP, no hreflang routing, no admin matcher.",
    evidence: "glob middleware.ts — 0 files; per-page redirect in /learn, /practice, /shop, /profile, /quests, /stories",
    recommendation:
      "Add middleware that only annotates request headers and enforces /admin/* after staff auth. Leave public marketing and /api/health untouched.",
    effort: "M",
    priority: 12,
  },
  {
    id: "f-cms-missing",
    domain: "cms",
    category: "cms",
    severity: "high",
    title: "No headless CMS for pages, lessons, or editorial workflow",
    description:
      "Units, lessons, stories, and copy are TypeScript constants seeded once. After first seed, curriculum edits require a code change or a raw SQL write. No draft/publish, no translations table, no audit trail for content.",
    evidence: "src/lib/curriculum.ts UNITS/LESSONS/STORIES; src/lib/seed.ts early-return after first insert",
    recommendation:
      "Add cms_pages / cms_revisions tables and an admin editor. Continue to serve seeded LMS rows so the live path does not change.",
    effort: "XL",
    priority: 18,
  },
  {
    id: "f-admin-missing-pre-phase1",
    domain: "admin-dashboard",
    category: "cms",
    severity: "medium",
    title: "Admin surface did not exist before Phase 1",
    description:
      "The learner app has no /admin workspace, no staff roles, and no DAM. Phase 1 adds a scoped audit CMS only — not a full editorial dashboard.",
    evidence: "src/app has learner routes only prior to /admin addition",
    recommendation:
      "Grow /admin by plugins: audit (this phase), catalog, learners, CMS, media. Reuse staff_users rather than a second identity table.",
    effort: "L",
    priority: 16,
    status: "in_progress",
  },
  {
    id: "f-i18n-missing",
    domain: "localization",
    category: "missing",
    severity: "high",
    title: "UI is English-only; no EN/TA/ML/JA message catalogs",
    description:
      "Target product is multilingual (English, Tamil, Malayalam, Japanese). Root layout is lang=en. Lesson prompts are hardcoded English. No next-intl / i18n routing.",
    evidence: "src/app/layout.tsx lang=\"en\"; copy in src/app/page.tsx and curriculum prompts",
    recommendation:
      "Add message catalogs and a locale cookie without changing existing routes. Keep /learn URLs stable; add ?lang= or a later /[locale] only behind a flag.",
    effort: "L",
    priority: 22,
  },
  {
    id: "f-dictionary-missing",
    domain: "dictionary",
    category: "missing",
    severity: "high",
    title: "No JMdict / Takoboto-style dictionary",
    description:
      "Vocabulary exists only as lesson bank items. There is no word lookup, pitch accent, POS, or bilingual gloss API.",
    evidence: "No dictionary table or /dictionary route; BankItem in src/lib/curriculum.ts",
    recommendation:
      "Phase 4: ingest a JMdict subset into dictionary_entries. Expose GET /api/v1/dictionary?q= and a /dictionary page that does not replace /learn.",
    effort: "XL",
    priority: 30,
  },
  {
    id: "f-kanji-missing",
    domain: "kanji-explorer",
    category: "missing",
    severity: "medium",
    title: "No KANJIDIC2 explorer or stroke graphs",
    description:
      "A few kanji appear inside N5 lessons (駅, 右, 本) but there is no explorer, radical map, or KanjiVG animation.",
    evidence: "src/lib/curriculum.ts unit-n5 banks; no /kanji route",
    recommendation:
      "Add kanji_characters + readings tables and /kanji as a sibling of /kana. Reuse speakJapanese().",
    effort: "L",
    priority: 32,
  },
  {
    id: "f-grammar-missing",
    domain: "grammar",
    category: "missing",
    severity: "medium",
    title: "No conjugation engine or grammar database",
    description:
      "Particles は/を/です are taught as quiz items, not as a programmable grammar graph.",
    evidence: "lessons topic-wa, polite-desu, object-wo in src/lib/curriculum.ts",
    recommendation:
      "Add grammar_points and a pure conjugate() module with unit tests before any UI.",
    effort: "L",
    priority: 33,
  },
  {
    id: "f-quiz-client-trusted",
    domain: "quiz-engine",
    category: "security",
    severity: "critical",
    title: "Lesson, practice, and story scoring trust the client",
    description:
      "completeLesson accepts { correct, total } from the browser. completePractice accepts reviews and xp. completeStory accepts score. A modified client can award perfect accuracy, XP, gems, and crowns without answering.",
    evidence: "src/lib/game.ts completeLesson/completePractice/completeStory; LessonRunner next() POST body",
    recommendation:
      "Keep the endpoints. Persist a server-side attempt ledger in check/reviewResult and compute completion from that ledger. Ignore client tallies when a ledger exists.",
    effort: "M",
    priority: 2,
  },
  {
    id: "f-conversation-missing",
    domain: "conversation-lab",
    category: "missing",
    severity: "medium",
    title: "No conversation lab or AI tutor streaming",
    description:
      "Claude/OpenAI abstractions, shadowing recorder, and correction markup are not present. Audio is browser SpeechSynthesis only.",
    evidence: "src/lib/speech.ts; no /conversation, no AI SDK dependency in package.json",
    recommendation:
      "Add /api/v1/conversation/stream as a new route. Do not fold it into /api/game.",
    effort: "XL",
    priority: 40,
  },
  {
    id: "f-leaderboard-bots",
    domain: "leaderboards",
    category: "debt",
    severity: "low",
    title: "Weekly league is computed live with seeded bot rows",
    description:
      "Leaderboard works and is a real feature. Bots share the learners table (is_bot). There is no materialized view, no league assignment table, and no promotion/relegation history.",
    evidence: "src/lib/learner.ts getLeaderboard; src/lib/seed.ts BOTS; src/app/leaderboard/page.tsx",
    recommendation:
      "Keep getLeaderboard signature. Add weekly_standings snapshot job later; filter bots via query param rather than deleting them.",
    effort: "M",
    priority: 45,
  },
  {
    id: "f-dam-missing",
    domain: "dam",
    category: "missing",
    severity: "medium",
    title: "No digital asset management; media is hardcoded URLs",
    description:
      "Mascot PNGs live in public/images. Story and marketing photos are hotlinked Pexels URLs. No asset folders, variants, or license ledger.",
    evidence: "src/lib/media.ts; public/images/*; stories.cover columns store absolute URLs",
    recommendation:
      "Add media_assets table and serve existing public/ files as the first folder. Replace hotlinks incrementally.",
    effort: "L",
    priority: 48,
  },
  {
    id: "f-rest-unversioned",
    domain: "rest-api",
    category: "architecture",
    severity: "medium",
    title: "REST surface is three routes and is not documented",
    description:
      "Live public API is GET /api/health, GET /api/me, POST /api/game. No swagger, no pagination, no error envelope standard beyond { ok, error, status }.",
    evidence: "src/app/api/*/route.ts",
    recommendation:
      "Adopt { ok, data, error } on new /api/v1 routes. Leave /api/health returning { ok: true } forever.",
    effort: "S",
    priority: 14,
    status: "in_progress",
  },
  {
    id: "f-deploy-no-pipeline",
    domain: "deployment",
    category: "missing",
    severity: "medium",
    title: "No CI, Dockerfile, or environment contract beyond DATABASE_URL",
    description:
      "package.json has dev/build/start/lint/typecheck only. No Playwright, no GitHub Actions in this tree, no Vercel/Supabase config.",
    evidence: "package.json scripts; no .github/workflows in the working tree",
    recommendation:
      "Add a CI workflow that runs typecheck, unit tests, and next build. Do not change start/health contracts.",
    effort: "M",
    priority: 50,
  },
  {
    id: "f-supabase-absent",
    domain: "supabase",
    category: "missing",
    severity: "low",
    title: "Database is local PostgreSQL, not Supabase",
    description:
      "Drizzle uses pg Pool against DATABASE_URL. That is valid production Postgres. Supabase Auth, Storage, and RLS are unused.",
    evidence: "src/db/index.ts Pool; drizzle.config.json 127.0.0.1:5432/app_db",
    recommendation:
      "Keep the Drizzle client. When Supabase arrives, swap the connection string only and add RLS policies as a later migration.",
    effort: "M",
    priority: 55,
  },
  {
    id: "f-drizzle-push-only",
    domain: "drizzle",
    category: "debt",
    severity: "medium",
    title: "Schema changes were applied with drizzle-kit push, not versioned migrations",
    description:
      "drizzle.config.json has no out directory. Team cannot roll forward/back. Phase 1 adds SQL under drizzle/migrations/ as the start of a paper trail.",
    evidence: "drizzle.config.json; no prior drizzle/ folder",
    recommendation:
      "Keep push for sandboxes. Check in numbered SQL migrations for every additive schema change.",
    effort: "S",
    priority: 21,
    status: "in_progress",
  },
  {
    id: "f-seo-thin",
    domain: "seo",
    category: "seo",
    severity: "medium",
    title: "No sitemap, robots, JSON-LD, or hreflang",
    description:
      "Root metadata title/description exist. Pages are force-dynamic so they will not be statically prerendered. No Open Graph images beyond defaults.",
    evidence: "src/app/layout.tsx metadata; export const dynamic = force-dynamic on all pages",
    recommendation:
      "Add app/sitemap.ts and robots.ts. Keep force-dynamic on authenticated pages; statically generate the marketing landing later.",
    effort: "S",
    priority: 52,
  },
  {
    id: "f-perf-nplus1",
    domain: "performance",
    category: "performance",
    severity: "high",
    title: "Hot paths issue N+1 queries and seed on every layout render",
    description:
      "Root layout awaits seedReady() on every request. toPublic() does two extra queries. unlockAchievements loads all lessons and all progress. getLeaderboard scans every learner and every weekly daily_xp row. Bot seed inserts are serial.",
    evidence: "src/app/layout.tsx; src/lib/learner.ts toPublic/unlockAchievements/getLeaderboard; src/lib/seed.ts BOTS loop",
    recommendation:
      "Keep seedReady but skip DB when the in-memory flag is set (already true after first success). Batch weekly XP with a single grouped query. Do not prefetch lesson payloads on the path page.",
    effort: "M",
    priority: 11,
  },
  {
    id: "f-a11y-gaps",
    domain: "accessibility",
    category: "accessibility",
    severity: "medium",
    title: "Color-only states, emoji iconography, and missing live regions",
    description:
      "Correct/incorrect feedback is color plus text (good). Path nodes rely on emoji and color. Many images use empty alt. No skip link, no focus trap in the lesson overlay, no reduced-motion alternative for .floaty/.path-pulse.",
    evidence: "src/components/PathBoard.tsx; src/app/globals.css animations; img alt=\"\" in AppFrame and learn page",
    recommendation:
      "Add aria-current on the active path node, visible text for locked/current/complete, and prefers-reduced-motion overrides. Do not restyle the 3D buttons in a way that drops contrast.",
    effort: "M",
    priority: 35,
  },
  {
    id: "f-sec-no-ratelimit",
    domain: "security",
    category: "security",
    severity: "high",
    title: "No rate limit, body cap, or CSRF token on mutation APIs",
    description:
      "POST /api/game accepts any JSON cast as GameAction. Combined with unsigned cookies and client-trusted XP, this is farmable. Health is fine.",
    evidence: "src/app/api/game/route.ts request.json() with no size guard",
    recommendation:
      "Add a per-cookie token bucket in-process first. Validate action with a type guard. Keep the route path.",
    effort: "M",
    priority: 3,
  },
  {
    id: "f-sec-pool-defaults",
    domain: "security",
    category: "performance",
    severity: "medium",
    title: "pg Pool uses driver defaults; DATABASE_URL throw kills the module graph",
    description:
      "Importing @/db throws if DATABASE_URL is missing, which crashes route collection if env is absent. Pool has no max/idle/connectionTimeoutMillis despite the enterprise runbook calling for them.",
    evidence: "src/db/index.ts lines 5-19",
    recommendation:
      "Set pool options without changing the export shape { db, pool }. Keep the required-env throw in runtime, not at build if possible.",
    effort: "S",
    priority: 28,
  },
  {
    id: "f-debt-quests-fake",
    domain: "quiz-engine",
    category: "debt",
    severity: "medium",
    title: "Weekly quests fabricate progress",
    description:
      "Finish 5 lessons uses Math.min(5, learner.lessonsCompleted + 2) where lessonsCompleted is today's count, not a weekly aggregate. Rewards are display-only; completing a quest grants nothing.",
    evidence: "src/app/quests/page.tsx weeklies array",
    recommendation:
      "Compute weekly lesson counts from daily_xp.lessons_completed. Add a claim endpoint later; until then label rewards as preview.",
    effort: "S",
    priority: 26,
  },
  {
    id: "f-smell-unused-columns",
    domain: "database",
    category: "unused",
    severity: "low",
    title: "Lesson xpReward, kind, and review ease are stored but ignored",
    description:
      "completeLesson hardcodes 10/15 XP. reviewCards.ease is never read. hasCurriculum() is unused. seedReady is imported in game.ts but completion relies on layout seeding.",
    evidence: "src/db/schema.ts lessons.xpReward/kind; reviewCards.ease; src/lib/seed.ts hasCurriculum; src/lib/game.ts import seedReady",
    recommendation:
      "Wire xpReward into awardXp without changing the default 10/15 values (they already match most rows). Use ease in SM-2 when practice is hardened.",
    effort: "S",
    priority: 60,
  },
  {
    id: "f-dup-heart-logic",
    domain: "architecture",
    category: "duplicate",
    severity: "low",
    title: "Heart decrement is copy-pasted in two game actions",
    description:
      "check and reviewResult both compute hearts-1 and conditionally stamp heartsUpdatedAt. Risk of drift.",
    evidence: "src/lib/game.ts check vs reviewResult blocks",
    recommendation:
      "Extract loseHeart(learner) next to applyHeartRegen in learner.ts and call it from both actions. Do not change the numeric rules.",
    effort: "S",
    priority: 61,
  },
  {
    id: "f-dup-ui-primitives",
    domain: "folder-structure",
    category: "duplicate",
    severity: "low",
    title: "Press/card styles are copied instead of a component library",
    description:
      "Every page re-declares rounded cards, 3D .press buttons, and progress bars. Target stack lists shadcn/ui + Framer Motion + TanStack Query, none of which are installed.",
    evidence: "src/app/globals.css .press/.card; repeated markup in shop, profile, stories, onboarding",
    recommendation:
      "Introduce shadcn primitives beside existing CSS classes. Do not delete .press — map Button variants onto it.",
    effort: "L",
    priority: 62,
  },
  {
    id: "f-deps-gap",
    domain: "architecture",
    category: "dependency",
    severity: "high",
    title: "Target enterprise dependencies are not installed",
    description:
      "Runtime is next, react, drizzle-orm, pg, dotenv. Missing: next-auth, jose/jsonwebtoken, @supabase/supabase-js, @tanstack/react-query, framer-motion, shadcn/radix, AI SDKs. Installing them all in Phase 1 would invite unused-deps and accidental rewrites.",
    evidence: "package.json dependencies",
    recommendation:
      "Add libraries per phase when a module actually imports them. Phase 2: next-auth + zod. Phase 4+: search. Phase 7: AI SDK.",
    effort: "L",
    priority: 13,
  },
  {
    id: "f-tests-missing-pre",
    domain: "deployment",
    category: "missing",
    severity: "high",
    title: "No automated tests existed before Phase 1",
    description:
      "Gamification, SRS, and answer matching had zero unit or integration coverage. A regression in answersMatch would silently break every lesson.",
    evidence: "No tests/ directory prior to this phase; package.json has no test script",
    recommendation:
      "Keep new tests in tests/unit and tests/integration. Cover utils and audit first; add game ledger tests in Phase 2.",
    effort: "M",
    priority: 8,
    status: "in_progress",
  },
  {
    id: "f-seed-not-idempotent-content",
    domain: "database",
    category: "debt",
    severity: "medium",
    title: "Curriculum seed is insert-once and cannot repair missing rows",
    description:
      "If units exist but exercises were truncated, seed bails out. Bots are not refreshed. New catalog entries never appear in an already-seeded database.",
    evidence: "src/lib/seed.ts existing.length > 0 return",
    recommendation:
      "Switch to per-table upsert by primary key. Do not wipe learner_progress.",
    effort: "M",
    priority: 27,
  },
  {
    id: "f-timezone-utc",
    domain: "database",
    category: "smell",
    severity: "low",
    title: "Streaks and daily goals use UTC calendar days",
    description:
      "todayKey() is date.toISOString().slice(0,10). Learners in Japan (UTC+9) can lose a streak at 09:00 JST.",
    evidence: "src/lib/utils.ts todayKey/weekStartKey",
    recommendation:
      "Keep the helper signature. Add an optional timeZone argument defaulting to UTC, then persist learners.timezone.",
    effort: "M",
    priority: 58,
  },
];

export const PHASE1_ROADMAP: RoadmapSeed[] = [
  {
    id: "rm-1",
    phase: "1",
    title: "Repository audit registry",
    description:
      "Persist findings, expose /api/v1/audit, ship admin CMS, docs, migrations, and tests. Do not rewrite LMS modules.",
    status: "active",
    sortOrder: 1,
  },
  {
    id: "rm-2",
    phase: "2",
    title: "Identity dual-stack",
    description:
      "Add NextAuth + signed JWT/session while continuing to honor nb_learner cookies. Server-side attempt ledger for quizzes.",
    dependsOn: "rm-1",
    status: "planned",
    sortOrder: 2,
  },
  {
    id: "rm-3",
    phase: "3",
    title: "Versioned LMS API",
    description:
      "Split /api/v1/lessons, /progress, /shop facades that call existing handleGame. OpenAPI. Rate limits.",
    dependsOn: "rm-2",
    status: "planned",
    sortOrder: 3,
  },
  {
    id: "rm-4",
    phase: "4",
    title: "Dictionary subset",
    description: "JMdict subset + furigana + pitch fields. /dictionary page. Reuse SpeechSynthesis.",
    dependsOn: "rm-3",
    status: "planned",
    sortOrder: 4,
  },
  {
    id: "rm-5",
    phase: "5",
    title: "Kanji explorer",
    description: "KANJIDIC2 + KanjiVG metadata, /kanji sibling of /kana.",
    dependsOn: "rm-4",
    status: "planned",
    sortOrder: 5,
  },
  {
    id: "rm-6",
    phase: "6",
    title: "Grammar engine",
    description: "Conjugation module, grammar_points table, visual sentence chips.",
    dependsOn: "rm-3",
    status: "planned",
    sortOrder: 6,
  },
  {
    id: "rm-7",
    phase: "7",
    title: "Conversation lab",
    description: "Streaming AI tutor with provider abstraction (Claude/OpenAI). New routes only.",
    dependsOn: "rm-2",
    status: "planned",
    sortOrder: 7,
  },
  {
    id: "rm-8",
    phase: "8",
    title: "CMS + i18n + DAM",
    description: "Editorial workflow, EN/TA/ML/JA catalogs, media library. Grow /admin.",
    dependsOn: "rm-1",
    status: "planned",
    sortOrder: 8,
  },
  {
    id: "rm-9",
    phase: "9",
    title: "Exam simulator",
    description: "Timed JLPT sections and CAT. Reuse exercises table.",
    dependsOn: "rm-6",
    status: "planned",
    sortOrder: 9,
  },
  {
    id: "rm-10",
    phase: "10",
    title: "Flutter offline client",
    description: "Consume /api/v1. SQLite cache. Do not replace the web LMS.",
    dependsOn: "rm-3",
    status: "planned",
    sortOrder: 10,
  },
  {
    id: "rm-11",
    phase: "11",
    title: "SEO, a11y, performance, security hardening",
    description: "Sitemap, CSP, query batching, contrast, Playwright smoke tests.",
    dependsOn: "rm-3",
    status: "planned",
    sortOrder: 11,
  },
  {
    id: "rm-12",
    phase: "12",
    title: "Billing and multi-brand",
    description: "Stripe/Razorpay, coupons, brand_settings. Optional Supabase connection string.",
    dependsOn: "rm-2",
    status: "planned",
    sortOrder: 12,
  },
];
