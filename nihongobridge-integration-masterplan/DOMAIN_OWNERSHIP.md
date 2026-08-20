# DOMAIN OWNERSHIP — NihongoBridge

**Version:** 1.0
**Date:** 2025-07-16
**Phase:** Phase 01 — Architecture Freeze
**Status:** FROZEN — Changes require DEC-NNNN decision entry

---

## 1. Purpose

Every domain gets exactly **one** authoritative implementation. This document assigns ownership for every functional area, names the canonical files, and specifies what happens to the competing implementation. This avoids two systems doing the same thing.

---

## 2. Evidence Base

Ownership decisions are grounded in direct inspection of both repositories on GitHub:

| Repository | URL | Evidence |
|---|---|---|
| Repo A | `github.com/ranimony-afk/nihingobridgeupgrade` | Full file tree inspected: ~200 source files, 14 phases, 10 migrations, Flutter app, 55+ API routes, full auth, billing, search, KG, kanji, tutor, analytics |
| Repo B | `github.com/ranimony-afk/Knowledge-base-NihongoBridge` | Full file tree inspected: 10 sub-projects (admin, ai, api, etl, knowledge, mobile, platform, search, web), Python ETL, separate Drizzle schemas, Vitest test suites |

**Critical finding:** Repo A is NOT a blank starter — it is a fully developed application with auth, billing, learning engine, knowledge graph, search, AI tutor, kanji explorer, Flutter mobile, CI/CD, Docker, and 14 documented phases. The previous P00 audit was performed against a sandbox snapshot that did not contain the real Repo A codebase.

---

## 3. Domain Ownership Matrix

### 3.1 Master Table

