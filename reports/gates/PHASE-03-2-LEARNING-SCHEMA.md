# Phase 03.2 — Learning Schema

**Date:** 2026-03-25
**Gate status:** PASS

---

## Deployment gate: database integration tests pass

```
npm run test:integration  →  58 tests, 58 pass, 0 fail
```

23 are new and cover the learning domain against the real database: structure,
cascade behaviour, ordering integrity, the knowledge join, attempt recording,
and progress consistency. Every test runs inside a transaction that is rolled
back, so the suite leaves no residue and can run repeatedly.

The migration gate also still passes, including a **two-migration rollback**
(learning then knowledge) with a byte-identical schema fingerprint on re-apply.

---

## The nine tables

```
courses → units → lessons → lesson_items ──→ knowledge (dictionary/kanji/grammar/sentences)
                         └→ exercises → questions → answers
                                            ↑
identity_users ──→ attempts ────────────────┘
               └─→ progress → lessons
```

| Table | Holds |
|---|---|
| `courses` | curriculum root, JLPT level, publish status |
| `units` | ordered sections of a course |
| `lessons` | the atomic completable unit |
| `lesson_items` | ordered study content, linked to real knowledge rows |
| `exercises` | question sets with pass thresholds and time limits |
| `questions` | eight question types, difficulty, points, knowledge provenance |
| `answers` | candidate answers with `is_correct` and a normalised match form |
| `attempts` | one row per learner answer |
| `progress` | one row per learner per lesson |

---

## RISK-0013 is closed

The Phase 00 audit found the inherited schema carried `learner_id` as unbound
`text` with no users table — nothing stopped progress rows referencing accounts
that never existed.

`attempts.user_id` and `progress.user_id` are now real foreign keys to
`identity_users` with `ON DELETE CASCADE`. The migration gate asserts both
constraints exist by querying `information_schema`, and an integration test
proves an attempt attributed to a non-existent learner is rejected.

---

## Three design decisions

**Attempts are per question, not per sitting.** An exercise score is an
aggregate over attempts. Item-level history is what SRS scheduling and
per-item mastery need, and a sitting-level row could not be decomposed back
into it. A test proves repeated attempts at one question are all retained —
wrong then right — which is exactly the signal a scheduler consumes.

**Course and unit progress are not stored.** They are aggregates over lesson
progress, so they cannot drift out of step with the rows they summarise. A test
computes course completion from three lessons and asserts 47%. `course_id` is
denormalised onto `progress` so that aggregation is one indexed scan rather
than a three-table join.

**Attempts reference questions with RESTRICT, not CASCADE.** Deleting a
question that learners have already answered would silently destroy their
history. Live content is archived via `status`, not deleted. A test proves the
deletion is refused.

---

## Integrity enforced in the database

`lesson_items` is the join between curriculum and knowledge, and it carries two
check constraints that keep `kind` honest:

- exactly one reference is set (or none, for a `note`, which must then have text)
- the reference that is set is the one `kind` names

Without the second, a row could declare itself a kanji item while pointing at a
sentence, and every reader would need defensive code. Both are tested.

Other constraints with tests behind them:

| Constraint | Prevents |
|---|---|
| `progress_completed_consistency_check` | "completed" at 50% with no timestamp |
| `attempts_response_present_check` | an attempt containing no answer at all |
| `units_course_position_idx` | two units claiming the same position |
| `questions_difficulty_check`, `questions_points_check` | unrenderable difficulty, zero-point questions |
| `exercises_pass_threshold_check` | a threshold of 120% |

---

## A test bug I fixed rather than worked around

The progress-consistency test failed with `25P02 — current transaction is
aborted`. The constraint was working: the rejected insert aborted the
transaction, so the valid insert that followed could not run.

That is a defect in my test harness, not the schema. I wrapped the expected
failure in a savepoint and rolled back to it, so the test can assert both the
rejection *and* the success path. Weakening the test to only check the
rejection would have left the happy path unverified.

---

## Verification

| Layer | Tests | Result |
|---|---|---|
| Unit | 89 | pass |
| **Integration** | **58** (+23 learning) | **pass** |
| API + smoke | 60 | pass |
| Migration gate | 48 checks × 2 databases | pass |
| **Total** | **207** | **pass** |

Applied to the dev database with no data loss. Rollback script written and
exercised. `npm run verify` passes end to end.

---

## Gate approval

- [x] All nine tables implemented in Drizzle
- [x] **Database integration tests pass (58/58)**
- [x] Migration applies cleanly to empty and test databases
- [x] Rollback written, executed, and fingerprint-verified
- [x] RISK-0013 closed — learner columns are real foreign keys
- [x] Learner history protected from content deletion
- [x] `npm run verify` passes
- [x] **APPROVED**
