# PHASE 00 — Capability Map (Repo B → Repo A)

**Date:** 2026-03-25  
Maps product capabilities to where they live today and the approved integration path.

Status keys: **ABSENT** (local) · **PRESENT-A** (GitHub A) · **PRESENT-B** · **PARTIAL**

---

| # | Capability | Local | GitHub A | Repo B | Approved path | Phase |
|---|---|---|---|---|---|---|
| 1 | Japanese dictionary | ABSENT | PRESENT-A service+tables | PRESENT-B schema+API+UI | KEEP A model; MERGE B parser/UI later | 01 schema, 02 ETL, 03 search |
| 2 | Kanji knowledge | ABSENT | PRESENT-A | PRESENT-B | KEEP A; MERGE radical-by-query from B API | 01–03 |
| 3 | Kanji components/radicals | ABSENT | PRESENT-A tables | PRESENT-B arrays | KEEP A normalized links | 01–02 |
| 4 | Grammar knowledge | ABSENT | PRESENT-A | PRESENT-B | KEEP A; MERGE B examples JSON if needed | 01–03 |
| 5 | Example sentences | ABSENT | PRESENT-A | PRESENT-B Tatoeba ETL | KEEP A tables; MERGE B Tatoeba parser | 02 |
| 6 | Conjugations | ABSENT | PRESENT-A `etl/enrichment/conjugations.ts` | PARTIAL | KEEP A enrichment | 02 |
| 7 | JLPT N5–N1 | ABSENT | PRESENT-A jlpt-engine + smallint | PRESENT-B enum + questions | KEEP A; confirm level ordinal | 04 |
| 8 | Courses | ABSENT | PRESENT-A tables+engine | ABSENT in knowledge | KEEP A | 04 |
| 9 | Lessons | ABSENT | PRESENT-A | ABSENT | KEEP A | 04 |
| 10 | Exercises | ABSENT | PRESENT-A enums/items | PRESENT-B question gens | KEEP A; MERGE generators | 04 |
| 11 | Quiz engine | ABSENT | PRESENT-A | PRESENT-B gens | KEEP A engine | 04 |
| 12 | Timed JLPT tests | ABSENT | PRESENT-A test-engine | PRESENT-B session API+UI+Flutter | KEEP A; MERGE B session UX later | 04 |
| 13 | SRS | ABSENT | PRESENT-A | PRESENT-B SM-2 | KEEP A only | 05 |
| 14 | Learning progress | ABSENT | PRESENT-A | PRESENT-B user_progress | KEEP A; bind to identity | 04 after auth |
| 15 | XP/streaks/achievements | ABSENT | PRESENT-A | PARTIAL (xp on users) | KEEP A | 07 |
| 16 | AI Japanese tutor | ABSENT | PRESENT-A services+routes | PRESENT-B chat route | KEEP A; MERGE B tool-calling | 06 |
| 17 | Grammar explanation | ABSENT | PRESENT-A | PRESENT-B | KEEP A | 06 |
| 18 | Sentence correction | ABSENT | PARTIAL (AI services) | PARTIAL | Design in AI phase using knowledge | 06 |
| 19 | Conversation practice | ABSENT | PARTIAL tutor-chat | PRESENT-B tutor | KEEP A tutor | 06 |
| 20 | Personalized learning | ABSENT | PARTIAL progress | PARTIAL dashboard | After identity + progress | 04–06 |
| 21 | Multilingual UI | ABSENT | ABSENT | study_languages en/ta/ml/hi | Later; glosses already JSON on A | post-07 |
| 22 | Admin CMS | ABSENT | ABSENT | PRESENT-B | MERGE admin schema/UI later | admin phase |
| 23 | ETL control | ABSENT | PRESENT-A TS framework (stub parsers) | PRESENT-B Python + admin ETL UI | KEEP A runtime; MERGE parsers | 02 |
| 24 | Search | ABSENT | PRESENT-A pg_trgm service | PRESENT-B Meili | KEEP A pg_trgm; DEPRECATE Meili v1 | 03 |
| 25 | Analytics | ABSENT | PARTIAL test results | PRESENT-B test analytics route | Later | 04+ |
| 26 | Flutter client | ABSENT | sync API sketched | PRESENT-B app | KEEP mobile package as client | 08 |
| 27 | Subscriptions | ABSENT | ABSENT | AI tier in JWT | Monetization last | later |

---

## Dependency gates (do not skip)

```
AUDIT (this phase)
 → ARCHITECTURE/FOUNDATION (reconcile local ↔ GitHub A schema)
 → AUTH (identity table + one provider)
 → DATABASE applied (drizzle push, additive)
 → ETL parsers (from B Python → A TS)
 → KNOWLEDGE data
 → SEARCH (pg_trgm)
 → DICTIONARY/KANJI/GRAMMAR UI
 → LEARNING/QUIZ/JLPT
 → SRS
 → GAMIFICATION
 → AI (must retrieve from knowledge)
 → ADMIN
 → MOBILE
 → MONETIZATION
```

Knowledge-first: AI must not be finalized before dictionary/kanji/grammar data exist.

---

## What Phase 00 does **not** do

- No schema push
- No ETL run
- No B copy
- No auth implementation
- No UI product build beyond existing starter
