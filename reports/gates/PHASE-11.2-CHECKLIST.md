# PHASE 11 GATE CHECKLIST — Prompt 11.2: Review Session

- **Phase**: Phase 11 — Spaced Repetition System
- **Scope**: Prompt 11.2 only (*Review session*)
- **Status**: COMPLETE & VERIFIED
- **Target**: Repository A (`https://github.com/ranimony-afk/nihingobridgeupgrade`)

---

## 1. What Was Built

Prompt 11.1 left grading working but the study loop was **client-side state only** — lost on refresh,
no resume, no undo, no pacing budget, no session report. Prompt 11.2 replaces that with a
**persisted, resumable session engine** and removes the duplicate inline engine from the dashboard.

### Design decision: derived progress, single source of truth

The session table stores **only** the plan (queue + config). Cursor, rating counts, accuracy,
duration, and new-cards-introduced are all **derived from `srs_reviews.session_id`**.

Consequence: session progress can never drift from the audit log, and undo is a single
`DELETE` on the review row — the cursor and counters revert automatically.

---

## 2. Implementation Evidence

| Concern | Path | Symbol |
|---|---|---|
| Session types | `src/types/srs.ts` | `SrsReviewSession`, `SessionProgress`, `SessionCard`, `SessionSummary`, `SessionQueueOrder` |
| Session schema | `src/db/schema.ts` | `srsReviewSessions`, `srsReviews.sessionId` |
| Session engine | `src/services/srs/sessionService.ts` | `SessionService` |
| Grade-time linkage | `src/services/srs/srsService.ts` | `SrsService.gradeCard({ sessionId })` |
| APIs | `src/app/api/srs/sessions/**` | 5 route handlers |
| Study UI | `src/app/review/session/[id]/page.tsx` | keyboard-driven full-screen session |
| Dashboard | `src/app/review/page.tsx` | planner + resume + history (inline engine **removed**) |

### Queue planner features
- **New / review split** with independent limits and a hard `maxCards` cap.
- **Daily new-card budget** — enforced across all sessions per calendar day, derived from reviews
  where `state_before->>'repetitions' = '0'`.
- **4 queue orders** — `due`, `random`, `descending` (hardest first), `new-first`.
- **Proportional interleaving** — new cards spread evenly through reviews so new material is spaced
  out rather than clustered.
- **Frozen config snapshot** persisted on the session for reproducibility.

### Study UX features
- Live **interval preview per rating**, computed by that card's own registered algorithm.
- **Undo (U key)** — restores card from the review's immutable `state_before` snapshot.
- Keyboard shortcuts: `Space`/`Enter` reveal, `1–4` rate, `U` undo.
- Segmented progress bar coloured by rating; live accuracy; session clock.
- "Just answered" strip; per-card algorithm + phase telemetry.
- Auto-completion on queue drain; completion summary report.

---

## 3. API Surface

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/srs/sessions` | History + resumable pointer + daily usage + defaults |
| POST | `/api/srs/sessions` | Plan queue, open resumable session |
| GET | `/api/srs/sessions/[id]` | Current card, rating previews, progress, recent answers |
| PATCH | `/api/srs/sessions/[id]` | `action: "complete" \| "abandon"` |
| POST | `/api/srs/sessions/[id]/answer` | Grade card at cursor (**order-enforced**) |
| POST | `/api/srs/sessions/[id]/undo` | Revert last answer from snapshot |
| GET | `/api/srs/sessions/[id]/summary` | Full post-session report |

---

## 4. Verification Results

### 4.1 Validation commands
| Command | Result |
|---|---|
| `npx drizzle-kit push` | ✅ `srs_review_sessions` created + `srs_reviews.session_id` added (**additive only**) |
| `npx next typegen` | ✅ |
| `tsc --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ 5 new routes (`/api/srs/sessions/**`, `/review/session/[id]`) |
| `build_and_start` + `/api/health` | ✅ `{"ok":true}` |

### 4.2 Planning
```
sessionId: rsess-1789364348799-hj6bry
deck scope: All decks | schedulerKeys: [fsrs-lite, leitner-box, fixed-ladder, sm2]
planned: 2 new + 1 review = 3 cards
daily budget: 7 used / 20
```

### 4.3 Live rating previews (per-card algorithm)
```
card 新しい (sm2)  →  again: now(relearning) | hard: 1080m | good: 1d | easy: 2d
```

### 4.4 Answer flow + auto-completion
```
card-n5-vocab-001 good → 1d   progress 1/3  accuracy 100%
card-n5-vocab-002 easy → 4d
card-n5-vocab-003 good → 12m  sessionComplete: true  → status: completed
```

### 4.5 Order enforcement
```
POST answer with a stale cardId
→ {"success":false,"error":"Out-of-order answer: expected card-n5-vocab-003, received card-n5-vocab-002"}
```

### 4.6 Undo — exact snapshot restoration
```
BEFORE undo: sm2 | repetitions=0 | interval=0.0083 | phase=learning
UNDO   →  undone 正しい (good) | restored reps=0 interval=0 phase=learning
AFTER  undo: sm2 | repetitions=0 | interval=0      | phase=learning   ← matches snapshot
session: status completed → active, linked_reviews 3 → 2, cursor reverted
```

### 4.7 Daily budget enforcement
```
dailyNewBudget=0 → planned new: 0
skip note: "Daily new-card budget of 0 already used — session contains reviews only."
```

### 4.8 Interleaving (3 new + 6 review)
```
review:自転車 → review:Verb て-form… → new:毎朝 → review:毎日 → review:毎晩
→ new:毎日 → review:電車 → review:毎晩 → new:自動車
```
New cards land every 3rd position instead of clustering at the front.

### 4.9 Summary report
```
status: completed | 44s | 4.1 cards/min | 15 s/card
3 answered | 66.7% accuracy | byRating {again:1, hard:0, good:1, easy:1}
schedulerBreakdown: sm2@v1.2.0 — 3 ans, 66.7%, avg interval 1.67d
cardOutcomes: 3 | forecast days: 3 | weakestCards: [正しい (again)]
```

### 4.10 Regression — all green
| Feature | Result |
|---|---|
| Scheduler registry (11.1) | ✅ 4 plugins, keys + param counts unchanged |
| Direct grading (11.1) | ✅ `leitner-box@v1.1.0` → 1d |
| `/review` dashboard | ✅ HTTP 200 |
| `/review/session/[id]` | ✅ HTTP 200 |
| Phase 10 JLPT tests | ✅ 3 tests, N5 mock = 32 Qs |
| Phase 10 question bank | ✅ 32 questions |
| `/api/health` | ✅ `{"ok":true}` |

---

## 5. Deployment

```bash
npx drizzle-kit push      # additive: new table + one nullable column
npx next typegen
npm exec tsc -- --noEmit
npm run build
npm run start             # or: vercel --prod
```

**Environment:** no new env vars. `DATABASE_URL` only.
**Breaking changes:** none. `srs_reviews.session_id` is nullable, so 11.1's ad-hoc grading
endpoint continues to work unchanged (verified in §4.10).

---

## 6. Notes & Follow-ups

- **Data note:** verification output showed `newIntroduced` counting cards whose `repetitions`
  was 0 due to the deliberate SM-2→FSRS re-binding test performed in Prompt 11.1. This is correct
  behaviour of the metric, not a defect.
- **11.3** can now add: session goals/streaks, BFKleed "learning queue" for short-interval cards,
  and a `/review/history` analytics view — all build directly on `srs_review_sessions`.
- **11.4** per-user algorithm overrides can ride on the same `config` jsonb pattern.
