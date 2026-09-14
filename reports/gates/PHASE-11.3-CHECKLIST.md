# PHASE 11 GATE CHECKLIST — Prompt 11.3: Daily Due Queue

- **Phase**: Phase 11 — Spaced Repetition System
- **Scope**: Prompt 11.3 only (*Daily due queue*)
- **Status**: COMPLETE & VERIFIED
- **Target**: Repository A (`https://github.com/ranimony-afk/nihingobridgeupgrade`)

---

## 1. What Was Built

Prompt 11.2 delivered sessions but had **no concept of "a day"** — everything was an undifferentiated
"due now" pile. Prompt 11.3 adds the day-scoped planning layer: timezone-aware day boundaries, daily
targets with hard caps, overdue/backlog detection, forward workload forecast, load balancing, streaks,
and a Today command center.

### Design decision: nothing daily is persisted

**No daily counters, rollups, or snapshots are stored.** Streaks, history, per-day workload, and
progress are always **derived from `srs_reviews` grouped by the learner's local calendar day**.

I deliberately rejected a `daily_rollups` table. It would have created a second source of truth that
could drift from the review log — violating the repository's stated *one database source of truth*
rule. The only new table is `srs_user_settings` (genuine user preferences, not derived data).

### Design decision: balancing is a recommendation, not a mutation

Load balancing **never modifies due dates**. It produces a per-day redistribution plan that drives
session sizing. Mutating `due_at` to "smooth" a workload would silently overwrite what the
registered scheduler decided — breaking the Phase 11.1 contract that algorithms own scheduling.

---

## 2. Implementation Evidence

| Concern | Path | Symbol |
|---|---|---|
| Settings schema | `src/db/schema.ts` | `srsUserSettings` |
| Types | `src/types/srs.ts` | `DailyQueueResponse`, `DailyBuckets`, `DailyForecastEntry`, `DailyRecommendation`, `DailyStreak` |
| Day window maths | `src/services/srs/dailyQueueService.ts` | `resolveDayWindow`, `tzOffsetMinutes`, `tzShift` |
| Buckets / forecast / streak | `src/services/srs/dailyQueueService.ts` | `DailyQueueService` |
| Session horizon | `src/services/srs/sessionService.ts` | `planSession({ dueHorizon })` |
| APIs | `src/app/api/srs/daily`, `/api/srs/settings` | 3 route handlers |
| UI | `src/app/review/today/page.tsx` | Today command center |

### Features

**Day definition** — IANA timezone + Anki-style cutoff hour (`dayCutoffHour`). A 2am session still
counts toward the previous study day when the cutoff is 4am.

