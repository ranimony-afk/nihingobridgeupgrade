# PHASE 10.5 — Timed tests

Status: **COMPLETE** (multi-level blueprints · per-section + overall clocks ·
server-side section enforcement · tests · build · gate)

## The architectural decision

10.3 shipped a single timed N5 blueprint. 10.5 makes timed tests a first-class,
multi-level feature without introducing a new engine:

* Blueprints now span **N5–N1**. Published ones (N5 ×2, N4 ×1) are guaranteed
  bank-satisfiable; N3/N2/N1 are kept as `published = false` drafts that are
  honestly gated as "bank gap" rather than silently shipped with an empty
  grammar section (the bank has no N3–N1 grammar, a documented upstream gap).
* Section `skills` were corrected to only reference skills the bank actually
  emits (`grammar`, `kanji`, `vocabulary`); the reading focus is expressed via
  `kinds` (`reading`) instead of the (nonexistent) `reading` skill.
* Time enforcement is **per-section and server-side**. `sectionDeadlines` derives
  each section's absolute deadline from the run's start time (sections run
  back-to-back); `answerRunItem` rejects an answer whose section budget or the
  overall clock has elapsed. The browser clock is cosmetic — `expiresAt` and the
  section deadlines are authoritative.
* The assessment runner now shows a per-section countdown alongside the overall
  countdown for JLPT attempts.

## Enforcement rules

| Rule | Where |
| --- | --- |
| Overall clock | `quiz_runs.expires_at` armed at `now() + time_limit_seconds` |
| Per-section clock | `sectionDeadlines(startedAt, sections)` in `run-engine.ts` |
| Answer-after-expiry | `answerRunItem` → `RunError("expired")` → HTTP 410 |
| Expired run scoring | `finalizeRun` marks unanswerable runs `passed = false` |
| Client clock | cosmetic only; cannot extend a run |

## Implementation evidence

| Area | File |
| --- | --- |
| Blueprints | `etl/data/jlpt-blueprints.json` — N5 mock 1/2, N4 mock 1 (published) + N3/N2/N1 drafts |
| Section deadlines | `src/services/quiz/run-engine.ts` — `sectionDeadlines`, `itemDeadline`, enforcement in `answerRunItem` |
| Runner UI | `src/components/quiz/assessment-runner.tsx` — per-section + overall clocks |
| Gate | `tests/timed-tests-gate.mjs` |
| Ops | `scripts/provision.sh` (runs the timed-tests gate) |

## Deployment gate

```bash
node tests/timed-tests-gate.mjs http://127.0.0.1:3000
```

Verified: blueprints span N5–N1; no published blueprint is bank-broken; every
published section has a ≥60s budget; overall limit covers the sum of section
budgets; published tests are timed and available; attempts carry a server-side
overall expiry and per-section budgets; first item grades; re-answering a graded
item is rejected (409).

## Regression

N5 attempt flow (10.3 gate), quiz runs (10.2 gate), and the 1613-question bank
(10.1 gate) are unchanged and still pass. `sectionDeadlines` is additive — plain
quizzes (no sections) fall back to the overall clock.
