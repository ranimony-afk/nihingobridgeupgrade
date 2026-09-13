# Generic question engine

Phase 10.1 establishes **one** question bank and **one** grading authority for
the whole platform. Lessons, quizzes and JLPT tests are consumers, not separate
engines.

## Why this exists

Phase 09.4 shipped a lesson-scoped exercise engine. Adding a second model for
quiz/JLPT would have created competing learning engines, which the project rules
forbid. Instead 10.1 generalises the existing work:

```text
                    questions  (canonical bank)
                        ▲
        ┌───────────────┼────────────────┐
   exercises        quiz runs        JLPT tests
 (lesson placement)   (10.2)           (10.3)
```

* `exercises.question_id` links every lesson placement to its bank question.
* All 153 lesson exercises were **backfilled** into the bank, not duplicated.
* `gradeOne()` in `src/services/questions/engine.ts` is the single grading
  decision; `exercise-engine.ts` imports it instead of re-implementing it.

## Model

| Table | Purpose |
| --- | --- |
| `questions` | source-agnostic bank: skill, kind, answer mode, prompt, JLPT level, difficulty, points, `accepted_answers`, knowledge FKs, `source_key` |
| `question_options` | choices; exactly one `is_correct` per question |
| `exercises.question_id` | lesson placement → bank question |

`source_key` makes generation idempotent (`kanji-reading:語`,
`grammar-meaning:tara`, `lesson:<slug>:<key>`).

## Bank contents

| Origin | Skill | Count |
| --- | --- | ---: |
| generated | kanji | 926 |
| generated | vocabulary | 480 |
| generated | grammar | 54 |
| lesson_exercise | grammar / kanji / vocabulary | 153 |
| **total** | | **1,613** |

Levels: N5 388 · N4 449 · N3 56 · N2 360 · N1 360. (N3 is thin because
KANJIDIC2's legacy JLPT field has no N3 — a known gap recorded in phase 06.4.)

Every question anchors to canonical knowledge (grammar point, kanji, vocabulary
or sentence); the gate rejects unanchored questions.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/questions` | sample the bank: `skills`, `kinds`, `jlpt`, `limit`, `seed` |
| `POST /api/questions/check` | grade answers and return a score |
| `GET /api/questions/stats` | coverage by skill, level and origin |

**Deterministic sampling.** Passing `seed` orders by `md5(id || seed)`, so a
quiz or JLPT test can be reproduced exactly; omitting it samples randomly.

## Answer-key secrecy

`GET /api/questions` returns no `isCorrect`, `acceptedAnswers`,
`correctOptionId` or `explanation`. Correctness exists only behind
`POST /api/questions/check`. The gate asserts none of those strings appear in
the payload, and that a client-supplied `score`/`percent` is ignored.

Typed answers are normalised identically in `etl/lib/question-utils.mjs` and
`src/services/questions/engine.ts` (NFKC → katakana-to-hiragana → strip
punctuation), so カ and か both grade correct.

## Commands

```bash
node etl/run-question-bank.mjs                       # build/refresh the bank
node tests/question-engine-gate.mjs $BASE_URL        # 40-check gate
```
