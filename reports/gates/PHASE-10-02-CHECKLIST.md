# PHASE 10.2 — Question bank → quiz runs

Status: **COMPLETE** (single run model · server-side sampling · shared grading ·
tests · build · gate)

## The architectural decision

10.1 delivered a source-agnostic, seeded question bank. 10.2 raises the bank
into a *runnable* contract without creating a second learning engine. A quiz and
a JLPT attempt are the **same thing** — a fixed, ordered sample of bank questions
owned by one learner — and differ only by `kind`. There is exactly one run model
(`quiz_runs` + `quiz_run_items`), one sampling path (`sampleQuestions`) and one
grading authority (`gradeOne`).

Correctness is never decided on the client: options expose no `isCorrect`, and
the answer endpoints ignore any client-supplied score/percent.

## Run model

| Concern | Implementation |
| --- | --- |
| One model for quiz + JLPT | `quiz_runs.kind = 'quiz' \| 'jlpt'` |
| Frozen item order | `quiz_run_items` unique on `(run_id, position)` |
| Reproducibility | `quiz_runs.seed`; sampling orders by `md5(id::text \|\| seed)` |
| Progressive answer reveal | `correct`/`awarded_points`/`correct_answer`/`explanation` set only on answer |
| Answer-once | `saveRunItemAnswer … WHERE answered = false` |
| Totals from items | `recomputeRunTotals` (single source of truth) |
| Expiry | `expires_at` armed for timed runs; `expireOverdueRuns` |
| Pass decision | `quiz_runs.passed`; plain quiz pass = 60% else null |

## Implementation evidence

| Area | File |
| --- | --- |
| Schema | `src/db/schema.ts` — `quiz_runs`, `quiz_run_items` |
| Contracts | `src/types/quiz.ts` — `QuizRunPublic` (no answer key), `QuizRunDetail`, `QuizRunResult` |
| Repository | `src/repositories/quiz.ts` — `createRun`, `findRun`, `saveRunItemAnswer`, `recomputeRunTotals`, `completeRunRow`, `sectionAggregates`, `skillAggregates`, `runStats` |
| Engine | `src/services/quiz/run-engine.ts` — `startRun`, `getRun`, `answerRunItem`, `finalizeRun`, `buildResult` |
| Grading delegation | grades via `gradeOne` from `src/services/questions/engine.ts` |
| API | `/api/quiz/runs`, `/api/quiz/runs/{id}`, `/api/quiz/runs/{id}/answers`, `/api/quiz/runs/{id}/complete`, `/api/quiz/stats` |
| UI | `src/components/quiz/assessment-runner.tsx`, `quiz-builder.tsx`, `src/app/quiz/*` |
| Gate | `tests/quiz-gate.mjs` |

## Deployment gate

```bash
node tests/quiz-gate.mjs http://127.0.0.1:3000
```

Verified: run model is the only assessment model in schema; sampling is
server-side and seeded (same seed → identical set); answer key is absent from
the public payload (`no isCorrect`); grading happens through the shared engine;
client-supplied `score`/`percent` are ignored; an item can only be answered once;
totals are recomputed from item rows.

## Regression

10.1 question bank (1613 questions) still `GET /api/questions`; lesson exercises
still graded through the shared core; no second grading algorithm introduced.

## Next

10.3 reuses this run model for timed JLPT blueprints; 10.5 hardens the clock.
