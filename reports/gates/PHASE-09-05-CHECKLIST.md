# PHASE 09.5 — Progress tracking

Status: **COMPLETE** — deployment gate
`course → lesson → exercise → answer → score → progress` passes end to end.

## Architectural decision: one canonical user table

Progress requires an owner and the platform had no authentication. Per the
"no authentication swap without evidence / design one deliberately" rule, 09.5
introduces **the canonical `users` table** with anonymous device identities
instead of a throwaway progress store.

A future authentication phase attaches credentials (email, password hash, OAuth
ids) to *this* table and flips `is_anonymous`. It must not create a second user
model. The gate asserts no competing `accounts` / `profiles` / `learners` table
exists.

| Table | Purpose |
| --- | --- |
| `users` | canonical identity; `public_id` carried in the signed cookie |
| `user_lesson_progress` | status, completed section keys, best score/percent, attempts |
| `user_exercise_attempts` | append-only audit log behind every score |
| `user_course_progress` | derived rollup, recomputed whenever lesson progress changes |

**Session:** HMAC-signed cookie `nb_learner` — HttpOnly, SameSite=Lax, Secure in
production, secret from `LEARNER_SESSION_SECRET` (documented in `.env.example`).

## Anti-cheat

The client submits **answers, never a score**. `/exercises/submit` re-grades
against the server-side key and persists only the server's result; extra
`score` / `percent` fields in the request body are ignored. The gate submits
deliberately wrong answers together with `percent: 100, score: 999` and asserts
the stored result is **0% / 0 points, not passed**.

## Implementation evidence

| Area | File |
| --- | --- |
| Schema | `src/db/schema.ts` — `users`, `userLessonProgress`, `userExerciseAttempts`, `userCourseProgress` |
| Session | `src/services/learning/session.ts` — `ensureLearner`, `readLearner`, `attachLearnerCookie`, HMAC sign/verify with `timingSafeEqual` |
| Repository | `src/repositories/progress.ts` — section upsert, attempt log, course rollup, dashboard |
| Service | `src/services/learning/progress.ts` — `markSectionComplete`, `recordExerciseResult`, `getLessonProgress`, `getCourseProgress`, `getDashboard` |
| API | `/api/progress`, `/api/progress/lesson/[slug]` (GET+POST), `/api/progress/course/[slug]`, extended `/api/lessons/[slug]/exercises/submit` |
| UI | `/dashboard`; player posts section completion and seeds from server progress; runner saves scores and links to the dashboard |
| Ops | `scripts/provision.sh`, `.env.example`, `docs/learning/course-architecture.md` |

## Deployment gate

```bash
node tests/progress-gate.mjs http://127.0.0.1:3000   # GATE PASSED (35 checks)
```

The gate walks the required chain with a real cookie jar:

```
chain 1 course    → /api/courses lists japanese-foundations-n5
chain 2 lesson    → course exposes n5-sentence-order
chain 3 exercise  → lesson has 7 exercises
chain 4 answer    → server grades a submitted answer
chain 5 score     → full set scores 100%, passed, persisted
chain 6 progress  → best 100%, 7/7 attempts in the audit log
```

Plus: all sections complete → lesson `completed` (6/6); course rollup 1 lesson /
25%; dashboard totals, 100% accuracy and points; **learner isolation** (a second
session sees zero progress and gets a distinct identity); **anti-cheat**;
persistence across requests; dashboard/player/practice pages render; 400 on an
invalid section key; 404 on an unknown lesson.

## Contract changes made by this phase

Two earlier gate expectations were **intentionally** updated, not loosened:

| Gate | Was | Now | Why |
| --- | --- | --- | --- |
| 09.4 exercise engine | `meta.persisted === false` | `=== true` | submissions are now durable against the learner profile |
| 09.3 lesson player | "stored in this browser only" | "saved to your learner profile" | progress moved from `localStorage` to the server |

A defect in this phase's own gate was also fixed: the attempt-count assertion
counted rows for *all* learners (35/7 after repeated runs) instead of scoping to
the session under test. It now joins `users.public_id`.

## Regression

09.4 exercise engine, 09.3 player, 09.2 lesson architecture, 09.1 course
architecture, 08.1/08.2 search, 07.1–07.4 grammar, 06.4 Kanji Mind Tree.

## Deferred

Named sign-in, cross-device sync, XP/streaks/achievements, SRS scheduling and
leaderboards. All attach to `users.id` without schema churn.
