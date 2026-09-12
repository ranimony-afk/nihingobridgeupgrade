# Phase 03.3 — SRS Schema

**Date:** 2026-03-25
**Gate status:** PASS

---

## Deployment gate: create / review / reschedule test passes

```
ok 59 - gate: a card is created in the new state and is immediately due
ok 60 - gate: reviewing a card logs the review and reschedules it
ok 61 - gate: successive reviews grow the interval and accumulate history
ok 62 - gate: forgetting a card records a lapse and shortens the interval
ok 63 - gate: the due queue returns only cards that are actually due
```

The cycle is proven end to end:

| Step | Verified |
|---|---|
| **Create** | card starts `new`, zero reps, no memory state, immediately due |
| **Review** | review row logged with before/after state; card advances to `learning` |
| **Reschedule** | due date moves into the future, interval set, card leaves the queue |
| **Repeat** | three successive reviews produce intervals 1 → 4 → 11 days |
| **Lapse** | `again` increments lapses, collapses interval, lowers stability, raises difficulty |
| **Queue** | only past-due, unsuspended cards surface |

Full integration suite: **71 tests, 71 pass**.

---

## The four tables

| Table | Holds | Why separate |
|---|---|---|
| `srs_decks` | learner's collections, per-deck limits | — |
| `srs_cards` | **what** to study: item, direction, deck | written once; stable identity |
| `srs_schedule` | **when** to study it: FSRS state, due, suspension | rewritten every review; the only table the due-query touches |
| `srs_reviews` | append-only history with before/after state | input to FSRS parameter optimisation |

Splitting cards from schedule means "reset this card's scheduling" does not
disturb card identity or its review history, and the hot path is one narrow
index scan instead of a join.

Suspension lives on the **schedule**, not the card, because suspending is a
scheduling decision — not a change to what the card is. That also keeps the
due-query single-table, served by a partial index that already excludes
suspended rows.

`cardCount` is deliberately **not** stored on decks, consistent with course
progress in 03.2: a stored aggregate drifts the moment anything writes outside
the one path maintaining it.

---

## Append-only is enforced, not just documented

The review log is the input to FSRS parameter optimisation — the optimiser
replays a learner's full history to fit weights. A silently edited row would
corrupt that fit in a way nothing downstream could detect.

So `0005` installs a trigger:

```sql
CREATE TRIGGER srs_reviews_no_update BEFORE UPDATE ON "srs_reviews" …
```

A test proves an `UPDATE` is rejected with `/append-only/` and the original
rating is unchanged. I also verified at the database level that **cascade
deletes still work** — deleting a card removes its reviews (`reviews after
cascade: 0`) while direct edits stay blocked. The trigger is scoped precisely,
not a blunt lock.

---

## Cross-user leakage made impossible

I verified PostgreSQL's behaviour before relying on it, then adopted the
composite-key pattern flagged as worth taking from Repository B in the Phase 00
audit:

```
foreignKey({ columns: [deckId, userId],
             foreignColumns: [srsDecks.id, srsDecks.userId] })
```

A card can only sit in a deck owned by the same learner. Without it, a mis-set
`deckId` would silently expose one learner's study material inside another's
deck. A test proves Bob cannot file a card into Alice's deck.

---

## FSRS invariants in the database

Four constraints make an incoherent schedule row unwritable, even by a buggy
scheduler or a manual `UPDATE`:

| Constraint | Prevents |
|---|---|
| `srs_schedule_new_state_check` | a "new" card with reviews, or a reviewed card still marked new |
| `srs_schedule_lapses_bound_check` | more lapses than reviews |
| `srs_schedule_review_requires_memory_check` | a `review`-state card with no stability or difficulty |
| stability > 0, difficulty 1–10 | out-of-range memory parameters |

This matters because the freeze makes scheduling **server-authoritative**.
Constraints are what make that structural rather than a convention.

---

## Scope boundary

The FSRS **algorithm** is Phase 05 per the dependency gates. These tests supply
scheduler-shaped values directly, proving the schema supports the cycle without
standing up a second scheduler that would later need reconciling with the
canonical one. The freeze is explicit that exactly one scheduler may exist;
implementing a throwaway here would violate it to satisfy a schema gate.

---

## Three test bugs found and fixed

All three failures were mine, not the schema's:

1. **Type inference** — a parameter used as both integer and string; replaced
   with `make_interval(days => $n)`.
2. **Constraint working correctly** — my due-queue fixture inserted
   `state = 'review'` rows and set stability in a *later* UPDATE, so
   `srs_schedule_review_requires_memory_check` rejected the insert. The
   constraint was right; the fixture was wrong.
3. **Missing savepoint** — an expected rejection aborted the transaction before
   the follow-up assertion could run.

In each case I fixed the test rather than relaxing the constraint.

---

## Verification

| Layer | Tests | Result |
|---|---|---|
| Unit | 89 | pass |
| **Integration** | **71** (+13 SRS) | **pass** |
| API + smoke | 60 | pass |
| Migration gate | 52 checks × 2 databases | pass |
| **Total** | **220** | **pass** |

Three-migration rollback (SRS → learning → knowledge) verified with a
byte-identical fingerprint on re-apply, including removal of the trigger
function. `npm run verify` passes end to end.

---

## Gate approval

- [x] `srs_decks`, `srs_cards`, `srs_reviews`, `srs_schedule` implemented
- [x] **Create / review / reschedule test passes**
- [x] Lapse handling and due-queue filtering verified
- [x] Append-only review log enforced by trigger, cascade deletes unaffected
- [x] Cross-user deck assignment impossible
- [x] Rollback written, executed, fingerprint-verified
- [x] `npm run verify` passes
- [x] **APPROVED**
