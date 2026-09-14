# PHASE 10.3 — JLPT N5 timed tests

Status: **COMPLETE** (structure-only blueprints · timed attempts · section gates ·
tests · build · gate)

## The architectural decision

A JLPT blueprint stores **structure, never content**: sections declare which bank
skills/kinds they sample and how many questions they need; the questions
themselves are sampled at attempt time. This keeps the blueprint permanently in
sync with the bank and guarantees no duplicate question data.

Starting a JLPT attempt delegates entirely to the shared run engine
(`startRun`), so JLPT scoring, expiry and grading use the exact same code path as
a practice quiz. The only JLPT-specific additions are framing (sections, time
limits, pass marks) and the section-gate pass decision.

## Blueprint model

| Concern | Implementation |
| --- | --- |
| Structure only | `jlpt_tests` / `jlpt_test_sections` carry counts, limits, pass marks, skill/kinds — no prompts/options |
| Bank-satisfiability | `available` computed against the live bank; a section can never be published while unfillable |
| Section gates | `passingPercent` (overall) + `sectionMinimumPercent` (per section) |
| Timed | `timeLimitSeconds` on test and every section |
| Listening (聴解) | deferred, recorded in `metadata.listeningPlanned` |

## Implementation evidence

| Area | File |
| --- | --- |
| Schema | `src/db/schema.ts` — `jlpt_tests`, `jlpt_test_sections` |
| Data | `etl/data/jlpt-blueprints.json` (N5 mock 1) |
| ETL | `etl/run-jlpt-blueprints.mjs` — additive upsert + availability check |
| Contracts | `src/types/jlpt.ts` |
| Repository | `src/repositories/jlpt.ts` — `listTests`, `findTestBySlug`, `jlptStats` |
| Service | `src/services/jlpt/tests.ts` — `startAttempt`, `getAttempt`, `submitAttempt`, `listAttempts` |
| API | `/api/jlpt/tests`, `/api/jlpt/tests/{slug}`, `/api/jlpt/tests/{slug}/attempts`, `/api/jlpt/attempts`, `/api/jlpt/stats` |
| UI | `src/app/jlpt/*`, `src/components/quiz/jlpt-start-button.tsx` |
| Gate | `tests/jlpt-gate.mjs` |

## Deployment gate

```bash
node tests/jlpt-gate.mjs http://127.0.0.1:3000
```

Verified: blueprint loaded and published; published blueprints are
bank-satisfiable; N5 blueprint published; attempt is timed server-side
(`timeLimitSeconds` + `expiresAt`); items match the blueprint and are seeded;
sections sized per blueprint; no answer key in the attempt; section gates and the
overall pass decision are computed server-side; client-supplied score ignored.

## Regression

10.2 quiz runs unaffected (same run model); 10.1 bank integrity intact; search
index re-applied after schema push.

## Next

10.5 expands timed tests to multiple levels and hardens the per-section clock.
