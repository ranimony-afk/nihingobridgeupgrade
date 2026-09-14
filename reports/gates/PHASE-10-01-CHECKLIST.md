# PHASE 10.1 — Generic question engine

Status: **COMPLETE** (additive schema · backfill · single grading authority ·
API · tests · build · gate)

## The architectural decision

Phase 09.4 already shipped a lesson exercise engine. Creating a second model for
quiz/JLPT would have produced **competing learning engines**, which the project
rules forbid. Rather than adding one, 10.1 **generalises** the existing engine:

* `questions` + `question_options` become the canonical, source-agnostic bank.
* All 153 lesson exercises are **backfilled** into the bank and linked through
  `exercises.question_id` — a placement, not a duplicate.
* `gradeOne()` in `src/services/questions/engine.ts` is the single grading
  decision. `exercise-engine.ts` now imports it and re-exports
  `normalizeAnswer`; its local copy of the algorithm was deleted.

The gate enforces this: **153/153 exercises link to the bank**, and lesson
grading is verified to still work *through the shared core*.

## Bank contents

| Origin | Skill | Count |
| --- | --- | ---: |
| generated | kanji | 926 |
| generated | vocabulary | 480 |
| generated | grammar | 54 |
| lesson_exercise | mixed | 153 |
| **total** | | **1,613** (4,440 options) |

Levels N5 388 · N4 449 · N3 56 · N2 360 · N1 360. N3 is thin because KANJIDIC2's
legacy JLPT field has no N3 — a pre-existing, documented gap, not a new defect.

## Implementation evidence

| Area | File |
| --- | --- |
| Schema | `src/db/schema.ts` — `questions`, `questionOptions`, `exercises.questionId` |
| Shared generation | `etl/lib/question-utils.mjs` — `normalizeAnswer`, `stableShuffle`, `pickDistractors`, `buildOptions` |
| ETL | `etl/run-question-bank.mjs` — backfill + level-tagged generation, idempotent on `source_key` |
| Contracts | `src/types/question.ts` — `QuestionPublic` has no correctness field by design |
| Repository | `src/repositories/question.ts` — public query vs `getQuestionSecrets` (server-only), seeded sampling |
| Engine | `src/services/questions/engine.ts` — `gradeOne`, `gradeQuestions`, `scoreGrades`, `getQuestions` |
| Delegation | `src/services/learning/exercise-engine.ts` — imports `gradeOne`, no second algorithm |
| API | `/api/questions`, `/api/questions/check`, `/api/questions/stats` |
| Ops/docs | `scripts/provision.sh`, `etl/README.md`, `docs/learning/question-engine.md` |

## Deployment gate

```bash
node tests/question-engine-gate.mjs http://127.0.0.1:3000   # GATE PASSED (40 checks)
```

Verified:

* **bank integrity** — exactly one correct option, no duplicate labels, ≥4
  options, text questions have accepted answers, every question has a prompt,
  every question anchors to canonical knowledge, all FKs resolve;
* **no competing model** — 153/153 exercises link to a bank question;
* **answer-key secrecy** — no `isCorrect` / `acceptedAnswers` / `explanation` in
  the payload; options expose only `id,label,position,subLabel`;
* **filtering** — skill, JLPT level, kind; invalid level → 400;
* **deterministic sampling** — same seed → identical set, different seed →
  different set (required for reproducible quizzes and JLPT tests);
* **grading** — option and text modes, points, revealed explanation/correct
  option after grading, **katakana input normalised** (カ accepted for か);
* **anti-cheat** — client-supplied `score`/`percent` ignored → 0%;
* **integration** — lesson exercises still served and still graded correctly
  through the shared core, and resolve to a bank question.

## Operational finding (fixed)

The regression suite caught the search gate failing after this phase's schema
push: **`drizzle-kit push` drops the GIN / `pg_trgm` / expression indexes**
defined in `scripts/search-indexes.sql`, because those index types cannot be
expressed in Drizzle's schema DSL. Search still returned results but fell back
to sequential scans.

Fix: re-apply `scripts/search-indexes.sql` after every push. `provision.sh` and
`run-search-index.mjs` already order it correctly; the hazard is now documented
in `docs/api/search-api.md` and `docs/DEPLOYMENT.md`, and
`tests/search-gate.mjs` serves as the canary.

## Regression

09.5 progress, 09.4 exercises, 09.3 player, 09.2 lessons, 09.1 courses,
08.1/08.2 search, 07.1–07.4 grammar, 06.4 Kanji Mind Tree.

## Next

10.2 quiz runs and 10.3 timed JLPT tests consume `GET /api/questions` with a
seed and grade through `POST /api/questions/check` — no new engine required.