**Four due buckets** — `overdue` (before today's cutoff, excluding learning-phase cards),
`dueToday`, `laterToday` (minute-scale learning steps), `newAvailable`.

**Daily targets + hard caps** — `dailyNewTarget`, `dailyReviewTarget`, plus hard ceilings
`maxDailyReviews` / `maxDailyNew` that constrain the recommendation.

**Forecast + load balancing** — N-day horizon; spikes flattened toward the horizon mean with a noise
guard, conserving total card count exactly.

**Streaks** — current / longest / days-active / active-today, all cutoff-aware and fully derived.

**History** — N-day rollup with `targetMet` flag per local day.

---

## 3. API Surface

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/srs/daily` | Full day view: buckets, progress, streak, forecast, recommendation, history, suggested session |
| GET | `/api/srs/settings` | Settings + defaults + resolved day window |
| PUT | `/api/srs/settings` | Update targets, cutoff, timezone, balancing, horizon (clamped + validated) |
| POST | `/api/srs/sessions` | Now accepts `dueHorizon: "now" \| "day"` |

---

## 4. Bugs Found and Fixed During Verification

**4.1 — Postgres parameter type inference in interval arithmetic**
`($1 || ' minutes')::interval` and `$1 * interval '1 minute'` both failed: Postgres cannot infer a
type for an untyped parameter in interval arithmetic. Fixed by inlining the locally-computed integer
offset via `sql.raw()` (`tzShift`), which is injection-safe because the value is a rounded number
originating in our own code.

**4.2 — Load balancing was a silent no-op**
The ceiling was `max(dailyReviewTarget, mean)`. With a 200/day target and 40 total cards, no day could
ever exceed 200, so balancing never fired. The correct semantic is flattening toward the **horizon
mean**, with a noise guard. Fixed.

**4.3 — Recommendation floor forced a phantom card**
`suggestedReview` used `Math.max(1, …)`, recommending 1 review even when nothing was due. Changed to
`Math.max(0, …)`.

**4.4 — "Heavy" message cited the wrong ceiling**
Reported the *target* (60) while enforcing the *cap* (12). Now reports the effective ceiling and the
concrete suggestion.

**4.5 — Daily count disagreed with the session plan** *(the substantive one)*
The daily view counted 18 cards (8 overdue + 10 due later today), but a launched session planned only
8 — because the planner filtered `dueAt <= now()` while the daily bucket means "due within today".
Learners would see a promise the planner could not keep.

Fixed by adding `dueHorizon: "now" | "day"` to `planSession`. With `"day"` the planner pulls everything
due within the learner's study day, so the counts agree. The daily endpoint now returns
`suggestedSession.dueHorizon: "day"` and the UI passes it through. **Verified: suggested 12 → planned 12**.

---

## 5. Verification Results

### 5.1 Validation commands
| Command | Result |
|---|---|
| `npx drizzle-kit push` | ✅ `srs_user_settings` created (**additive only**, no existing table altered) |
| `npx next typegen` | ✅ |
| `tsc --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ new routes `/api/srs/daily`, `/api/srs/settings`, `/review/today` |
| `build_and_start` + `/api/health` | ✅ `{"ok":true}` |

### 5.2 Buckets
```
OVERDUE=8 (oldest 2d)  DUE_TODAY=10  LATER_TODAY=0  NEW=0
totals: { totalDueToday: 18, totalAvailable: 18, learning: 0, review: 41, mature: 0 }
```

### 5.3 Day cutoff (the key correctness proof)
```
cutoff 04:00 UTC           → day=2026-09-14  window=09-14T04:00 .. 09-15T04:00
Asia/Tokyo + cutoff 23:00  → day=2026-09-13  window=09-13T14:00 .. 09-14T14:00  offset=+540min
```
At 14:27 JST on Sep 14 with an 23:00 cutoff, the study day correctly resolves to **Sep 13**.

### 5.4 Load balancing — spike flattened, totals conserved
```
scheduled=33  balanced=33   → OK (conservation)
peak:  scheduled=23 → balanced=3

FORECAST (scheduled -> balanced)
 09-15 Tue  10 -> 3
 09-16 Wed   0 -> 3
 09-17 Thu   0 -> 3
 09-18 Fri  23 -> 3   ← spike dissolved
 09-19 Sat   0 -> 3
 ... (forward fill to horizon)
```

### 5.5 Hard caps enforce
```
maxDailyReviews=12, 18 cards due
→ [HEAVY] Heavy day — 18 cards due
   "Your daily limit is 12, so 6 card(s) can be spread forward to lighter days."
→ suggested: 12 review + 0 new
```

### 5.6 Streak + history (derived)
```
streak: current=9  longest=10  activeDays=10  todayActive=True
HISTORY  09-05..09-13  rev=4/day  acc=100%  targetMet=False
```

### 5.7 Daily → session → progress loop closes
```
recommendation 12 review → session planned 12 (dueHorizon=day) → CONSISTENT
contrast: dueHorizon=now → 5 cards (only already-due)
after 3 answers: daily progress 5 → 7 reviews, accuracy 85.7%
```

### 5.8 Regression — all green
| Feature | Result |
|---|---|
| Scheduler registry (11.1) | ✅ 4 plugins, keys + param counts unchanged |
| Session plan / answer / undo (11.2) | ✅ `leitner-box → 1d`, undo restored `毎朝` |
| Phase 10 JLPT tests | ✅ 3 tests, N5 mock = 32 Qs |
| Phase 10 question bank | ✅ 32 questions |
| `/review/today`, `/review`, `/review/session/[id]` | ✅ all HTTP 200 |
| `/api/health` | ✅ `{"ok":true}` |

---

## 6. Deployment

```bash
npx drizzle-kit push      # additive: one new table (srs_user_settings)
npx next typegen
npm exec tsc -- --noEmit
npm run build
npm run start             # or: vercel --prod
```

**Environment:** no new env vars. `DATABASE_URL` only.
**Breaking changes:** none. `planSession` gained an optional param; `dueHorizon` defaults to `"now"`,
preserving 11.2 behaviour exactly.

---

## 7. Notes & Follow-ups

- `offsetMinutes` is rounded to a whole minute in `DayWindow` for clean display; `tzShift` rounds
  independently before inlining.
- **11.4** can add per-user algorithm overrides on the same settings row.
- **11.5** can surface a Leitner box visualisation from the existing `box` state column.
- Possible future: a "smooth backlog" action that *actually* reschedules non-overdue future cards —
  deliberately not built here, as it mutates scheduler-owned state and needs its own audit trail.
