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

## Lesson internals (phase 09.2)

A lesson is not a text blob. It is an ordered sequence of sections, each holding
ordered blocks:

```text
lesson
  ├─ prerequisite lessons (acyclic)
  └─ ordered sections (concept → grammar → kanji → examples → summary)
       └─ ordered blocks
            ├─ authored prose: text | objective | tip | warning | checkpoint
            └─ knowledge refs: grammar_ref | kanji_ref | vocabulary_ref | sentence_ref
```

| Table | Ownership |
| --- | --- |
| `lesson_sections` | teaching stage, unique `key` and `position` per lesson |
| `lesson_blocks` | ordered content unit; either prose or one canonical reference |
| `lesson_prerequisites` | lesson-level acyclic sequencing graph |

Reference blocks store only a foreign key (`grammar_point_id`, `kanji_id`,
`vocabulary_id`, `sentence_id`). Titles, readings, meanings and translations are
resolved at query time from the canonical tables, so lesson content can never
contradict the knowledge base.

Block generation is deliberately split:

* **authored** — intro, key points, tip, checkpoint and summary prose live in
  `etl/data/lesson-architecture.json`;
* **derived** — grammar and kanji blocks come from the 09.1 links, example
  sentences come from `sentence_grammar_points`, and vocabulary comes from
  `kanji_vocabulary` filtered by JMdict priority.

## Lesson player (phase 09.3)

`/lessons/[slug]/play` steps a learner through the canonical sections one at a
time. The player is a client island over the server-rendered payload:

* every step, title and block is present in the initial HTML (SSR + `<noscript>`
  fallback), so crawlers and no-JS clients still get the full lesson;
* knowledge blocks keep their canonical routes — the player never re-renders a
  fact it owns;
* navigation: step chips, previous/next, and keyboard `←` `→` `Enter`;
* completion is tracked per section with a progress bar and a finish state that
  links to the next lesson.

**Progress storage is deliberately client-side** (`localStorage`, key
`nb.player.v1.<lesson-slug>`). Server-side, user-owned progress requires
authentication and is deferred; the versioned key makes that migration explicit.

## Exercise engine (phase 09.4)

Every published lesson gets a generated, server-graded exercise set at
`/lessons/[slug]/practice`.

| Table | Purpose |
| --- | --- |
| `exercises` | prompt, kind, answer mode, points, canonical knowledge FK |
| `exercise_options` | answer choices; exactly one `is_correct` per exercise |

Exercises are **derived from canonical knowledge**, not authored per question:

| Kind | Source | Distractors |
| --- | --- | --- |
| `multiple_choice` | `lesson_grammar_points` | other grammar titles, same JLPT level |
| `cloze` | `sentence_grammar_points` (real corpus sentence, matched span blanked) | other grammar match texts |
| `reading` (typed) | `kanji_readings` for the lesson's kanji | n/a — accepted-answer list |
| `meaning` | `kanji_vocabulary` (JMdict priority 1) | first meanings of other words |

### Answer-key secrecy

`GET /api/lessons/[slug]/exercises` returns **no** `isCorrect`,
`acceptedAnswers`, `correctOptionId` or `explanation`. Correctness is computed
only by `POST /api/exercises/check` and
`POST /api/lessons/[slug]/exercises/submit`. The gate asserts the key is absent
from both the API payload and the rendered HTML.

Typed answers are normalised identically in the ETL and the service
(`normalizeAnswer`): NFKC, katakana→hiragana, punctuation and spacing stripped —
so a learner may answer ゴ or ご.

**Attempts are not persisted.** Scoring is returned to the caller but no
per-user history is stored, because that requires authentication.

## Progress tracking (phase 09.5)

Progress needs an owner, and no authentication existed. Rather than inventing a
throwaway store, 09.5 introduces **the canonical `users` table** with anonymous
device identities. A future auth phase must attach credentials to *this* table
and flip `is_anonymous` — it must not create a second user model.

| Table | Purpose |
| --- | --- |
| `users` | canonical identity; `public_id` carried in a signed cookie |
| `user_lesson_progress` | status, completed section keys, best score, attempts |
| `user_exercise_attempts` | append-only audit log behind every score |
| `user_course_progress` | derived rollup, recomputed on every lesson change |

**Session:** signed HMAC cookie `nb_learner` (HttpOnly, SameSite=Lax, Secure in
production), secret from `LEARNER_SESSION_SECRET`.

**Anti-cheat:** the client posts *answers*, never a score.
`/exercises/submit` re-grades server-side and stores only the server's result;
extra `score`/`percent` fields in the request body are ignored. The gate proves
this by submitting wrong answers alongside `percent: 100` and asserting 0%.

The end-to-end chain **course → lesson → exercise → answer → score → progress**
is covered by `tests/progress-gate.mjs` using a real cookie jar.

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
9. Section `position` is unique and strictly increasing within a lesson.
10. Block `position` is contiguous from 0 within a section.
11. A block's section must belong to the block's lesson.
12. A `*_ref` block must carry exactly one canonical foreign key; a prose block
    must carry a non-empty body.
13. Lesson prerequisites must stay acyclic.

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
node etl/run-lesson-architecture.mjs
node etl/run-exercise-engine.mjs
node etl/run-search-index.mjs
node tests/course-architecture-gate.mjs https://your-domain.example
node tests/lesson-architecture-gate.mjs https://your-domain.example
node tests/lesson-player-gate.mjs https://your-domain.example
node tests/exercise-engine-gate.mjs https://your-domain.example
node tests/progress-gate.mjs https://your-domain.example
```

Or use `BASE_URL=https://your-domain.example ./scripts/provision.sh`.
