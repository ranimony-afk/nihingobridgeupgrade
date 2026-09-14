# PHASE 12 GATE CHECKLIST — Prompt 12.1: Event-Based XP

- **Phase**: Phase 12 — Gamification
- **Scope**: Prompt 12.1 only (*Create event-based XP*)
- **Status**: COMPLETE & VERIFIED
- **Target**: Repository A (`https://github.com/ranimony-afk/nihingobridgeupgrade`)

---

## 1. What Was Built

An **append-only XP ledger** driven by domain events, with a pluggable rule registry.

### Design decision: XP is derived, never a counter

The word that matters in the prompt is *event-based*. `xp_events` is an append-only ledger;
**totals, levels, streaks, daily-cap usage and trend charts are all derived by summing it**.

A mutable `users.xp` counter would have been faster to write and would have been wrong: it can drift
from the events that produced it, it cannot be audited, and it cannot be corrected when a source
action is undone. This is the same principle already enforced for reviews (11.2), daily stats (11.3)
and personalization (11.5) — XP simply joins the existing rule.

### Design decision: idempotency is a database constraint, not a convention

Every event carries a `dedupeKey` derived from its source entity (`review:<id>`, `jlpt-test:<id>`),
backed by a **UNIQUE index**. Application code checks first so callers get a clean `duplicate: true`
response, but the database is the authoritative guard.

This matters specifically because **Phase 11.4 sync replays review events**. Without this, a phone
re-pushing an offline batch would mint XP every time.

### Design decision: undo revokes, it does not delete

Phase 11.2 undo now calls `revokeByDedupeKey`, which sets `revokedAt` rather than deleting the row.
Derived totals exclude revoked events, so **XP cannot be farmed by undo/redo cycling**, while the
ledger stays fully auditable.

### Design decision: scoring lives in versioned code

`xp_rules` mirrors the in-code registry for admin introspection only — descriptors and default params,
**never scoring maths**. Adding a rule means adding a file and one array entry; no migration. This
deliberately mirrors the Phase 11.1 scheduler registry.

---

## 2. Registered Rules (6)

| Key | Event | Base | Daily cap | Example payouts |
|---|---|---|---|---|
| `review-graded` | `review.graded` | 10 | 600 | young 10 · mature(30d) 15 · new 15 · lapse 8 |
| `session-completed` | `review.session_completed` | 25 | 250 | 10 cards@80% → 35 · 20@100% → 75 |
| `quiz-answered` | `quiz.answered` | 8 | 400 | N5 correct 8 · N1 hard 28 |
| `test-completed` | `quiz.test_completed` | 100 | — | N5 85% passed → 492 · 40% failed → 224 |
| `knowledge-added` | `knowledge.card_added` | 5 | 100 | 1 kana 7 · 5 kanji 23 |
| `streak-day` | `streak.day_completed` | 20 | — | day 1 → 20 · day 7 → 82 · day 30 → 278 |

Rules are pure functions returning a **scoring breakdown**, so the ledger UI can show exactly *why*
each award was what it was (base → bonuses → multipliers → cap).

**Anti-grind design:** daily caps on the repeatable rules; streak multipliers saturate; maturity
bonuses are capped. Genuine study outpaces grinding.

### Level curve
Derived, progressive: `xpForLevel(n) = 60 · n^1.45`, 60 levels, nine titles (入門 → 師範).
`L1=0, L2=60, L3=224, L5=967, L10=6,075`.

---

## 3. Integration Points

XP is emitted by existing domain code via `awardSafe` (failures are logged, never break a study action):

| Source | Where | Dedupe key |
|---|---|---|
| SRS review graded | `SrsService.gradeCard` | `review:<reviewId>` |
| Session completed | `SessionService.answer` | `session:<sessionId>` |
| Review undone | `SessionService.undo` | revokes `review:<reviewId>` |
| JLPT exam + per answer | `TestService.submitSession` | `jlpt-test:<id>`, `jlpt-answer:<id>:<qid>` |
| Kana / kanji captured | `/api/knowledge/srs` | `knowledge:<cardId>` |
| Daily streak | `awardDailyStreak` | `streak:<user>:<localDate>` |

