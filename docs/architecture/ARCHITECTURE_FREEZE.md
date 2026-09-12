# NIHONGOBRIDGE — ARCHITECTURE FREEZE

**Version:** 3.0 — Freeze  
**Date:** 2026-03-25  
**Phase:** 00.3  
**Status:** FROZEN — changes require a new `DEC-NNNN` entry in `nihongobridge-integration-masterplan/DECISION_LOG.md`  
**Supersedes:** GitHub A `nihongobridge-integration-masterplan/TARGET_ARCHITECTURE.md` v2.0 ("Repository A is a clean starter with 0 tables") — falsified by audit 00.1  
**Implementation in this phase:** none

---

## 0. What this freeze is based on

| Input | Artifact |
|---|---|
| Forensic audit | `reports/integration/REPOSITORY-A-AUDIT.md`, `REPOSITORY-B-AUDIT.md` |
| Component verdicts | `reports/integration/MASTER-INTEGRATION-MATRIX.md` |
| Conflicts | `reports/integration/CONFLICT-MATRIX.md` |
| Evidence commits | A `4a7edcc`, B `0fa43c0` |

Every freeze decision below resolves a **specific competing implementation** found in that audit.

---

## 1. Canonical repository

**FROZEN: `nihingobridgeupgrade` (Repository A) is the single production repository.**

| Question | Decision |
|---|---|
| Production code lives in | Repository A |
| Repository B role | Historical source. Read-only reference for algorithms, contracts, UI patterns |
| Deployable unit | **One** Next.js App Router application |
| B's four Next 14 apps (web/api/admin/ai) | **Not deployed.** Their capabilities become routes and components *inside* A |
| Flutter client | Separate package `mobile/`, approved as the only non-web deployable |
| Python ETL | **Not** a production runtime. Algorithms ported to A's TypeScript ETL |

### 1.1 Resolved: the two Repository A trees

Audit found the deployable sandbox and GitHub A `main` differ (identical `package.json` and `/api/health`; different `src/db/schema.ts`).

**FROZEN:** GitHub A `main` is the **design source of truth**; the deployable working copy is the **runtime source of truth**. Phase 01 reconciles them by additively porting GitHub A's foundation into the deployable tree. Repository B code does not enter until that reconciliation is complete.

### 1.2 Frozen top-level layout

```
src/
├── app/
│   ├── api/            v2 domain, ai, admin, auth, health
│   ├── dictionary/ kanji/ grammar/ learn/ jlpt/ review/ tutor/
│   ├── dashboard/ admin/
├── components/
├── db/                 index.ts + schema.ts  ← ONE schema
├── services/           knowledge learning srs ai gamification search auth
├── repositories/
├── lib/ config/ types/
└── middleware.ts
etl/                    sources parsers transforms enrichment validators
                        matching provenance pipelines exports tests
mobile/                 Flutter
docs/ reports/ scripts/ tests/
```

---

## 2. Canonical database

**FROZEN: one PostgreSQL database, one Drizzle schema (`src/db/schema.ts`), `pg` (node-postgres) driver.**

| Competing implementation | Resolution |
|---|---|
| A: 39 tables, `text` PK | **CANONICAL** |
| B knowledge: ~20 tables, `uuid` PK | **DEPRECATED.** Never applied |
| B `drizzle/*.sql` migrations | **REJECTED.** Must never run against A's database |
| A `pg` vs B `postgres.js` | **`pg` wins** (`src/db/index.ts`) |
| B multi-database compose | **REJECTED** |

### 2.1 Frozen conventions

| Rule | Value |
|---|---|
| Primary key | `text`, application-generated, deterministic where derivable (`source:sourceId` hashing in ETL) |
| Timestamps | `timestamp with time zone`, `created_at` / `updated_at` |
| Flexible payloads | `jsonb` (glosses, structured content) |
| Arrays | PostgreSQL native arrays for tags/readings |
| Provenance | `source_provenance` table **plus** per-row `source`, `source_id`, `source_version`, `import_version`, `imported_at` |
| Indexes | declared in `schema.ts` — including `pg_trgm`/FTS (currently missing; added in the search phase) |
| Extensions | `pg_trgm` **required**; enablement must be explicit in migration, not assumed |
| Destructive DDL | forbidden without an authorizing DEC |

### 2.2 Frozen: JLPT encoding (previously UNVERIFIED — now RESOLVED)

**JLPT is stored as `smallint` where the number equals the N-level: `5` = N5 … `1` = N1. `NULL` = unclassified.**

