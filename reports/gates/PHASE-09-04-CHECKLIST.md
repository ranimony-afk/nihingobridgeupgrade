# PHASE 09.4 — Exercise engine

Status: **COMPLETE** (additive schema · generator · server grading · API · UI ·
tests · build · deployment gate)

Depends on 09.1–09.3. Exercises attach to the `practice` section kind that 09.2
reserved, so no structural migration was needed.

## Scope

| In scope | Deferred |
| --- | --- |
| exercise schema + generator | per-user attempt history (needs auth) |
| four exercise kinds | SRS scheduling, XP, streaks |
| server-side grading + scoring | adaptive difficulty, timed JLPT tests |
| practice UI with feedback | teacher-authored exercise CMS |

## Model

| Table | Purpose |
| --- | --- |
| `exercises` | prompt, kind, `answer_mode`, points, difficulty, canonical knowledge FK, `accepted_answers` |
| `exercise_options` | choices; exactly one `is_correct` per exercise |

## Generation — derived, not invented

| Kind | Source | Distractor source |
| --- | --- | --- |
| `multiple_choice` | `lesson_grammar_points` | grammar titles at the same JLPT level |
| `cloze` | `sentence_grammar_points` — a real corpus sentence with the matched span blanked | other grammar match texts |
| `reading` (typed) | `kanji_readings` of the lesson's kanji | n/a (accepted-answer list) |
| `meaning` | `kanji_vocabulary`, JMdict priority 1 | first meanings of sibling words |

Generated: **153 exercises / 452 options across all 20 lessons** — 39 grammar,
34 cloze, 40 typed reading, 40 vocabulary. Option order uses a deterministic
seeded shuffle so regeneration does not churn.

## Security decision: the answer key never leaves the server

`GET /api/lessons/[slug]/exercises` omits `isCorrect`, `acceptedAnswers`,
`correctOptionId` **and** `explanation`. Correctness is computed only by:

* `POST /api/exercises/check` — grade one or more answers;
* `POST /api/lessons/[slug]/exercises/submit` — grade a set and score it.

The gate asserts the key is absent from the API payload *and* the rendered HTML,
so a learner cannot read answers from the page source.

Typed answers are normalised identically in `etl/run-exercise-engine.mjs` and
`src/services/learning/exercise-engine.ts` (`normalizeAnswer`): NFKC,
katakana→hiragana, punctuation/space stripping. ゴ and ご both grade correct.

**Attempts are not persisted** — scores are returned, never stored, because
user-owned history requires authentication.

## Implementation evidence

| Area | File |
| --- | --- |
| Schema | `src/db/schema.ts` — `exercises`, `exerciseOptions` |
| Generator | `etl/run-exercise-engine.mjs` |
| Contracts | `src/types/exercise.ts` — `ExercisePublic` has no correctness field by design |
| Repository | `src/repositories/exercise.ts` — public set vs `getExerciseSecrets` (server-only) |
| Grading | `src/services/learning/exercise-engine.ts` — `gradeAnswers`, `submitLessonExercises`, `PASS_PERCENT` |
| API | `/api/lessons/[slug]/exercises`, `/api/exercises/check`, `/api/lessons/[slug]/exercises/submit` |
| UI | `src/components/learning/exercise-runner.tsx`, `src/app/lessons/[slug]/practice/page.tsx` |
| Entry points | lesson page button, player finish state |
| Ops | `scripts/provision.sh`, `etl/README.md`, `docs/learning/course-architecture.md` |

## Deployment gate

```bash
node tests/exercise-engine-gate.mjs http://127.0.0.1:3000   # GATE PASSED (44 checks)
```

Verified: exercise coverage (20/20 lessons, 4 kinds); **answer-key integrity**
(exactly one correct option, no duplicate labels, ≥4 options, text exercises have
accepted answers); all knowledge refs resolve and no exercise is unanchored;
cloze prompts contain a blank; exercises attach to a practice section;
**no key leakage** in API or HTML; correct/incorrect grading for both option and
typed modes; points awarded only when correct; explanation and correct answer
revealed *after* grading; 400 on empty/unknown submissions; 100% score on a fully
correct set with `passed: true`; 0% on an empty set; 404 for unknown lessons;
practice UI renders all 9 cards; 5/5 sampled lessons across courses have
exercises.

## Defect found and fixed

The practice-section `INSERT ... SELECT` failed with *"column source_id is of
type integer but expression is of type text"* — Postgres could not infer the
parameter type in a SELECT list. Fixed with an explicit `$1::int` cast.

## Regression

09.3 player, 09.2 lesson architecture, 09.1 course architecture, 08.1/08.2
search, 07.1–07.4 grammar, 06.4 Kanji Mind Tree.
