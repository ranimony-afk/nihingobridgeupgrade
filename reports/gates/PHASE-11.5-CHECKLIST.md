# PHASE 11 GATE CHECKLIST — Prompt 11.5: Personalized Review

- **Phase**: Phase 11 — Spaced Repetition System
- **Scope**: Prompt 11.5 only (*Personalized review*)
- **Status**: COMPLETE & VERIFIED
- **Deployment gate**: `new card → due → review → rating → reschedule → next due` — **PASSED on all four ratings**
- **Target**: Repository A (`https://github.com/ranimony-afk/nihingobridgeupgrade`)

---

## 1. What Was Built

A learner-profile layer that makes review **personal** — weak material surfaces first, budgets adapt
to observed performance, and every ordering decision is explainable.

### The architectural constraint (and why it matters)

Personalization influences **selection and budgets only**. It never mutates `due_at`.

This preserves the Phase 11.1 contract established across the whole SRS: **the registered scheduler
owns scheduling**. If a personalization layer could push cards forward in time, it would silently
overwrite what SM-2 / FSRS / Leitner / the ladder decided, and the scheduler registry would become
decorative. Personalization decides *what you study next*; the algorithm decides *when it comes back*.

This is the same boundary drawn in 11.3 (load balancing is a recommendation, not a mutation).

### Second constraint: only user intent is persisted

`srs_personalization` stores **weights and toggles** — genuine user choices. Every derived signal
(accuracy, weakness, velocity, retention, weak areas) is **computed live from `srs_reviews`** on each
request. No profile cache, no rollup table, nothing that can drift from the log.

---

## 2. Implementation Evidence

| Concern | Path | Symbol |
|---|---|---|
| Prefs schema | `src/db/schema.ts` | `srsPersonalization` |
| Types | `src/types/srs.ts` | `LearnerProfile`, `PersonalCardStat`, `PersonalAreaStat`, `PersonalizedPlan`, `CardLifecycleTrace` |
| Engine | `src/services/srs/personalizationService.ts` | `PersonalizationService` |
| Session integration | `src/services/srs/sessionService.ts` | `orderCards(..., "personalized")` |
| APIs | `src/app/api/srs/personal/**` | `route.ts`, `lifecycle/route.ts` |
| UI | `src/app/review/personal/page.tsx` | Profile, plan, weights, lifecycle gate |

### Weakness scoring

Per card, from the review log:
- **Laplace-smoothed accuracy** `(correct+1)/(attempts+2)` so one bad answer ≠ "broken card"
- **Confidence scaling** `attempts/(attempts+3)` so thin data stays low-priority
- **Last-attempt failure** bump (+0.12)
- **Declining trend** bump when the last 3 reviews underperform the lifetime mean
- **Recency decay** for long-unseen material

### Priority scoring (weighted by user prefs)

```
score = weakness · weaknessWeight
      + urgency · urgencyWeight        // saturation over ~14 days overdue
      + difficulty · difficultyWeight  // scheduler easeFactor, secondary only
```

`weakFirst` separates established weak cards from brand-new ones so new cards never crowd out repair work.

### Weak areas — four dimensions

Rollups computed across `cardType`, `deck`, `questionCategory` and `tag`. Categories/tags are resolved
by joining cards back to the **Phase 10 question bank** via `sourceQuestionId`, so the platform
personalizes over real knowledge metadata rather than invented groupings. Areas below 4 attempts are
flagged unreliable and excluded from ranking.

### Transparent ordering

When `order === "personalized"`, each queue entry carries `priorityReason` and `priorityScore`, so the
UI can say *why* a card is in front of you instead of presenting an opaque ranking.

---

## 3. Deployment Gate — Lifecycle Chain

`POST /api/srs/personal/lifecycle` runs the full chain on a real card and returns a per-stage pass/fail
matrix. **All four ratings passed.**

| Stage | `good` | `easy` | `again` | `hard` |
|---|---|---|---|---|
| created | ✅ | ✅ | ✅ | ✅ |
| new | ✅ | ✅ | ✅ | ✅ |
| due | ✅ | ✅ | ✅ | ✅ |
| reviewed | ✅ | ✅ | ✅ | ✅ |
| rated | ✅ 12m | ✅ 4d | ✅ now | ✅ now |
| rescheduled | ✅ | ✅ | ✅ | ✅ |
| next due | ✅ | ✅ | ✅ | ✅ |
| **ALL PASSED** | **True** | **True** | **True** | **True** |

