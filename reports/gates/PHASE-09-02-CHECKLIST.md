# PHASE 09.2 — Lesson architecture

Status: **COMPLETE** (additive schema · ETL · service · API · UI · tests ·
build · deployment gate)

Depends on 09.1 (course → modules → lessons). 09.2 defines what a lesson *is*
internally. Exercises, quizzes, SRS, grading and user progress stay deferred.

## Model

```text
lesson
  ├─ prerequisite lessons (acyclic)
  └─ ordered sections: concept → grammar → kanji → examples → summary
       └─ ordered blocks
            ├─ prose:     text | objective | tip | warning | checkpoint
            └─ knowledge: grammar_ref | kanji_ref | vocabulary_ref | sentence_ref
```

| Table | Purpose |
| --- | --- |
| `lesson_sections` | teaching stage; unique `key` and `position` per lesson |
| `lesson_blocks` | ordered unit; prose **or** exactly one canonical FK |
| `lesson_prerequisites` | lesson-level sequencing DAG |

A reference block stores only a foreign key. Titles, readings, meanings and
translations are resolved at query time, so lesson content cannot drift from the
knowledge base.

## Authored vs derived

| Part | Origin |
| --- | --- |
| intro, key points, tip, checkpoint, summary | `etl/data/lesson-architecture.json` (CC BY-SA 4.0) |
| grammar + kanji blocks | 09.1 `lesson_grammar_points` / `lesson_kanji` |
| example sentences | `sentence_grammar_points` for the lesson's grammar |
| vocabulary | `kanji_vocabulary` for the lesson's kanji, JMdict priority ordered |

## Loaded content

| Entity | Count |
| --- | ---: |
| lesson sections | 94 (5 per lesson) |
| content blocks | 439 (~22 per lesson) |
| grammar refs | 41 |
| kanji refs | 69 |
| vocabulary refs | 120 |
| sentence refs | 68 |
| prose blocks (text/objective/tip/checkpoint) | 141 |
| lesson prerequisites | 15 |

## Implementation evidence

| Area | File | Evidence |
| --- | --- | --- |
| Schema | `src/db/schema.ts` | `lessonSections`, `lessonBlocks`, `lessonPrerequisites` with uniqueness on `(lesson,key)`, `(lesson,position)`, `(section,position)` |
| Contracts | `src/types/content.ts` | `LessonSection`, `LessonBlock`, `LessonBlockReference`, `LessonPrerequisite`, extended `LessonOutlineDetail` |
| Repository | `src/repositories/content.ts` | single query resolves blocks + grammar/kanji/vocabulary/sentence display data; `mapBlockReference` builds canonical routes |
| ETL | `etl/run-lesson-architecture.mjs` | validates lesson slugs, emits knowledge sections only when knowledge exists, idempotent upserts, sequential prerequisites |
| Seed | `etl/data/lesson-architecture.json` | authored prose for all 20 lessons |
| API | `/api/lessons/[slug]` | now returns `sections`, `blockCount`, `prerequisites` |
| UI | `src/app/lessons/[slug]/page.tsx` | section navigation, per-kind block rendering, callouts, prerequisite notice |
| Ops | `scripts/provision.sh` | runs lesson architecture before search reindex; both gates wired |
| Docs | `docs/learning/course-architecture.md`, `docs/PROVENANCE.md`, `etl/README.md` | model, invariants, provenance, commands |

## Deployment gate

```bash
node tests/lesson-architecture-gate.mjs http://127.0.0.1:3000   # GATE PASSED
```

Verified: section/block counts, every published lesson structured, all eight
block kinds present, block-graph integrity (no cross-lesson blocks, no dangling
FKs, no empty refs, no empty prose), contiguous block positions, strictly
increasing section positions, acyclic lesson prerequisites, grammar blocks
provably derived from 09.1 links, provenance row, API section ordering,
`blockCount` consistency, resolved reference kinds/routes, 8/8 sampled reference
routes returning 200, and full UI rendering.

## Regression

09.1 course architecture, 08.2 unified search, 08.1 PostgreSQL search, 07.1–07.4
grammar, 06.4 Kanji Mind Tree — all re-run after this phase.
