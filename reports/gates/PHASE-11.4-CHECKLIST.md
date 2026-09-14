# PHASE 11 GATE CHECKLIST — Prompt 11.4: SRS Synchronization

- **Phase**: Phase 11 — Spaced Repetition System
- **Scope**: Prompt 11.4 only (*SRS synchronization*)
- **Status**: COMPLETE & VERIFIED
- **Target**: Repository A (`https://github.com/ranimony-afk/nihingobridgeupgrade`)

---

## 1. What Was Built

The master prompt requires an API-first architecture where **web and Flutter consume stable domain
contracts without duplicating business logic**. Prompts 11.1–11.3 assumed a single well-behaved
client. Prompt 11.4 removes that assumption: a learner can now study on a phone offline and reconcile
with the server later, across multiple devices, without losing or double-counting reviews.

### Design decision: sync is event replay, never state overwrite

The defining choice. A device pushes **review events**, not card state. Each event is passed through
the card's registered scheduler and the card is written **once** per push batch.

Why this matters: if a device could push card state, it would
1. clobber server truth, and
2. silently bypass the scheduler — breaking the Prompt 11.1 contract that algorithms own scheduling.

This also preserves the invariant established in 11.2/11.3 that **`srs_reviews` is the single source
of truth**. Sync adds rows to that log; it never writes a parallel state table.

### Design decision: idempotency enforced in the database, not just the app

Each event carries a device-generated `clientId` backed by a **UNIQUE constraint**. Application code
checks for duplicates first (so a retry returns a clean report), but if that code ever regressed, the
database itself rejects the second insert. Verified directly in §4.4.

---

## 2. Implementation Evidence

| Concern | Path | Symbol |
|---|---|---|
| Device + log schema | `src/db/schema.ts` | `srsSyncDevices`, `srsSyncLog`, `srsReviews.clientId/deviceId` |
| Sync types | `src/types/srs.ts` | `SyncPushPayload`, `SyncPullResult`, `SyncReviewEvent`, `SyncDevice` |
| Sync engine | `src/services/srs/syncService.ts` | `SyncService`, `computeRegistryFingerprint` |
| APIs | `src/app/api/srs/sync/*` | `route.ts`, `push/route.ts`, `pull/route.ts` |
| UI | `src/app/review/sync/page.tsx` | Sync console + device roster + audit log |

### Protocol

| Step | Route | Behaviour |
|---|---|---|
| Register | `POST /api/srs/sync` | Idempotent per `(userId, deviceId)` — re-registration updates metadata, never duplicates |
| Snapshot | `GET /api/srs/sync/pull?snapshot=1` | Full state for fresh install / restore |
| Delta pull | `GET /api/srs/sync/pull?cursor=…` | Only cards/reviews changed since cursor |
| Push | `POST /api/srs/sync/push` | Idempotent event replay + conflict resolution |
| Status | `GET /api/srs/sync` | Device roster, sync log, totals |
| Revoke | `DELETE /api/srs/sync?deviceId=…` | Blocks a lost/wiped device permanently |

### Conflict resolution rule

If a device supplies `stateBefore` and it **differs from the server's current state**, the two
histories diverged. Resolution is deterministic: **rewind the card to the earliest device-recorded
`state_before` in the batch, then replay every event in order.** The device event stream wins for that
card — but no state is blindly overwritten, because every step still passes through the scheduler and
the `[conflict resolved]` marker is persisted in the review's `explanation` for audit.

### Registry fingerprint

`computeRegistryFingerprint()` produces a stable hash of registered algorithm keys, versions, and
parameter names. It is returned in every pull envelope and acknowledged per device, so a client can
detect that its bundled algorithm code is stale. This closes the loop on Prompt 11.1: a mobile app can
know when it must refresh its scheduler implementations.

---

## 3. Schema Changes (additive only)

- `srs_sync_devices` — new table
- `srs_sync_log` — new table (append-only audit)
- `srs_reviews.client_id` — new nullable UNIQUE column (idempotency key)
- `srs_reviews.device_id` — new nullable column (attribution)

**No existing table or column was dropped, altered, or truncated.**

> **Deployment note:** `drizzle-kit push` prompted to *truncate* `srs_reviews` when adding the UNIQUE
> constraint (7 existing rows). Truncation is forbidden by the standing rules, so the constraint was
> applied instead via `ALTER TABLE … ADD CONSTRAINT` after confirming **0 duplicate non-null
> client_ids**. Deployment commands below reflect the safe path.

---

## 4. Verification Results