| Domain | Authority | Repo A Files | Repo B Files | Integration Action | Confidence |
|---|---|---|---|---|---|
| **Authentication** | **Repo A** | `src/auth.ts`, `src/lib/identity/*` (service, jwt, cookies, rbac, oauth, totp, mail, seed), `src/app/api/auth/[...nextauth]/route.ts`, `src/app/api/v1/auth/*` (8 routes), `src/middleware.ts` | `nihongobridge-ai/lib/auth.ts`, `nihongobridge-api/lib/auth.ts`, `nihongobridge-api/middleware/auth.ts`, `nihongobridge-admin/lib/auth.ts`, `nihongobridge-admin/middleware.ts` | **Repo A is authoritative.** Repo B auth modules are DEPRECATE — they are standalone stubs, not integrated into Repo A's identity system (NextAuth.js + RBAC + JWT + TOTP). | HIGH |
| **PostgreSQL / Drizzle** | **Repo A** | `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.json`, `drizzle/migrations/0001–0010` (10 migration files) | `nihongobridge-admin/lib/db.ts`, `nihongobridge-admin/schema/admin.ts`, `nihongobridge-ai/lib/db.ts`, `nihongobridge-ai/schema/*`, `nihongobridge-api/lib/db.ts` | **Repo A is authoritative.** Repo A has the canonical schema with 10 migration phases. Repo B sub-projects each define their own db/schema — these are standalone and must NOT replace the Repo A schema. Repo B schemas are EVALUATE for table design ideas, then DEPRECATE. | HIGH |
| **Dictionary data** | **Merged** | `src/lib/dict/*` (conjugate.ts, enrich.ts), `src/app/api/v1/dict/*` (bookmarks, entries/[id], offline), `src/app/dictionary/*` (3 pages), `data/kg/jmdict-sample.jsonl` | `nihongobridge-api/lib/dictionary.ts`, `nihongobridge-api/app/api/dictionary/*` (5 routes: search, [id], autocomplete, bulk, random), `nihongobridge-etl/etl/loaders/dictionary_loader.py`, `nihongobridge-etl/etl/parsers/jmdict_parser.py`, `nihongobridge-knowledge/lib/dictionary/*` | **Merge.** Repo A has the runtime dictionary service (conjugation, enrichment, bookmarks, offline). Repo B has richer API patterns (autocomplete, bulk, random) and production ETL parsers (Python JMdict parser). Merge Repo B API patterns and ETL into Repo A's runtime. | HIGH |
| **Kanji** | **Merged** | `src/lib/kanji/*` (enrich.ts, tree.ts), `src/app/api/v1/kanji/*` (explore/[char], graph), `src/app/kanji/*` (3 pages), `src/components/KanjiExploreClient.tsx`, `src/components/KanjiRadial.tsx`, `src/components/StrokeAnimator.tsx` | `nihongobridge-api/app/api/kanji/*` (5 routes: search, [character], by-radical, level, quiz), `nihongobridge-knowledge/lib/kanji/*` | **Merge.** Repo A has the explorer UI (radial graph, stroke animation, enrichment). Repo B has cleaner API routes (by-radical, by-level, quiz endpoint). Merge Repo B API structure into Repo A kanji service. | HIGH |
| **Grammar** | **Merged** | `src/lib/grammar/*` (corpus.ts, engine.ts, pure.ts), `src/app/api/v1/grammar/*` (2 routes), `src/app/grammar/*` (2 pages), `src/components/GrammarAdminTools.tsx` | `nihongobridge-api/app/api/grammar/*` (4 routes: search, [id], level/[level], [id]/quiz), `nihongobridge-knowledge/lib/grammar/*` | **Merge.** Repo A has the grammar engine and admin tools. Repo B has a richer API surface (search, level filtering, quiz). Merge Repo B API patterns into Repo A. | HIGH |
| **ETL Pipelines** | **Repo B → Repo A** | `scripts/kg-etl.ts` (single script), `src/lib/kg/etl/files.ts`, `src/lib/kg/import.ts`, `src/lib/kg/validate.ts`, `src/lib/kg/seed.ts` | `nihongobridge-etl/` (full Python ETL project: parsers/jmdict_parser.py, parsers/tatoeba_stager.py, loaders/dictionary_loader.py, loaders/sentence_loader.py, enrichers/frequency_enricher.py, enrichers/jlpt_enricher.py, enrichers/furigana_enricher.py, generators/*, pipelines/*, CLI runner, checkpointing) | **Repo B ETL is primary.** Repo B has a production-grade Python ETL with JMdict parser, Tatoeba pipeline, question generators, enrichers, and checkpointing. Repo A has a minimal TypeScript ETL stub. Adapt Repo B ETL to load into Repo A's schema, or rewrite in TypeScript using Repo B's parser logic as reference. | HIGH |
| **Search** | **Repo A** | `src/lib/search/*` (indexer.ts, query.ts, romaji.ts, seed.ts, service.ts), `src/app/api/v1/search/*` (search, autocomplete, suggest), `src/app/search/page.tsx`, `src/components/SearchBox.tsx`, `src/components/SearchReindex.tsx`, `drizzle/migrations/0009_phase12_search.sql` | `nihongobridge-api/lib/search.ts`, `nihongobridge-api/lib/search-index.ts`, `nihongobridge-api/lib/globalSearch.ts`, `nihongobridge-api/app/api/search/route.ts`, `nihongobridge-search/` (separate sub-project) | **Repo A is authoritative.** Repo A has a full search stack: indexer, query parser, romaji conversion, seeding, dedicated migration, admin reindex UI, and 3 API endpoints (search, autocomplete, suggest). Repo B search modules are EVALUATE for any ideas, then DEPRECATE. | HIGH |
| **AI Provider** | **Repo A** | `src/lib/tutor/*` (analyze.ts, provider.ts, service.ts), `src/app/api/v1/tutor/*` (session, shadow, stream) | `nihongobridge-ai/` (full sub-project: lib/anthropic.ts, lib/prompts.ts, lib/dictionary-tool.ts, lib/rate-limit.ts, lib/tutor-client.ts, lib/validation.ts, schema/ai.ts, 5 API routes) | **Repo A is authoritative for tutor backend.** Repo A has the streaming tutor (session, shadow practice, stream endpoint). Repo B AI has valuable artifacts: Anthropic-specific tool patterns, prompt engineering (prompts.ts), dictionary-tool grounding, and a dedicated rate limiter. These are EVALUATE → selectively MERGE into Repo A's tutor service. | MEDIUM |
| **Tutor UI** | **Repo B → Repo A** | `src/components/TutorLab.tsx`, `src/app/conversation/page.tsx` | `nihongobridge-ai/components/ai/TutorChat.tsx`, `nihongobridge-ai/components/ai/MarkdownMessage.tsx` | **Evaluate both.** Repo A has TutorLab + conversation page. Repo B has dedicated TutorChat + MarkdownMessage. Compare quality; the richer component set wins. Integration target is always Repo A. | MEDIUM |
| **SRS** | **Repo A + selected Repo B** | `src/lib/kg/srs.ts`, `src/app/api/v1/kg/srs/route.ts`, `src/components/PinSrs.tsx` | `nihongobridge-api/lib/srs.ts`, `nihongobridge-api/app/api/srs/*` (add, due, review, stats/[userId]), `nihongobridge-api/types/srs.ts`, `nihongobridge-api/tests/srs.test.ts` | **Repo A is primary; merge Repo B SRS API.** Repo A has the SRS pinning UI and kg/srs route. Repo B has a richer SRS API (add, due, review, stats) with dedicated types and tests. Merge Repo B's API structure and test coverage into Repo A. | HIGH |
| **Learning Engine** | **Repo A** | `src/lib/curriculum.ts`, `src/lib/game.ts`, `src/lib/learner.ts`, `src/app/learn/*` (2 pages), `src/app/practice/page.tsx`, `src/app/stories/*`, `src/app/kana/page.tsx`, `src/app/quests/page.tsx`, `src/components/LessonRunner.tsx`, `src/components/PathBoard.tsx`, `src/components/SentenceBuilder.tsx`, `src/components/StoryPlayer.tsx`, `src/app/api/game/route.ts` | `nihongobridge-api/lib/testEngine.ts`, `nihongobridge-api/lib/testAssembler.ts`, `nihongobridge-api/lib/testQueries.ts`, `nihongobridge-api/lib/scoring.ts`, `nihongobridge-api/app/api/tests/*` (8 routes), `nihongobridge-etl/etl/generators/*` (question generators) | **Repo A is authoritative for lesson/path engine.** Repo A has the full Duolingo-style path (curriculum, game, LessonRunner, hearts, stories, kana board). Repo B has a formal test engine (timed tests, sessions, scoring, analytics) and question generators. Merge Repo B's test engine and question generators into Repo A as a "JLPT test" feature alongside the existing learn path. | HIGH |
| **Admin** | **Repo A shell + Repo B managers** | `src/app/admin/*` (13 admin pages: affiliates, analytics, billing, content, findings, grammar, identity, infra, kanji, kg, login, search, seo, tutor), `src/components/AdminShell.tsx`, `src/components/CmsDesk.tsx`, `src/components/IdentityDesk.tsx`, `src/components/KgImport.tsx`, etc. | `nihongobridge-admin/` (full sub-project: 7 admin pages, DictionaryManager, KanjiManager, QuestionBank, TestManager, BlogCms, MediaLibrary, PipelineControl, ETL pages, AI generate) | **Repo A shell is authoritative.** Repo A has 13 admin pages with identity, billing, infra, and analytics integrated. Repo B admin has richer CRUD managers (DictionaryManager, KanjiManager, QuestionBank, MediaLibrary) that are self-contained components. EVALUATE Repo B managers → MERGE the best ones as panels within Repo A's admin shell. | MEDIUM |
| **Billing / Payments** | **Repo A** | `src/lib/billing/*` (service.ts, providers.ts, gst.ts, commission.ts, affiliate.ts, seed.ts), `src/app/api/v1/billing/*` (8 routes: checkout, invoices, me, plans, quote, referrals, subscription, webhooks/stripe, webhooks/razorpay), `src/app/billing/*`, `src/app/premium/page.tsx`, `src/app/plus/page.tsx`, `drizzle/migrations/0004_phase4_billing.sql`, `drizzle/migrations/0010_phase13_payments.sql` | None | **Repo A only.** Repo B has no billing code. Repo A owns this entirely. | HIGH |
| **Analytics** | **Repo A** | `src/lib/analytics/*` (service.ts, metrics.ts, demo.ts), `src/app/api/v1/analytics/route.ts`, `src/app/api/v1/admin/analytics/*`, `src/app/admin/analytics/page.tsx`, `src/components/analytics/*` | `nihongobridge-api/app/api/tests/analytics/[userId]/route.ts` | **Repo A is authoritative.** Repo A has platform-wide analytics. Repo B has only per-user test analytics — MERGE this one route's logic into Repo A's analytics service. | HIGH |
| **Gamification** | **Repo A** | `src/lib/game.ts` (hearts, XP, lives), `src/app/leaderboard/page.tsx`, `src/app/quests/page.tsx`, `src/app/shop/page.tsx` | `nihongobridge-api/lib/xp.ts` | **Repo A is authoritative.** Repo A has the full Duolingo-style gamification (hearts, XP, lives, leaderboard, quests, shop). Repo B has an XP utility module — EVALUATE for any missing XP logic, then DEPRECATE. | HIGH |
| **Tests** | **Repo A backend + Repo B patterns** | `tests/unit/*` (18 files), `tests/integration/*` (12 files), `tests/smoke/*` (1 file), `tests/e2e/*` (1 file) | `nihongobridge-admin/tests/*` (4 files, Vitest), `nihongobridge-ai/tests/*` (8 files, Vitest), `nihongobridge-api/tests/*` (8 files, Vitest) | **Repo A test infra is primary.** Repo A uses Node.js native test runner. Repo B uses Vitest. When integrating Repo B functionality, port relevant test logic to Repo A's runner. Repo B tests for AI (prompt testing, grounding, rate limiting) and API (scoring, session, SRS, validation) are valuable — adapt, don't copy verbatim. | MEDIUM |
| **SEO** | **Repo A** | `src/lib/seo/*` (7 files: blog, compose, config, jsonld, links, metadata, xml), `src/components/seo/*` (3 components), `src/app/robots.ts`, `src/app/sitemap.ts`, `src/app/feed.xml/route.ts` | None | **Repo A only.** Repo B has no SEO code. | HIGH |
| **Infrastructure** | **Repo A** | `src/lib/infra/*` (analytics, backups, env, errors, health, logger, rate-limit, redis, seed, supabase), `.github/workflows/*` (ci, deploy, backup, flutter), `Dockerfile`, `docker-compose.yml`, `scripts/*` (backup-db.sh, deploy.sh) | None significant | **Repo A only.** Repo A has full infra: CI/CD, Docker, backups, rate limiting, logging, Redis, Supabase. Repo B has minimal infra (rate-limit.ts in AI project). | HIGH |
| **Flutter / Mobile** | **Repo A** | `apps/mobile/` (full Flutter project: lib/core/api_client.dart, lib/core/repository.dart, lib/core/sqlite_service.dart, lib/core/sync.dart, lib/features/auth.dart, lib/features/downloads.dart, lib/features/progress.dart, lib/features/study.dart, lib/main.dart, tests, Android/iOS configs) | `nihongobridge-mobile/` (separate Flutter project) | **Repo A is authoritative.** Repo A has an integrated Flutter app under `apps/mobile/` that consumes Repo A's API with auth, sync, SQLite offline, downloads, study features. Repo B's mobile project is EVALUATE — compare feature coverage, but Repo A mobile is the one that's wired to Repo A's backend. | HIGH |
| **Knowledge Graph (KG)** | **Repo A** | `src/lib/kg/*` (corpus.ts, etl/files.ts, import.ts, search.ts, seed.ts, srs.ts, validate.ts), `src/app/api/v1/kg/*` (6 routes: grammar, kanji/[char], lexemes/[id], search, srs, stats), `src/app/admin/kg/page.tsx`, `data/kg/` | `nihongobridge-knowledge/` (full sub-project), `nihongobridge-etl/` (ETL for KG) | **Repo A is authoritative for KG runtime.** Repo A has the KG search, SRS integration, import pipeline, and admin UI. Repo B's `nihongobridge-knowledge/` and `nihongobridge-etl/` are the source data and ETL tooling — these are EVALUATE → MERGE the parsers/enrichers into Repo A's pipeline. | HIGH |
| **CMS / Content** | **Repo A** | `src/lib/cms/service.ts`, `src/app/api/v1/admin/cms/route.ts`, `src/app/admin/content/page.tsx`, `src/components/CmsDesk.tsx`, `src/app/blog/*` | `nihongobridge-admin/components/blog/BlogCms.tsx` | **Repo A is authoritative.** Repo A has CMS service, admin route, desk component, and blog pages. Repo B has a BlogCms component — EVALUATE for any richer editing features, then MERGE or DEPRECATE. | HIGH |
| **Media** | **Repo A** | `src/lib/media.ts`, `src/lib/speech.ts`, `src/components/SpeakLink.tsx` | `nihongobridge-admin/components/media/MediaLibrary.tsx`, `nihongobridge-api/lib/storage.ts`, `nihongobridge-api/lib/tts.ts`, `nihongobridge-api/app/api/listening/*` | **Merge.** Repo A has basic media and speech. Repo B has a MediaLibrary component, storage abstraction, TTS service, and listening exercise routes. MERGE Repo B's richer media/TTS/listening into Repo A. | MEDIUM |

---

## 4. Competing Implementation Resolution

Where both repos have implementations for the same function, this section names the winner and what happens to the loser.

### 4.1 Authentication (Winner: Repo A)

| | Repo A | Repo B |
|---|---|---|
| Auth library | NextAuth.js | Standalone stubs (per-project lib/auth.ts) |
| RBAC | `src/lib/identity/rbac.ts` | None |
| JWT | `src/lib/identity/jwt.ts`, `jwt-edge.ts` | None |
| 2FA/TOTP | `src/lib/identity/totp.ts` | None |
| OAuth | `src/lib/identity/oauth.ts` | None |
| Routes | 8 v1/auth routes + NextAuth catch-all | Middleware stubs |
| Tests | `tests/unit/jwt.test.ts`, `tests/unit/totp.test.ts`, `tests/unit/rbac.test.ts`, `tests/integration/identity.test.ts` | None |

**Decision:** Repo A auth is comprehensive and tested. Repo B auth stubs are DEPRECATE. When integrating Repo B features, wire them to Repo A's identity service.

### 4.2 Database Schema (Winner: Repo A)

| | Repo A | Repo B |
|---|---|---|
| Schema | `src/db/schema.ts` (single file, 10 migration phases) | Separate `schema/*.ts` in each sub-project |
| Migrations | `drizzle/migrations/0001–0010` | Separate drizzle dirs per sub-project |
| Connection | `src/db/index.ts` (singleton pool) | Separate `lib/db.ts` per sub-project |

**Decision:** Repo A's unified schema is authoritative. Repo B sub-project schemas are reference material for understanding Repo B's data expectations, then DEPRECATE. Any missing tables are added to Repo A schema per the DOMAIN_MODEL.md process.

### 4.3 SRS (Winner: Repo A + Repo B merge)

| | Repo A | Repo B |
|---|---|---|
| Service | `src/lib/kg/srs.ts` | `nihongobridge-api/lib/srs.ts` |
| Routes | `src/app/api/v1/kg/srs/route.ts` | 4 routes: add, due, review, stats |
| UI | `src/components/PinSrs.tsx` | None |
| Types | Inline | `nihongobridge-api/types/srs.ts` |
| Tests | None specific | `nihongobridge-api/tests/srs.test.ts` |

**Decision:** Repo A's SRS is embedded in the KG module. Repo B has a cleaner API surface (add/due/review/stats) with dedicated types and tests. MERGE: adopt Repo B's API structure and tests into Repo A's SRS service, keeping Repo A's UI and auth integration.

### 4.4 Search (Winner: Repo A)

| | Repo A | Repo B |
|---|---|---|
| Stack | 5-file service (indexer, query, romaji, seed, service), dedicated migration (0009), admin reindex | `nihongobridge-search/` (separate project), `nihongobridge-api/lib/search.ts`, `lib/globalSearch.ts` |
| Routes | search, autocomplete, suggest | search |
| Tests | `tests/unit/search-query.test.ts`, `tests/integration/search.test.ts` | None visible |

**Decision:** Repo A search is more complete (romaji conversion, autocomplete, suggest, admin reindex, indexed migration). KEEP Repo A. Repo B search is EVALUATE for any query strategies, then DEPRECATE.

---

## 5. Components with No Competition

These exist in only one repository — no conflict:

| Domain | Sole Owner | Key Files |
|---|---|---|
| Billing / Payments | Repo A | `src/lib/billing/*`, 8 API routes, Stripe + Razorpay webhooks |
| SEO | Repo A | `src/lib/seo/*`, robots, sitemap, RSS feed |
| Infrastructure | Repo A | Logger, rate-limit, Redis, Supabase, Docker, CI/CD, backups |
| Audit / Compliance | Repo A | `src/lib/audit/*`, findings pages, score system |
| Onboarding | Repo A | `src/app/onboarding/page.tsx` |
| Leaderboard | Repo A | `src/app/leaderboard/page.tsx` |
| Shop | Repo A | `src/app/shop/page.tsx`, `src/components/ShopGrid.tsx` |
| Stories | Repo A | `src/app/stories/*`, `src/components/StoryPlayer.tsx` |
| Question Generators | Repo B | `nihongobridge-etl/etl/generators/*` (vocab, grammar, reading, listening) |
| Python ETL | Repo B | Full pipeline: parsers, loaders, enrichers, checkpointing |
| Tatoeba Integration | Repo B | `nihongobridge-etl/etl/parsers/tatoeba_stager.py` |
| Listening Exercises | Repo B | `nihongobridge-api/app/api/listening/*`, TTS |

---

## 6. Integration Sequence

Based on ownership, this is the recommended integration order:

| Step | Domain | Action | Risk |
|---|---|---|---|
| 1 | Auth | Confirm Repo A auth is working; all Repo B features wire to it | LOW |
| 2 | Schema | Audit Repo A's `schema.ts` against DOMAIN_MODEL.md; add missing tables | LOW |
| 3 | ETL | Port Repo B Python ETL logic to TypeScript (or keep Python as external tool loading into Repo A DB) | MEDIUM |
| 4 | Dictionary | Merge Repo B's autocomplete/bulk/random API patterns into Repo A | LOW |
| 5 | Kanji | Merge Repo B's by-radical/by-level/quiz API patterns into Repo A | LOW |
| 6 | Grammar | Merge Repo B's search/level/quiz API patterns into Repo A | LOW |
| 7 | SRS | Merge Repo B's add/due/review/stats API + types + tests into Repo A | MEDIUM |
| 8 | Test Engine | Merge Repo B's test engine (sessions, scoring, analytics) into Repo A | MEDIUM |
| 9 | AI / Tutor | Merge Repo B's Anthropic tools, prompts, and grounding into Repo A tutor | MEDIUM |
| 10 | Admin | Evaluate Repo B managers (DictionaryManager, KanjiManager, QuestionBank, MediaLibrary); merge best ones | LOW |
| 11 | Media / TTS | Merge Repo B's MediaLibrary, TTS, listening exercises into Repo A | LOW |
| 12 | Question Gen | Port Repo B's question generators to work with Repo A schema | MEDIUM |
| 13 | Mobile | Confirm Repo A Flutter app is primary; compare with Repo B mobile | LOW |
| 14 | Tests | Port relevant Repo B Vitest tests to Repo A's test runner | LOW |

---

## 7. DEPRECATE Registry

Components explicitly deprecated — do NOT integrate these:

| Component | Repo | Reason |
|---|---|---|
| `nihongobridge-*/lib/auth.ts` (all sub-project auth stubs) | Repo B | Standalone stubs; Repo A has full auth |
| `nihongobridge-*/lib/db.ts` (all sub-project DB connections) | Repo B | Each creates its own pool; Repo A has singleton |
| `nihongobridge-*/schema/*.ts` (all sub-project schemas) | Repo B | Fragmented; Repo A has unified schema |
| `nihongobridge-platform/` | Repo B | Platform wrapper; Repo A IS the platform |
| `nihongobridge-web/` | Repo B | Web frontend; Repo A IS the web frontend |
| `.dartServer/` (Dart analysis cache) | Repo B | IDE artifacts; should be .gitignored |
| `.dart-tool/` | Repo B | IDE artifacts |
| `.config/` | Repo B | IDE/tool config |

---

## 8. Open Questions

| # | Question | Blocking Phase |
|---|---|---|
| 1 | Does Repo A's `src/db/schema.ts` already define all tables needed, or are some only in migrations? | Phase 01 |
| 2 | What is the exact schema of Repo B's `nihongobridge-knowledge/` — does it define tables that Repo A lacks? | Phase 01 |
| 3 | Can Repo B's Python ETL be run as an external tool that writes directly to Repo A's database? | Phase 02 |
| 4 | Are Repo B's question generators (grammar, vocabulary, reading, listening) AI-powered or rule-based? | Phase 04 |
| 5 | Does Repo B's `nihongobridge-mobile/` have features that Repo A's `apps/mobile/` lacks? | Phase 08 |