`good` and `easy` graduated (`12m` → `1d`-class, `4d`); `again`/`hard` correctly stayed in a
minute-scale learning step.

### Bugs found and fixed while building the gate

1. **Probe/planner mismatch** — the gate selected its probe card by `createdAt ASC` but the session
   planner orders new cards by `dueAt ASC`. Different card, so `wasServedInSession` failed. Fixed by
   selecting the probe with the same predicate the planner uses, with a fallback to review cards.

2. **Mutating `dueAt` broke selection** — I initially set `due_at = now()` to "force" the card due.
   That *pushed it later* than other seeded cards (also due now), so the planner picked a different
   one. Removed the mutation; the probe is already due, making selection deterministic.

3. **Over-strict queue-exit assertion** — the gate initially demanded every card leave the queue.
   False for SM-2 `again`/`hard`, which *by design* keep a card in a learning step. Corrected: the
   assertion only applies to cards the algorithm graduated to a day-scale interval (`graduatedThisCycle`).

---

## 4. Verification Results

### 4.1 Validation commands
| Command | Result |
|---|---|
| `npx drizzle-kit push` | ✅ `srs_personalization` created (additive) |
| `npx next typegen` | ✅ |
| `tsc --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ `/api/srs/personal/**`, `/review/personal` |
| `build_and_start` + `/api/health` | ✅ `{"ok":true}` |

### 4.2 Weak-area detection (seeded: kanji 33% acc, grammar 100% acc)
```
WEAK      kanji          cardType  acc=0.429 weak=0.508 attempts=7 cards=6
WEAK      N5 Kanji Readi deck      acc=0.429 weak=0.508 attempts=7 cards=6
WEAK      kanji_reading  category  acc=0.545 weak=0.453 attempts=11 cards=9
WEAK      kanji-reading  tag       acc=0.545 weak=0.453 attempts=11 cards=9
STRONG    grammar        cardType  acc=1     weak=0.08
STRONG    particles      tag       acc=1     weak=0.103
```

### 4.3 Personalized ordering beats plain due ordering
Same candidate pool, `weaknessWeight=0.8`:
```
due           vocab-003, grammar-003, vocab-021, vocab-022, kanji-005     (no reasons)
personalized  vocab-003, kanji-005, vocab-023, kanji-004, kanji-007       (all "failed last attempt", 0.443)
```
The **strong grammar card is 2nd under `due` and absent from the personalized top 5** — weak material
is genuinely surfaced, and every entry carries its reason + score.

### 4.4 Weights change the outcome
Switching to `urgencyWeight=0.8` produced a different top-3 (`kanji-005, grammar-003, vocab-024`),
confirming preferences have real effect and are honoured.

### 4.5 Target adaptation
```
accuracy 69.6%, 6 weak areas, retention 71.4%
→ direction: down | 20 → 15 new/day
→ "Cutting new cards to 15/day shifts capacity toward repairing weak material."
plan newLimit: 6  (halved — repair mode)
```
Below 12 reviews the service correctly *holds* rather than guessing.

### 4.6 Regression — all green
| Feature | Result |
|---|---|
| 11.1 registry | ✅ 4 plugins, keys unchanged |
| 11.2 session planning | ✅ session created |
| 11.3 daily queue + streak | ✅ buckets reporting |
| 11.4 sync registry | ✅ `reg-1r952uooqf9b-4`, 4 plugins |
| Phase 10 JLPT / question bank | ✅ 3 tests, N5 mock 32 Qs |
| `/review/personal`, `/today`, `/review`, `/sync` | ✅ all HTTP 200 |

All synthetic verification data was **removed** after testing; prefs restored to defaults.

---

## 5. Deployment

```bash
npx drizzle-kit push        # additive: one new table (srs_personalization)
npx next typegen
npm exec tsc -- --noEmit
npm run build
npm run start               # or: vercel --prod
```

**Environment:** no new env vars. `DATABASE_URL` only.
**Breaking changes:** none. `SessionQueueOrder` gained a member (`"personalized"`); existing orders are
unaffected and the planner defaults to `"due"`.

---

## 6. Notes & Follow-ups

- The lifecycle gate doubles as a **self-test endpoint** — worth promoting into an automated test file
  in a later phase rather than living only as an API route.
- `maxWeakCardsPerSession` currently acts as an upper bound on the review allowance; a tighter
  "reserve N slots for weak cards" semantic would be more precise.
- **Future:** spaced-retrieval difficulty targets feeding back into FSRS parameters; per-learner
  algorithm recommendation (compare their retention across decks bound to different algorithms).
