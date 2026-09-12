# DOMAIN OWNERSHIP

**Version:** 1.0 — Frozen with `ARCHITECTURE_FREEZE.md` v3.0  
**Date:** 2026-03-25  
**Rule:** every capability has exactly **one** owning module. If two modules can answer the same question, one is wrong.

---

## 0. Ownership model

```
Route handler        → validate, authorize, serialize.  No business logic.
Service (src/services) → owns rules and invariants for its domain.
Repository (src/repositories) → owns SQL/Drizzle access for its tables.
ETL (etl/)            → owns ingestion and provenance. Never serves HTTP.
Client (web, Flutter) → owns presentation only.
```

A domain may **read** another domain through that domain's service. A domain may **never** write another domain's tables directly.

---

## 1. Domain register

| Domain | Owner (frozen) | Owns tables | Public entry points |
|---|---|---|---|
| Knowledge | `src/services/knowledge/*` | dictionary*, kanji*, grammar*, sentences*, media_assets | `/api/v2/dictionary`, `/kanji`, `/grammar`, `/knowledge` |
| Search | `src/services/search/*` | none (reads knowledge) | `/api/v2/dictionary/search`, `/autocomplete` |
| Learning | `src/services/learning/*` | courses, course_modules, lessons, lesson_items, learning_content | `/api/v2/courses`, `/lessons`, `/quiz` |
| Assessment / JLPT | `src/services/learning/{jlpt,test}-engine.ts` | practice_tests, test_sections, questions, question_options, test_sessions, test_answers, test_results | `/api/v2/jlpt`, `/tests` |
| SRS | `src/services/srs/*` | srs_decks, srs_cards, srs_reviews, srs_algorithm_state | `/api/v2/srs`, `/srs/review`, `/srs/sync` |
| Progress | `src/services/learning/progress-engine.ts` | user_progress, lesson_progress, vocabulary_progress, kanji_progress, grammar_progress | `/api/v2/progress` |
| Gamification | `src/services/gamification/*` | xp_events, achievements, user_achievements, streaks, daily_goals | `/api/v2/xp`, `/streaks`, `/achievements` |
| AI | `src/services/ai/*` | ai_explanations | `/api/ai/*` |
| Identity | `src/services/auth/*` | identity_users, sessions, credentials, roles | `/api/auth/*` |
| Admin | `src/services/admin/*` | admin_audit_logs, content_reviews, etl_pipeline_runs, etl_schedules, blog_posts | `/api/admin/*` |
| Ingestion | `etl/**` | source_provenance (writer) | CLI + admin-triggered jobs |

---

## 2. Knowledge

**Owns:** the truth about Japanese words, kanji, radicals, grammar, sentences, conjugations, and media references.

| Responsibility | Detail |
|---|---|
| Entity shape | Normalized entry → senses/readings; kanji → readings/components |
| Reads | Public |
| Writes | ETL and Admin only. **Learners never write knowledge** |
| Derived data | Conjugations via `etl/enrichment/conjugations.ts` |
| Provenance | Every row traceable to `source_provenance` |

**Does not own:** search ranking, learner progress, AI phrasing.

**Consumers:** Search, Learning, Assessment, SRS (card targets), AI (grounding), Admin, both clients.

---

## 3. Search

**Owns:** query interpretation and result ranking over knowledge.

| Responsibility | Detail |
|---|---|
| Cascade | exact → prefix → fuzzy (`pg_trgm`) → full text |
| Normalization | kana/romaji folding, width normalization |
| Ranking | match tier, then frequency/commonness |
| Engine | PostgreSQL only (v1), behind an engine-agnostic interface |

**Does not own:** the knowledge rows themselves, or any second index that could drift.

---

## 4. Learning

**Owns:** curriculum structure and lesson execution.

| Responsibility | Detail |
|---|---|
| Hierarchy | course → module → lesson → item → content |
| Lesson playback | sequencing, submission, completion |
| Question types | `QuizEngine` — 8 types, generation + grading, pure functions |
| Publication | draft/published lifecycle via Admin |

**Grading authority:** `QuizEngine` is the **only** grader. Assessment and SRS call it; they do not reimplement it.

---

## 5. Assessment / JLPT

**Owns:** question banks, timed tests, sections, scoring, attempt history.

| Responsibility | Detail |
|---|---|
| Level structure | Official per-level section counts and time limits (N5→N1) |
| Session lifecycle | start → answer → complete → review, persisted in PostgreSQL |
| Scoring | server-side only; clients never compute pass/fail |
| Readiness | derived from Progress + Knowledge counts |
| Generation | seeded by ETL question generators with provenance |

**Does not own:** SRS scheduling, XP award rules.

---

## 6. SRS

**Owns:** what to review and when.

