# PHASE 09.1 — Course architecture

Status: **COMPLETE** (additive schema · ETL · service · API · UI · search
integration · tests · build · deployment gate)

## Scope

Established one canonical hierarchy:

```text
course → ordered modules → ordered lessons → canonical grammar/kanji knowledge
       ↘ tags
       ↘ prerequisite course DAG
```

Enrollment, user progress, exercises, quizzes, SRS, XP and subscriptions are
intentionally deferred. Those features will reference these stable ids.

## Implementation evidence

| Area | File / symbol | Evidence |
| --- | --- | --- |
| Schema | `src/db/schema.ts` | added `courseModules`, nullable `lessons.moduleId`, `coursePrerequisites`, `courseTags`, `courseTagLinks`, `lessonGrammarPoints`, `lessonKanji` |
| Contracts | `src/types/content.ts` | `CourseModule`, `CoursePrerequisite`, `LessonKnowledge`, `CourseDetail`, `LessonOutlineDetail`; flat `lessons` retained for compatibility |
| Repository | `src/repositories/content.ts` | `getCourseBySlug` assembles modules/prerequisites/tags; `getLessonBySlug` assembles module context and grammar/kanji links |
| Service | `src/services/knowledge/content.ts` | one safe service boundary for pages and APIs |
| API | `src/app/api/courses/route.ts` | published catalogue, optional JLPT/difficulty filter |
| API | `src/app/api/courses/[slug]/route.ts` | canonical nested outline |
| API | `src/app/api/lessons/[slug]/route.ts` | lesson/module/course context + knowledge |
| UI | `src/app/courses/page.tsx` | public catalogue |
| UI | `src/app/courses/[slug]/page.tsx` | tags, prerequisite notice, module-grouped outline (`data-testid=course-outline`) |
| UI | `src/app/lessons/[slug]/page.tsx` | objectives, module context, previous/next, linked grammar/kanji (`data-testid=lesson-knowledge`) |
| Seed | `etl/data/course-architecture.json` | 5 courses, 10 modules, 20 assignments, 3 prerequisite edges, tags, 41 grammar links, 69 kanji links; CC BY-SA 4.0 |
| ETL | `etl/run-course-architecture.mjs` | validates every source reference, rejects duplicate lesson assignments/self-prerequisites, idempotent upserts |
| Search | `etl/run-search-index.mjs` | lesson projection now includes module titles and explicit grammar/kanji knowledge |
| Ops | `scripts/provision.sh` | dependency order includes architecture before search |
| Docs | `docs/learning/course-architecture.md`, `docs/PROVENANCE.md`, `etl/README.md` | ownership, invariants, APIs, provenance and exact commands |

## Loaded architecture

| Entity | Count |
| --- | ---: |
| published courses | 5 |
| published modules | 10 |
| published lessons | 20 |
| lessons assigned to modules | 20/20 |
| prerequisite edges | 3 |
| course/tag edges | 17 |
| lesson/grammar edges | 41 |
| lesson/kanji edges | 69 |

Prerequisite graph: `Japanese Foundations → N4 Grammar → N3 Grammar`, plus a
recommended Foundations prerequisite for Practical Conversation. The gate uses a
recursive CTE to prove the graph is acyclic.

## Deployment gate

```bash
npx next typegen
npm exec tsc -- --noEmit --pretty false
npx -- tsc -p tsconfig.etl.json --noEmit
npm run lint
npm run build
build_and_start
node tests/course-architecture-gate.mjs http://127.0.0.1:3000
```

The course gate verifies:

* every published course/module/lesson exists and every lesson has a module;
* lesson/module course ownership is consistent;
* no orphan knowledge links or self-prerequisites;
* prerequisite graph is acyclic;
* architecture provenance exists;
* catalogue filtering and 404 contracts;
* nested modules plus flat compatibility lessons;
* prerequisites/tags exposed;
* lesson module context and grammar/kanji links;
* catalogue/course/lesson pages render and links resolve;
* course and lesson remain discoverable through unified PostgreSQL search.

## Defect found and fixed

`GET /api/courses` initially returned an empty list because `Number(null)` is
`0`, causing an absent `jlpt` parameter to behave like `jlpt=0`. Query parsing now
keeps absence as `null`; the unfiltered catalogue returns all five courses.

## Regression gates

* 08.2 unified search
* 08.1 PostgreSQL search
* 07.4 grammar detail
* 07.3 grammar explorer
* 07.2 grammar API
* 07.1 grammar service
* 06.4 Kanji Mind Tree

All are run after the 09.1 gate and must remain green.
