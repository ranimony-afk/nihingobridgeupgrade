# FEATURE MATRIX

**Prompt:** 00.1  
Product capabilities vs evidence. Status: ABSENT / CODE / STUB / FIXTURE / UNVERIFIED.

CODE = implementation inspected (queries or real parser), not merely a filename.

---

| # | Feature | A-local | A-github | B | Integration class |
|---|---|---|---|---|---|
| 1 | Japanese dictionary | ABSENT | CODE (`DictionaryService` + tables + search route) | CODE (schema + API + UI) | KEEP A; ADAPT B UI/parser |
| 2 | Kanji system | ABSENT | CODE | CODE | KEEP A |
| 3 | Kanji components/radicals | ABSENT | CODE (`kanji_components` + links) | CODE (text arrays on kanji) | KEEP A normalized |
| 4 | Grammar | ABSENT | CODE | CODE | KEEP A |
| 5 | Example sentences | ABSENT | CODE (tables) | CODE + Tatoeba parser | KEEP A tables; INTEGRATE B parser |
| 6 | Conjugations | ABSENT | CODE `etl/enrichment/conjugations.ts` imported by dictionary | PARTIAL enrichers | KEEP A |
| 7 | JLPT N5–N1 | ABSENT | CODE jlpt-engine + smallint | CODE enum + questions | KEEP A; mapping UNVERIFIED |
| 8 | Courses | ABSENT | CODE tables+engine | ABSENT in knowledge | KEEP A |
| 9 | Lessons | ABSENT | CODE | ABSENT | KEEP A |
| 10 | Exercises | ABSENT | CODE quiz types | CODE generators | KEEP A engine; INTEGRATE B gens |
| 11 | Quiz engine | ABSENT | CODE pure `quiz-engine.ts` (no db) | CODE generators + quizzes on kanji/grammar routes | KEEP A |
| 12 | Timed JLPT tests | ABSENT | CODE test-engine | CODE session API + UI + Flutter | KEEP A; ADAPT B session UX |
| 13 | SRS | ABSENT | CODE FSRS-5 + 4 tables | CODE SM-2 + 3 tables | KEEP A; do not run two engines |
| 14 | Progress | ABSENT | CODE | CODE `user_progress` | KEEP A; needs identity |
| 15 | XP/streaks/achievements | ABSENT | CODE tables+services | PARTIAL fields on `users` | KEEP A |
| 16 | AI tutor | ABSENT | CODE routes + mock LLM if no key | CODE chat + dictionary tool | KEEP A; INTEGRATE tool pattern |
| 17 | Grammar explanation | ABSENT | CODE route | CODE route | KEEP A |
| 18 | Sentence correction | ABSENT | UNVERIFIED (AI services exist; no dedicated correction test) | UNVERIFIED | later |
| 19 | Conversation practice | ABSENT | CODE tutor-chat | CODE tutor chat | KEEP A |
| 20 | Personalization | ABSENT | PARTIAL progress | PARTIAL dashboard | after auth |
| 21 | Multilingual UI | ABSENT | ABSENT | `study_languages` en/ta/ml/hi on users | later |
| 22 | Admin CMS | ABSENT | ABSENT | CODE pages + demo auth | ADAPT later |
| 23 | ETL control | ABSENT | STUB parsers; registry CODE | CODE Python + admin ETL UI | INTEGRATE parsers; KEEP A registry |
| 24 | Search | ABSENT | CODE SQL similarity (extension UNVERIFIED) | CODE Meili + SQL fallback | KEEP SQL; DEPRECATE Meili |
| 25 | Analytics | ABSENT | PARTIAL test_results | CODE analytics route | later |
| 26 | Flutter | ABSENT | sync route only | CODE app; missing `/api/mobile/*` | ADAPT Phase 08 |
| 27 | Subscriptions | ABSENT | ABSENT | `tier` in AI JWT | later |

---

## Data loading reality

| Pipeline | A-github | B | Result |
|---|---|---|---|
| JMdict | STUB yields 0 records (`etl/pipelines/jmdict.ts`) | CODE lxml parser + tests | INTEGRATE B → REWRITE A parser |
| KANJIDIC2 | `planned` in registry | not found as dedicated parser file | UNVERIFIED on B |
| Tatoeba | `planned` | CODE stager + pipeline + tests | INTEGRATE |
| N5 seed | none | FIXTURE 5 words | IGNORE as production data |
| TTS | route exists | edge-tts + minio | UNVERIFIED license/provider |

Until A parser is rewritten, dictionary **CODE** cannot populate from JMdict.

---

## Auth / identity

| | A | B |
|---|---|---|
| Login | ABSENT | Supabase JWT (external) |
| Users table | ABSENT | `users` profile only |
| RBAC | ABSENT | admin roles + demo super_admin |
| Mobile tokens | ABSENT | `auth_token_store.dart` |

Class: REWRITE A auth. DEPRECATE B JWT as system.
