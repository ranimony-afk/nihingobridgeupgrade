# Course architecture

Phase 09.1 establishes one canonical learning catalogue. It deliberately does
**not** implement enrollment, progress, exercises, quizzes, SRS, XP, or payment
state; those later domains attach to these stable course/module/lesson ids.

## Hierarchy

```text
course
  ├─ tags
  ├─ prerequisite courses (directed acyclic graph)
  └─ ordered modules
       └─ ordered lessons
            ├─ objectives
            ├─ grammar point links
            └─ kanji links
```

Canonical tables:

| Table | Ownership |
| --- | --- |
| `courses` | public catalogue metadata, level, difficulty, publication state |
| `course_modules` | ordered structural sections inside one course |
| `lessons` | one course and one optional module; stable global slug |
| `course_prerequisites` | directed course → prerequisite edge, required/recommended |
| `course_tags`, `course_tag_links` | discovery/classification |
| `lesson_grammar_points` | explicit lesson → canonical grammar link |
| `lesson_kanji` | explicit lesson → canonical kanji link |

`lessons.module_id` is nullable for additive migration safety, but the production
architecture gate requires every **published** lesson to have a module.

## Invariants

1. A module belongs to exactly one course.
2. A lesson's course must equal its module's course.
3. Module position is unique within a course.
4. Lesson position is unique within a course (kept for flat/mobile ordering).
5. Course prerequisites cannot point to the same course and must remain acyclic.
6. Published course outlines contain at least one published module and lesson.
7. Knowledge links reference the canonical grammar/kanji tables; no copied facts.
8. `CourseDetail.modules[].lessons` is canonical; `CourseDetail.lessons` remains a
   flat compatibility projection for existing clients.

## Service and API

`src/services/knowledge/content.ts` is the service boundary. Both pages and HTTP
routes consume it.

| Route | Contract |
| --- | --- |
| `GET /api/courses` | published summaries; optional `jlpt`, `difficulty` |
| `GET /api/courses/[slug]` | metadata, tags, prerequisites, modules with lessons, flat lessons |
| `GET /api/lessons/[slug]` | lesson, course/module context, objectives, previous/next, grammar/kanji knowledge |
| `/courses`, `/courses/[slug]`, `/lessons/[slug]` | server-rendered web surfaces |

Unified search continues to index `course` and `lesson`. Lesson documents now
include module titles and linked grammar/kanji so a learner can discover a lesson
through its actual teaching content.

## Seed and provenance

* `etl/data/learning-catalog.json`: course/lesson copy (CC BY-SA 4.0).
* `etl/data/course-architecture.json`: modules, prerequisites, tags and explicit
  knowledge mappings (CC BY-SA 4.0).
* `etl/run-content-pipeline.mjs`: loads courses/lessons.
* `etl/run-course-architecture.mjs`: validates every referenced slug/literal and
  loads graph edges idempotently.

## Provisioning

```bash
npx drizzle-kit push --config drizzle.config.json
node etl/run-pipeline.mjs
node etl/run-grammar-pipeline.mjs
node etl/run-content-pipeline.mjs
node etl/run-course-architecture.mjs
node etl/run-search-index.mjs
node tests/course-architecture-gate.mjs https://your-domain.example
```

Or use `BASE_URL=https://your-domain.example ./scripts/provision.sh`.