Evidence: `src/services/learning/jlpt-engine.ts` defines `type JlptLevel = 1|2|3|4|5` and `JLPT_SECTIONS[5] = { vocab: 25, timeMinutes: 90 }` vs `JLPT_SECTIONS[1] = { vocab: 30, timeMinutes: 170 }`, matching the official N5→N1 progression. `etl/enrichment/jlpt.ts` maps 食べる→5.

B's `jlptLevelEnum('N5'…'N1','NONE')` is **not** adopted. Translation to `"N5"` strings happens only at API/UI edges.

### 2.3 Identity gap

A has no `users` table; `learnerId` is unbound `text`. **FROZEN:** an identity table is introduced in Phase 01 as an additive A-native table, and all `learnerId` columns become FKs to it. B's `users` is not imported (§3).

---

## 3. Canonical authentication

**FROZEN: Repository A owns identity. One authentication system. No external IdP is required for the platform to function.**

| Competing implementation | Resolution |
|---|---|
| A: none exists | Must be **built** (REWRITE) |
| B: Supabase JWT via `jose` (3 duplicate copies) | **REJECTED** as A's identity system |
| B: `ALLOW_INSECURE_USER_HEADER` / `x-user-id` | **REJECTED** — auth-bypass primitive |
| B admin: `demoAllowed()` → hardcoded `super_admin` | **REJECTED** |
| B: `/api/user/[userId]/…` path-parameter authorization | **REJECTED** — identity comes from the session, never the URL |

### 3.1 Frozen requirements (the *what*, not the library)

1. Credentials and sessions live in **A's PostgreSQL**.
2. **Web** authenticates with an httpOnly, SameSite session cookie.
3. **Flutter** authenticates with a Bearer access token + refresh token.
4. Both resolve to the **same** `identity_users.id` used by `learnerId`.
5. RBAC roles: `learner`, `reviewer`, `content_editor`, `admin`, `super_admin`.
6. Authorization is enforced server-side in `src/middleware.ts` + per-route guards; inbound identity headers are never trusted.
7. Every learner-mutating endpoint requires an authenticated subject.
8. Secrets only via environment variables.

**Library choice remains open (DEC-0005)** and is decided in Phase 01. The freeze binds the *architecture*, not the vendor. Any candidate must satisfy 1–8 without introducing a second identity store.

---

## 4. Canonical API

**FROZEN: one HTTP surface, served by Repository A's App Router.**

| Namespace | Purpose | Auth |
|---|---|---|
| `/api/health` | Infrastructure healthcheck | public — **frozen contract**, `{ ok: true }` |
| `/api/auth/*` | Session lifecycle | mixed |
| `/api/v2/*` | Domain: knowledge, learning, jlpt, srs, progress, gamification | read public / write authenticated |
| `/api/ai/*` | Tutor, explanation, correction | authenticated + rate-limited |
| `/api/admin/*` | CMS, ETL control, analytics | RBAC |
| `/api/v1/*` | Frozen legacy shims only. **No new routes** | as-is |

### 4.1 Resolved conflicts

| Conflict | Resolution |
|---|---|
| A `/api/v2/dictionary/search` vs B `/api/dictionary/search` | **A's `/api/v2` wins.** B's unversioned paths are never mounted |
| A envelope `{ success, data, meta }` vs B `{ data, meta, error }` | **A's envelope is canonical** |
| B Fastify search service (`:PORT/autocomplete`) | **Deprecated.** Becomes `/api/v2/dictionary/autocomplete` |
| B admin/AI as separate origins | **Merged** into A's namespaces |
| Flutter's `/api/mobile/bootstrap/dictionary`, `/api/mobile/sync` | Exist in **neither** repo. Frozen as **new** A endpoints under `/api/v2/mobile/*` |

### 4.2 Frozen contract rules

- Business logic lives in `src/services/**`; route handlers only validate, authorize, and serialize.
- Web and Flutter consume the **same** endpoints. No client-specific business logic.
- Breaking changes require a new version namespace, never a silent shape change.

---

## 5. Canonical knowledge model

**FROZEN: normalized, provenance-tracked, knowledge-first.**

| Entity | Canonical shape | Beats |
|---|---|---|
| Dictionary | `dictionary_entries` + `dictionary_senses` + `dictionary_readings` | B's single denormalized row with JSON `meanings` |
| Kanji | `kanji_entries` + `kanji_readings` + `kanji_components` + `kanji_component_links` | B's `radicals text[]` / `components text[]` |
| Grammar | `grammar_patterns` + `grammar_examples` | B's JSON `examples` |
| Sentences | `sentences` + `sentence_translations` | B's JSON `translations` |
| Conjugations | derived by `etl/enrichment/conjugations.ts` | — |
| Media | `media_assets` (to be added) with mandatory license columns | B `media.ts` |

