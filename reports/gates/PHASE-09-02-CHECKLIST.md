# PHASE 09.2 — Lesson architecture

Status: **COMPLETE** (additive schema · ETL · service · API · UI · search
integration · tests · build · deployment gate)

Depends on Phase 09.1 (`course → module → lesson → knowledge`).

## Scope

Defined the internal architecture of a lesson while still deferring enrollment,
attempts, progress, scoring and SRS.

## Implementation evidence

| Area | File / symbol | Evidence |
| --- | --- | --- |
| Schema | `src/db/schema.ts` | added `lessonSections`, `lessonObjectives`, `lessonVocabulary`, `lessonSentences` |
| Seed | `etl/data/lesson-architecture.json` | authored sections for all 20 lessons (60 blocks), CC BY-SA 4.0 |
| ETL | `etl/run-course-architecture.mjs` | `loadLessonArchitecture` loads sections, backfills objectives, derives vocabulary and sentence links |
| Contracts | `src/types/content.ts` | `LessonSection`, `LessonObjective`, `LessonStructure`, extended `LessonKnowledge`, `LessonOutlineDetail` |
| Repository | `src/repositories/content.ts` | `getLessonBySlug` assembles sections, objectives, vocabulary, sentences and a structure summary |
| API | `src/app/api/lessons/[slug]/route.ts` | exposes the extended lesson contract |
| UI | `src/app/lessons/[slug]/page.tsx` | ordered sections with kind chips, vocabulary and sentence link panels |
| Search | `etl/run-search-index.mjs` | lesson documents aggregate section headings and bodies |
| Ops | `scripts/provision.sh` | lesson gate added to database and HTTP verification |
| Docs | `docs/learning/lesson-architecture.md`, `docs/PROVENANCE.md` | authoring versus derivation, provenance, commands |

## Loaded architecture

| Entity | Count |
| --- | ---: |
| authored sections | 60 |
| lessons with sections | 20/20 |
| normalised objectives | 61 |
| lessons with objectives | 20/20 |
| derived lesson/vocabulary links | 240 |
| derived lesson/sentence links | 81 |
| sentences traceable to taught grammar | 83 |
| vocabulary traceable to taught kanji | 245 |

Section positions are dense and unique from `0` within every lesson; objective
positions are unique. No dangling edges exist and every section row carries the
`lesson-architecture` source id.

## Design decisions

* **Authoring versus derivation.** Teaching copy is authored; dictionary entries
  and sentences are referenced, not copied. This keeps the knowledge graph the
  single source of truth and makes every lesson fact traceable to canonical data.
* **Normalised objectives with backfill.** `lesson_objectives` is canonical and
  rebuilt from the retained `lessons.objectives` JSONB, so existing clients see no
  breaking change while objectives become individually queryable.
* **Capped, deterministic derivation.** Vocabulary and sentence selection use
  stable ordering (JMdict priority, sentence length) with per-lesson caps, so
  re-running the loader produces identical results.
* **Searchable lesson content.** Authored section text joins the lesson search
  document, so a learner can find a lesson by what it actually teaches.

## Deployment gate

```bash
npx next typegen
npm exec tsc -- --noEmit --pretty false
npx -- tsc -p tsconfig.etl.json --noEmit
npm run lint
npm run build
build_and_start
node tests/lesson-architecture-gate.mjs http://127.0.0.1:3000
```

The gate verifies: section and objective coverage across all 20 lessons, dense
unique section positions, normalised objectives, derived-link integrity, absence
of dangling edges, provenance recording, the API contract (ordered sections,
objective agreement with the compatibility view, structure summary, 404), the
rendered page (sections, kind chips, Japanese examples, dictionary and sentence
routes, unchanged grammar/kanji links), and that authored section text is
searchable through unified PostgreSQL search.

## Defects found and fixed

| Symptom | Root cause | Fix |
| --- | --- | --- |
| `sections: 0` on first load | the seed maps a lesson slug directly to its sections array, not to `{ sections: [] }` | loader accepts the array form |
| window-function error `column "v.kanji_text" must appear in GROUP BY` | `row_number() OVER (... ORDER BY min(...), v.kanji_text)` used a non-aggregated column | `min(v.kanji_text)` |
| **provenance gap**: all 60 sections had `source_id IS NULL` | the loader read the lesson-architecture file but never upserted it into `sources`, so `sourceIds.get(...)` was `undefined` | register both sources up front, fail fast if the id is missing, and stamp `context.architectureSourceId` on every section |

The third defect was caught by the gate's provenance check, which is exactly the
class of licensing-attribution error the project treats as blocking.

## Regression gates

| Phase | Command | Result |
| --- | --- | --- |
| 09.1 course architecture | `node tests/course-architecture-gate.mjs $BASE_URL` | ✓ |
| 08.2 unified search | `node tests/unified-search-gate.mjs $BASE_URL` | ✓ |
| 08.1 PostgreSQL search | `node tests/search-gate.mjs $BASE_URL` | ✓ |
| 07.x grammar suite | `grammar-detail-gate`, `grammar-explorer-gate`, `grammar-api-gate`, `grammar-gate` | ✓ |
| 06.4 Kanji Mind Tree | `node tests/knowledge-gate.mjs $BASE_URL` | ✓ |

## Next steps

* Activity and question authoring attached to `lesson_sections` (Phase 09.3).
* Attempt and progress state referencing these stable section ids (Phase 09.4).
* Optional explicit lesson prerequisites alongside positional ordering.