Streak XP reuses the **Phase 11.3 timezone + day-cutoff**, so "today" means the same thing everywhere.

---

## 4. Verification Results

### 4.1 Validation
| Command | Result |
|---|---|
| `npx drizzle-kit push` | ✅ `xp_events`, `xp_rules` (additive) |
| `npx next typegen` / `tsc --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ |
| `build_and_start` + `/api/health` | ✅ `{"ok":true}` |

### 4.2 XP from real study
```
4 cards graded (3 good, 1 again) → totalXp 102, level 2
  +15 review.graded   [Correct recall 10 | New card learned 5]
  +8  review.graded   [Lapse — effort credit 3 | New card learned 5]
  +29 session_completed [Session completed 25 | 4 cards answered 4]
  +20 streak.day_completed
```

### 4.3 Idempotency — the core guarantee
```
Replay review event via API → awarded: False, duplicate: True, points: 0
Direct DB insert, same key  → ERROR: duplicate key value violates
                               unique constraint "xp_events_dedupe_key_unique"
```

### 4.4 Undo revokes XP
```
totalXp before undo: 102
undo 白い          → totalXp after: 87   (−15, exactly the award)
ledger row: 15 | review:rev-…ucbux8 | revoked_reason=review-undone
```

### 4.5 Daily cap clips awards
```
cap usage 106/100 → award clipped to 0, cappedByDaily: true
breakdown line: { label: "Daily cap reached (100 XP)", value: -11, kind: "cap" }
```

### 4.6 JLPT + knowledge integration
```
mock exam submitted → quiz.test_completed 178 XP + quiz.answered 82 XP over 32 events
kanji 森 captured   → 11 XP [base 5 | 1 card +2 | Kanji entry ×1.5]
```

---

## 5. A real bug this phase surfaced (and the fix)

The Phase 11.5 lifecycle gate began failing at `wasServedInSession`. Rather than relax the assertion,
I traced it to a genuine latent defect:

> **Postgres stores timestamps at microsecond precision; JavaScript `Date` truncates to
> milliseconds.** Two cards at `06:24:15.458` and `06:24:15.458502` are *distinct* to SQL but *equal*
> in JS. The gate selected its probe with SQL ordering while the planner sorted in JS — so on ties
> they disagreed about which card came first.

This was pre-existing and intermittent; adding a deterministic tie-break made it reproducible.

**Fix applied (two parts):**
1. `orderCards` now tie-breaks on `id`, so the planner's own ordering is stable.
2. More importantly, the gate no longer re-derives the ordering at all — it **plans the session first
   and reads the card the planner actually served**. Removing the duplicated ordering logic eliminates
   the whole class of bug rather than patching this instance.

Gate re-verified: `good / easy / again / hard` → **all stages PASS**.

---

## 6. Regression — all green

| Feature | Result |
|---|---|
| 11.1 scheduler registry | ✅ 4 plugins |
| 11.2 session planning (incl. `personalized` order) | ✅ |
| 11.3 daily queue + streak | ✅ |
| 11.4 sync registry | ✅ `reg-1r952uooqf9b-4` |
| 11.5 personalization + lifecycle gate | ✅ all ratings pass |
| Knowledge layer (kana 208, mind tree) | ✅ |
| Phase 10 JLPT (3 tests / 32 Qs) | ✅ |
| All 10 UI pages | ✅ HTTP 200 |

---

## 7. Deployment

```bash
npx drizzle-kit push      # additive: two new tables
npx next typegen
npm exec tsc -- --noEmit
npm run build
npm run start             # or: vercel --prod
```

**Environment:** no new env vars. **Breaking changes:** none.

---

## 8. Follow-ups for 12.2+

The ledger is deliberately general, so the rest of Phase 12 needs no schema change:
- **12.2 Streaks/achievements** — badge unlocks are just derived queries over `xp_events`
- **12.3 Leaderboards** — `SUM(points) GROUP BY user_id WHERE revoked_at IS NULL`
- **12.4 Goals/quests** — express as event predicates; the rule registry already supports params
- **Per-user rule params** are supported by `resolveParams` but not yet surfaced in the UI