Additive columns adopted from B: `romaji`, structured `furigana`, pitch accent.  
Missing link tables (dictionary↔grammar, question↔content) are added with `text` FKs.

### 5.1 Frozen provenance rule

No knowledge row may exist without a resolvable `source_provenance` record (source, version, license, URL, import version). Licensing conflicts logged in the matrix (JMdict CC BY-SA **3.0 vs 4.0**; Tatoeba CC BY 2.0 vs 2.0 FR) must be resolved **before** first production import.

Prohibited sources: Takoboto, Duolingo, Todaii, WaniKani — content, data, or UI.

---

## 6. Canonical search

**FROZEN: PostgreSQL is the search engine for v1.**

| Layer | Decision |
|---|---|
| Exact | equality on `headword` / `reading` / `character` |
| Prefix | `LIKE 'q%'` with indexes |
| Fuzzy | `pg_trgm` `similarity()` with ranked cascade |
| Full text | weighted `tsvector` (pattern adopted from B's index definitions) |
| Normalization | kana/romaji folding ported from B `search/lib/japanese.ts` |
| Ranking | exact → prefix → fuzzy, then frequency |
| Meilisearch | **DEPRECATED for v1** |
| Fastify search service | **DEPRECATED** |
| Semantic/vector search | **Future**, behind an interface — not in v1 |

`src/services/search/*` exposes an engine-agnostic interface so a future engine can be added without touching callers.

---

## 7. Canonical AI architecture

**FROZEN: retrieval-grounded. The model may not invent dictionary, kanji, or grammar facts when structured knowledge exists.**

```
/api/ai/*  →  src/services/ai/
                ├── knowledge-retrieval.ts   ← queries A's knowledge tables
                ├── rag-pipeline.ts          ← grounding + tool-calling
                ├── tutor-chat.ts            ← Hana-sensei persona
                └── llm-provider.ts          ← provider abstraction
```

| Rule | Decision |
|---|---|
| Grounding | Retrieval runs **before** generation; retrieved facts are injected as reference data |
| Tool-calling | `lookup_dictionary` resolves **in-process** against the knowledge service (not an HTTP self-call, unlike B) |
| Prompt | Adopt B's Hana-sensei contract: JLPT-aware, mandatory `<ruby>` furigana, explain-why corrections, ≤200 words, next-step suggestion |
| Prompt injection | Learner text is untrusted data, never instructions (B's rule, frozen) |
| Providers | Pluggable (OpenAI / Anthropic today) behind `llm-provider.ts`; keys from env only |
| No key configured | Deterministic mock provider — never a silent hallucination path |
| Caching | `ai_explanations` table for cost control |
| Rate limiting | Required; store pluggable (in-memory default, Redis optional) |
| Dependency gate | AI ships **after** knowledge data exists |

---

## 8. Canonical learning engine

**FROZEN: A's learning services are canonical.**

| Concern | Canonical | Resolution |
|---|---|---|
| Content hierarchy | `courses → course_modules → lessons → lesson_items → learning_content` | B has no courses; A wins by default |
| Question types | `QuizEngine` (8 types, pure functions, no DB) | Single grading authority |
| Question bank | `questions` + `question_options` | Richer than B's flat `questions` |
| Test sessions | `test_sessions` → `test_answers` → `test_results`, with `test_sections` | A's model is a superset of B's |
| Session storage | **PostgreSQL** | B's Redis-required sessions rejected |
| Timed JLPT | `jlpt-engine.ts` with official section structure per level | frozen |
| Question generation | Ported from B's Python generators + quality checker | ETL-time job, provenance recorded |
| Progress | `user_progress` + per-domain progress tables | B's polymorphic table not adopted |

---

## 9. Canonical SRS

**FROZEN: exactly one scheduler — FSRS-5 with SM-2 fallback, implemented in `src/services/srs/algorithm.ts` as a pure function.**

| Competing implementation | Resolution |
|---|---|
| A FSRS-5 + `srs_algorithm_state` | **CANONICAL** |
| B SM-2 (`lib/srs.ts`, ease clamp 1.3–2.5) | **DEPRECATED** as an engine; its tests are imported as regression cases |
| Two schedulers on one deck | **Forbidden** — corrupts intervals |

| Rule | Decision |
|---|---|
| Tables | `srs_decks`, `srs_cards`, `srs_reviews`, `srs_algorithm_state` |
| Review log | Append-only (idea adopted from B `srs_review_logs`) |
| Scheduling authority | **Server**. Clients never compute due dates |
| Offline clients | Queue review events; server recomputes and returns authoritative state |
| Live session state | Must become durable; the current in-memory `Map` is a known defect (A `review-session.ts`) |

---

## 10. Canonical web application

**FROZEN: Repository A's Next.js App Router application is the only web client.**

| Decision | Value |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Data access | Server Components for reads; route handlers for mutations |
| Business logic in components | Forbidden — call `src/services/**` or `/api/v2` |
| B's Next 14 / React 18 / Tailwind 3 UI | **ADAPT**, never copy verbatim |
| B demo fixtures (`lib/demo-*.ts`) | **Rejected** as product data |
| Japanese rendering | `<ruby>` furigana with sanitization (B's `SafeJapaneseHtml` pattern adopted) |
| Current control-tower UI | Temporary; replaced by the learner product in UI phases |
| Multilingual UI | Architecture must not hardcode English; scheduled post-gamification |

---

## 11. Canonical Flutter client

**FROZEN: one Flutter client in `mobile/`, a pure consumer of `/api/v2`.**

| Decision | Value |
|---|---|
| Source | Adapted from B `nihongobridge-mobile` (Riverpod, dio, sqflite, secure storage) |
| Business logic | **None duplicated.** Scoring, scheduling, grading are server-side |
| Local database | Read-through cache + outbox queue only |
| Sync | `/api/v2/srs/sync`; server-authoritative conflict resolution |
| Missing endpoints | `/api/v2/mobile/bootstrap` and `/api/v2/mobile/sync` are **new A work** |
| Auth | A-issued Bearer + refresh in secure storage. B's Supabase token flow removed |
| Offline | Dictionary/kanji cache and queued reviews must survive restart |
| Gate | Starts only after `/api/v2` and auth are frozen and stable |

---

## 12. Competing implementation register (final)

| # | Competition | Winner | Loser |
|---|---|---|---|
| 1 | Repository | A | B as production |
| 2 | Schema | A `text` PK, 39 tables | B `uuid` schema |
| 3 | DB driver | `pg` | `postgres.js` |
| 4 | Identity | A-native (to build) | Supabase JWT ×3 |
| 5 | Admin auth | A RBAC from session | header-trust + demo super_admin |
| 6 | API prefix | `/api/v2` | unversioned `/api/*` |
| 7 | Envelope | `{ success, data, meta }` | `{ data, meta, error }` |
| 8 | Search | PostgreSQL FTS + `pg_trgm` | Meilisearch + Fastify |
| 9 | SRS | FSRS-5 (A) | SM-2 (B) |
| 10 | Quiz grading | A `QuizEngine` | B per-route quiz logic |
| 11 | Test sessions | A tables in Postgres | B Redis-backed sessions |
| 12 | ETL runtime | A TypeScript | B Python (algorithms merged) |
| 13 | JMdict parser | B algorithm ported into A | A's current stub |
| 14 | JLPT encoding | `smallint` 5→N5 … 1→N1 | B enum labels |
| 15 | Object storage | deferred, provider-abstracted | MinIO/S3 as required infra |
| 16 | Cache/limiter | pluggable, in-memory default | mandatory Redis |
| 17 | Web client | A App Router | B Next 14 web app |
| 18 | Mobile | B app adapted under A contracts | B app against B API |
| 19 | Deployment | single app + one Postgres | 7-service compose |
| 20 | Audio/TTS | blocked pending license review | Edge TTS → public bucket |

---

## 13. Non-negotiable invariants

1. One repository, one schema, one identity, one API surface, one SRS, one search engine.
2. `GET /api/health` returns `{ ok: true }` — unchanged, forever.
3. No `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` without an authorizing DEC.
4. No Repository B directory is copied wholesale.
5. Business logic never duplicated between web and Flutter.
6. AI never asserts dictionary/grammar facts that contradict platform knowledge.
7. Every imported datum carries provenance and a permitted license.
8. Secrets never committed; `.env.example` documents names only.
9. Knowledge-first ordering: data → search → learning → AI.
10. Each phase ends deployable and green.

---

## 14. Change control

This freeze may only change via a new decision entry recording: what changed, why, the invariant affected, migration impact, and rollback. Silent drift is a gate failure.

**Frozen. Implementation begins in Phase 01 (Foundation), not in this phase.**
