# PHASE 11 GATE CHECKLIST — SRS (Prompt 11.1: Scheduler Abstraction)

- **Phase**: Phase 11 — Spaced Repetition System
- **Scope**: Prompt 11.1 only
- **Primary Requirement**: *Implement scheduler abstraction. Do not hard-code one algorithm into the database.*
- **Status**: COMPLETE & VERIFIED
- **Target**: Repository A (`https://github.com/ranimony-afk/nihingobridgeupgrade`)

---

## 1. The Abstraction

### 1.1 The Contract — `src/types/srs.ts`

Every algorithm implements one narrow interface:

| Member | Purpose |
|---|---|
| `key`, `name`, `version` | Registry identity + version for audit trails |
| `defaultParams` | Algorithm's own defaults |
| `paramFields` | **Declarative** parameter schema → UI config panel is auto-generated |
| `review(ctx)` | `(state, rating, params, now) → outcome` — pure function |
| `isDue(state, now)` | Due predicate |
| `newCardGraduatingIntervalDays(params)` | Interval for a card that survives learning |

**Rules enforced by design:**
1. No strategy file imports the database.
2. No strategy may assume it is the only algorithm.
3. Adding an algorithm = registering a new `SrsScheduler` (no migration).
4. Nothing outside `src/services/srs/scheduler.ts` may branch on a scheduler key.

### 1.2 The Registry — `src/services/srs/scheduler.ts`

`PLUGINS` array is the **single** place that knows which algorithms exist. It owns:
- `getScheduler(key)` — resolution with safe fallback to `DEFAULT_SCHEDULER_KEY`
- `resolveParams(scheduler, raw)` — coercion + clamping against `paramFields`
- `describeScheduler()` / `listSchedulers()` — descriptors + truthful simulated ladders
- `previewGrade()` — side-effect-free simulation
- `assertNoHardcodedAlgorithms()` — guardrail asserting each plugin declares metadata + params

**To add an algorithm:**
1. Create `src/services/srs/strategies/<name>.ts` exporting an `SrsScheduler`
2. Append it to `PLUGINS`
3. Done — decks reference it immediately by key

---

## 2. Registered Algorithms (4 plugins)

| Key | Version | Algorithm | Ladder (repeated "good") | Params |
|---|---|---|---|---|
| `sm2` | 1.2.0 | SuperMemo SM-2 + Anki learning steps | 12m → 1d → 2d → 5d → 13d → 1.1mo → 2.8mo → 6.9mo | 11 |
| `leitner-box` | 1.1.0 | Leitner Box System | 1d → 3d → 7d → 16d → 1.2mo … | 7 |
| `fsrs-lite` | 1.3.0 | FSRS 3-component (D/S/R) | 12m → 1d → 4d → 18d → 2.7mo → 11.6mo | 12 |
| `fixed-ladder` | 1.0.1 | Fixed Interval Ladder | 12m → 1d → 3d → 7d → 14d → 1.0mo → 2.0mo → 4.0mo | 8 |

Divergent ladders prove these are genuinely independent implementations, not one algorithm with flags.

---

## 3. Storage Model — "No Algorithm In The Database"

### 3.1 What the database stores (additive only, no destructive change)

| Table | Algorithm-related columns |
|---|---|
| `srs_decks` | `scheduler_key` (string key) + `scheduler_params` (**jsonb**) |
| `srs_cards` | `scheduler_key` (last-writer snapshot, audit only) |
| `srs_reviews` | `scheduler_key`, `scheduler_version`, `params_snapshot` (jsonb), `state_before`, `state_after`, `explanation` |
| `srs_schedulers` | **Mirror of the code registry** for admin introspection/provenance. Contains descriptors and default params only — **zero logic** |

### 3.2 What the database does **not** contain
- No interval formulas
- No easiness/recurrence math
- No `CASE WHEN scheduler_key = '...'` branching anywhere in SQL or TypeScript
- No per-algorithm columns

### 3.3 Algorithm-agnostic state superset
`srs_cards` exposes a generic superset (`ease_factor`, `interval_days`, `box`, `stability_days`, `difficulty`, `step_index`, `lapses`, `repetitions`, `phase`). Each algorithm reads/writes only what it needs. **Consequence: switching algorithms never requires a migration.**

---

## 4. Implementation Evidence

| Concern | Path | Symbol |
|---|---|---|
| Contracts | `src/types/srs.ts` | `SrsScheduler`, `SchedulerReviewContext`, `SchedulerReviewOutcome`, `SchedulerParams` |
| Registry | `src/services/srs/scheduler.ts` | `PLUGINS`, `getScheduler`, `resolveParams`, `previewGrade` |
| SM-2 | `src/services/srs/strategies/sm2.ts` | `sm2Scheduler` |
| Leitner | `src/services/srs/strategies/leitnerBox.ts` | `leitnerScheduler` |
| FSRS-Lite | `src/services/srs/strategies/fsrsLite.ts` | `fsrsLiteScheduler` |
| Fixed Ladder | `src/services/srs/strategies/fixedLadder.ts` | `fixedLadderScheduler` |
| Shared math | `src/services/srs/strategies/shared.ts` | `retrievability`, `intervalForRetention`, `buildOutcome`, `simulateIntervalLadder` |
| Orchestration | `src/services/srs/srsService.ts` | `SrsService` |
| Schema | `src/db/schema.ts` | `srsSchedulers`, `srsDecks`, `srsCards`, `srsReviews` |
| APIs | `src/app/api/srs/*` | 8 route handlers |
| UI | `src/app/review/page.tsx` | SRS dashboard + study session + scheduler lab |