| Responsibility | Detail |
|---|---|
| Algorithm | FSRS-5 primary, SM-2 fallback — single implementation |
| State | card stability/difficulty/due, append-only review log |
| Authority | **Server computes all due dates.** Clients submit ratings only |
| Sync | reconciles offline queues; server state wins for scheduling |
| Card targets | reference Knowledge entities by id |

**Does not own:** card content rendering, XP for reviews (delegates to Gamification).

---

## 7. Progress

**Owns:** mastery state per learner per entity.

| Responsibility | Detail |
|---|---|
| Granularity | overall, lesson, vocabulary, kanji, grammar |
| Inputs | lesson submissions, test results, SRS reviews |
| Outputs | readiness, personalization signals, dashboards |
| Writes | only via its service, triggered by domain events |

---

## 8. Gamification

**Owns:** XP, streaks, achievements, daily goals.

| Responsibility | Detail |
|---|---|
| XP | single award table (`xp_events`) with typed sources |
| Idempotency | one event per action; replays must not double-award |
| Streaks | day boundaries computed server-side in the learner's timezone |
| Achievements | evaluated from recorded events, not ad hoc counters |

**Does not own:** progress percentages or scheduling.

---

## 9. AI

**Owns:** tutoring, explanation, correction, conversation, personalization prompts.

| Responsibility | Detail |
|---|---|
| Grounding | must retrieve from Knowledge before generating |
| Tool-calling | dictionary lookups resolve in-process through Knowledge |
| Persona | Hana-sensei: JLPT-aware, `<ruby>` furigana, explain-why, concise |
| Safety | learner text is data, never instructions |
| Providers | abstracted; deterministic mock when unconfigured |
| Cost | cached explanations, rate limits |

**Hard rule:** AI **may not** write knowledge, progress, SRS, or XP tables. It may only read and produce text.

---

## 10. Identity

**Owns:** who the user is and what they may do.

| Responsibility | Detail |
|---|---|
| Credentials | stored in A's PostgreSQL |
| Sessions | cookie (web) and Bearer + refresh (Flutter) resolving to one subject id |
| RBAC | learner, reviewer, content_editor, admin, super_admin |
| Enforcement | middleware + per-route guards; inbound identity headers never trusted |

**Every other domain treats `learnerId` as a foreign key owned here.**

---

## 11. Admin

**Owns:** editorial workflow and operations.

| Responsibility | Detail |
|---|---|
| Content management | create/edit/publish knowledge and questions |
| Review | editorial states and approvals |
| ETL control | trigger runs, stream logs, view history |
| Audit | append-only log of privileged actions |
| Analytics | platform-level reporting |

**Writes knowledge through the Knowledge service**, not by direct SQL, so validation and provenance always apply.

---

## 12. Ingestion (ETL)

**Owns:** getting licensed external data in, correctly and repeatably.

| Responsibility | Detail |
|---|---|
| Sources | registry with license, URL, version, checksum |
| Integrity | SHA-256 verification before parse |
| Pipeline | source → raw → parse → normalize → match → enrich → validate → provenance → load |
| Idempotency | upsert by `(source, source_id)` with checksum skip |
| Enrichment | JLPT, frequency, furigana (precomputed offline), radicals, strokes, pitch |
| Reporting | per-run counts, errors, timings |

**Never serves HTTP.** Admin triggers it; ETL does not call domain APIs.

---

## 13. Clients

| Client | Owns | Must not own |
|---|---|---|
| Web (Next.js) | rendering, routing, interaction, accessibility | grading, scheduling, scoring, authorization |
| Flutter | rendering, offline cache, outbox queue | any business rule duplicated from the server |

Both consume the same `/api/v2` contracts.

---

## 14. Cross-domain event flow (frozen)

```
Lesson submitted      → Learning → Progress → Gamification (XP)
                                  └→ SRS (seed cards)
SRS review rated      → SRS      → Progress → Gamification (XP, streak)
Test completed        → Assessment → Progress → Gamification
Knowledge imported    → ETL      → Knowledge → Search (indexes)
Tutor question asked  → AI reads Knowledge (+ Progress for personalization)
```

Rules: events flow **forward**; no cycles; each arrow crosses a service boundary, never a table boundary.

---

## 15. Anti-duplication register

Exactly one implementation of each, forever:

| Capability | Single owner |
|---|---|
| Dictionary lookup | Knowledge |
| Search ranking | Search |
| Question grading | `QuizEngine` |
| Review scheduling | SRS `algorithm.ts` |
| XP awarding | Gamification |
| Identity resolution | Identity |
| Data ingestion | ETL |
| LLM invocation | `llm-provider.ts` |

Adding a second implementation of any row is a **gate failure**.