### 4.1 Validation commands
| Command | Result |
|---|---|
| `npx drizzle-kit push` | ✅ 2 new tables; constraint applied via SQL (see §3) |
| `npx next typegen` | ✅ |
| `tsc --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ new routes `/api/srs/sync/**`, `/review/sync` |
| `build_and_start` + `/api/health` | ✅ `{"ok":true}` |

### 4.2 Device registration is idempotent
```
POST register test-phone-001 → created: True  (Learner iPhone, ios, v1.4.2)
POST register again          → created: False (no duplicate device row)
```

### 4.3 Snapshot vs delta pull
```
snapshot=1   → cards: 41 | reviews: 7 | decks: 4
delta cursor → cards: 2 | reviews: 0      ← only the 2 cards actually changed
```
Delta pull correctly excluded the 41 cards already delivered in the snapshot.

### 4.4 Idempotent replay (the core guarantee)
```
PUSH 2 offline events        → accepted=2 duplicates=0 cards=2
                               毎朝  → 1d   leitner-box@1.1.0
                               正しい → 12m  sm2@1.2.0
RE-PUSH identical events     → accepted=0 duplicates=2
                               => IDEMPOTENCY CONFIRMED — no double-apply
review rows for device       → 2  (not 4)

DB-level proof (unique constraint):
  INSERT guard-a (client_id=guard-test-1) → INSERT 0 1
  INSERT guard-b (same client_id)         → ERROR: duplicate key value violates
                                            unique constraint "srs_reviews_client_id_unique"
  rows with that client_id                → 1
```

### 4.5 Two-device conflict resolution
```
Server state after device-1 push: leitner-box | box=1 | interval=1 | total_reviews=1
Device-2 pushes 'again' claiming stale state_before (box=0)
→ accepted=1 conflicts=1 | conflict: True
→ "[conflict resolved] Box 0 → 1 (1d) after again (quality 0)."
```
The card was rewound to the device's declared base and the event replayed through the scheduler —
deterministic, auditable, and algorithm-mediated.

### 4.6 Delta pull returns only changed cards
See §4.3 — 2 cards returned against a 41-card snapshot baseline.

### 4.7 Revocation blocks sync
```
DELETE /api/srs/sync?deviceId=test-tablet-002 → "Device revoked"
POST /api/srs/sync/push (revoked device)      → "Device has been revoked and can no longer synchronize"
```

### 4.8 Audit trail with device attribution
```
test-phone-001   | pull     | 0  | 0 | 0 | Pulled 41 card(s), 7 review(s) (initial).
test-phone-001   | push     | 2  | 0 | 0 | Pushed 2 event(s) across 2 card(s)
test-phone-001   | push     | 0  | 2 | 0 | …2 duplicate(s) blocked
test-tablet-002  | push     | 1  | 0 | 1 | …1 conflict(s) resolved
test-tablet-002  | register | 0  | 0 | 0 | Device registered (ios)
```

### 4.9 Regression — all green
| Feature | Result |
|---|---|
| 11.1 scheduler registry | ✅ 4 plugins, keys unchanged |
| 11.2 session planning | ✅ session created |
| 11.3 daily queue | ✅ buckets + streak reporting |
| Phase 10 JLPT / question bank | ✅ `/api/health` ok |
| `/review/sync`, `/review/today`, `/review` | ✅ all HTTP 200 |

All synthetic test data (devices, sync rows, mutated cards) was **removed after verification**.

---

## 5. Deployment

```bash
# 1. Create the two new tables (safe, additive)
npx drizzle-kit push

# 2. Add the idempotency constraint non-destructively
#    (skip the interactive truncate prompt if drizzle-kit asks)
psql "$DATABASE_URL" -c "ALTER TABLE srs_reviews ADD CONSTRAINT srs_reviews_client_id_unique UNIQUE (client_id);"

# 3. Validate + deploy
npx next typegen
npm exec tsc -- --noEmit
npm run build
npm run start        # or: vercel --prod
```

**Environment:** no new env vars. `DATABASE_URL` only.
**Breaking changes:** none — `srs_reviews` gains two nullable columns.

---

## 6. Notes & Follow-ups

- **Conflict policy is deliberately simple.** "Device event stream wins, replayed through the
  scheduler" is deterministic and safe. True CRDT-style merge or per-field resolution would add
  complexity without clear learner benefit; it is documented as a future option, not built speculatively.
- `srs_sync_log.detail` stores the per-card push outcome JSON for debugging device-specific issues.
- **Future:** WebSocket/live push for real-time multi-device mirroring; client-side `since` filtering on
  push; Anki `.apkg` import/export as a sync transport.