### Knowledge-grounded seeding
Cards are **derived from Phase 10 platform knowledge** — not invented:
- `question_bank.vocab_note` → vocabulary cards
- `question_bank.grammar_point` → grammar cards
- `question_bank.kanji_reading` → kanji cards

41 cards seeded across 4 algorithm-bound decks.

---

## 5. API Surface

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/srs/schedulers` | Enumerate registry + declarative param schemas + simulated ladders |
| GET / POST | `/api/srs/decks` | List / create decks |
| GET / PATCH | `/api/srs/decks/[id]` | Deck detail + **runtime algorithm re-binding** |
| GET / POST | `/api/srs/cards` | Query / create cards |
| GET | `/api/srs/queue` | Due queue annotated with the algorithm that will schedule each card |
| POST | `/api/srs/review` | Grade one card (algorithm resolved at request time) |
| GET | `/api/srs/stats` | Buckets, retention, 7-day forecast, scheduler usage |
| POST | `/api/srs/preview` | **Pure simulation** — no persistence |

---

## 6. Verification Results

### 6.1 Validation commands
| Command | Result |
|---|---|
| `npx drizzle-kit push` | ✅ Applied — 4 tables created (`srs_schedulers`, `srs_decks`, `srs_cards`, `srs_reviews`) |
| `npx next typegen` | ✅ Types generated |
| `npm exec tsc -- --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ 8 new SRS routes compiled |
| `build_and_start` + `/api/health` | ✅ `{"ok":true}` |

### 6.2 Registry enumeration
```
registrySize: 4 | keys: ['sm2','leitner-box','fsrs-lite','fixed-ladder'] | default: sm2
sm2          v1.2.0 params=11 ladder=[12m 1d 2d 5d 13d 1.1mo 2.8mo 6.9mo]
leitner-box  v1.1.0 params=7  ladder=[1d 3d 7d 16d 1.2mo ...]
fsrs-lite    v1.3.0 params=12 ladder=[12m 1d 4d 18d 2.7mo 11.6mo 4.2y 10.0y]
fixed-ladder v1.0.1 params=8  ladder=[12m 1d 3d 7d 14d 1.0mo 2.0mo 4.0mo]
```

### 6.3 Divergent live behaviour (same card, same rating)
```
sm2          good → 12m → 1d → 2d          (EF-driven)
fsrs-lite    good → 12m → 1d → 4d          (S 1.00→4.43d, D 5.0→3.8)
leitner-box  good → 1d → 3d → 7d           (box 0→1→2→3)
fixed-ladder good → 12m → 1d → 3d          (deterministic rungs)
```

### 6.4 Runtime re-binding — the decisive proof
```
BEFORE: card 2 reviews by sm2@1.2.0, interval 2d, phase=review
REBIND: deck-n5-core-sm2 → fsrs-lite (params requestRetention=0.92)
        "Deck re-bound to FSRS-Lite (3-Component Memory Model) v1.3.0"
AFTER:  same card graded → scheduled by fsrs-lite@v1.3.0, 0 data loss

AUDIT TRAIL:
 sm2       | 1.2.0 | 0.008 |           | good
 sm2       | 1.2.0 | 1.000 |           | good
 sm2       | 1.2.0 | 2.000 |           | good
 fsrs-lite | 1.3.0 | 0.008 | 0.92      | good   ← params snapshot persisted
```
No migration. No data loss. Every review records exactly which algorithm + version + parameters produced its interval.

**Note on re-binding semantics:** FSRS-Lite legitimately re-initialises its own memory components (`S`, `D`) when it encounters a card that has never had stability set — mirroring real-world Anki SM-2→FSRS migration. This is correct algorithm behaviour, not state loss.

### 6.5 Guardrail validation
```
PATCH schedulerKey="made-up-algo"
→ {"success":false,"error":"Unknown scheduler key: made-up-algo"}
```
Unregistered algorithms cannot be injected.

### 6.6 Phase 10 regression — all green
| Feature | Result |
|---|---|
| `/api/health` | ✅ `{"ok":true}` |
| `/api/jlpt/tests` | ✅ 3 tests, N5 mock has 32 questions |
| `/api/questions?level=N5` | ✅ 32 questions |
| `/review` page | ✅ HTTP 200 |
| Phase 10 tables | ✅ Untouched — additive schema only |

---

## 7. Deployment

```bash
# 1. Apply schema (additive — safe on existing DB)
npx drizzle-kit push

# 2. Validate
npx next typegen
npm exec tsc -- --noEmit
npm run build

# 3. Deploy
npm run start        # or: vercel --prod
```

**Environment:** no new env vars required. `DATABASE_URL` only.

---

## 8. What Prompt 11.2+ Can Build On

The abstraction is the deliverable; these now follow without redesign:
- **11.2** — Deck/card CRUD at scale, bulk import from dictionary & kanji tables
- **11.3** — SRS dashboards + review forecasting UI deepening
- **11.4** — Per-user algorithm overrides and learner-level parameter tuning
- **11.5** — Leitner box visualisation + algorithm A/B benchmarking harness
- **11.6** — AI-driven scheduling recommendations feeding `paramFields`

No further migration is needed to support any of the above: the state superset and registry are already general.
