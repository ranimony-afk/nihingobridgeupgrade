# Phase 26C — Read authorization for the XP ledger route

**Scope:** `GET /api/xp/ledger` — stop anonymous and cross-user reads of the raw
per-user XP event feed, and stop the handler leaking internal error text.

Prepared 2026-10-28 · branch `arena/54293cff-nihingobridgeupgrade`
· code commit `9a62a4a` · base `686918b` · PR #21 (additive; PR not restructured)

---

## A. Verdict

**PASS.**

`GET /api/xp/ledger` was the last unauthenticated per-user read on the XP
surface, and it disclosed the most: for any `userId` named in the query string
it returned every event `id`, `ruleKey`/`ruleVersion`, `points`, `basePoints`,
`multiplier`, `sourceType`, `sourceId`, `breakdown`, `revokedAt`,
`revokedReason` and `occurredAt` — plus `total`, `totalXp`, `level` and the
level `curve`. With `userId` omitted it fell back to the shared
`anonymous-user` bucket.

The handler now authenticates before it reads the query string or touches the
database, resolves the requested identity against the verified actor, and
passes only that verified id to the service. Its second defect — the `catch`
block echoing `error.message` (failing SQL, bound parameters including the user
id, and DSN fragments) with no `code` and no `Cache-Control` — is closed with
the existing Phase 24 diagnostics.

**17 of 21 new tests fail on the previous implementation; all 21 pass on the
fix.** Phase 26B, 26A, 25 and 24 suites are unchanged and green; the
full-suite failure set is identical to the pre-change baseline.

---

## B. Repository identity

| Item | Value |
| --- | --- |
| Repository | `/home/user/nihingobridgeupgrade` |
| Branch | `arena/54293cff-nihingobridgeupgrade` |
| HEAD at preflight | `686918b75fda97bff03c6de4280407a317a72078` (expected) |
| Upstream divergence | 0 ahead / 0 behind at preflight |
| Worktree at preflight | clean |
| Ahead of `origin/main` (`cf7a4c6`) | 15 commits (now 16) |
| PR #21 at preflight | OPEN · MERGEABLE · CLEAN · head `686918b` |
| HEAD after this phase | `9a62a4a0e260c5373152f639f57bcd6c45b4b4bf` |
| Push | `686918b..9a62a4a` → `origin/arena/54293cff-nihingobridgeupgrade` only |

No reset, clean, rebase, force-push, amend or branch switch was performed.
Phase 25, 26A and 26B implementations and tests were verified present before
any edit.

---

## C. The defect (reproduced, not assumed)

Baseline handler:

```ts
const userId = sp.get("userId") || "anonymous-user";
const { entries, total } = await XpService.getLedger({ userId, ... });
const totalXp = await XpService.getTotalXp(userId);
...
} catch (error) {
  const message = error instanceof Error ? error.message : "Failed to load XP ledger";
  console.error("GET /api/xp/ledger error:", error);
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}
```

Two defects:

- **D1 — no identity at all.** No `authenticateActor`, no ownership check, a
  caller-controlled `userId`, and an `anonymous-user` default. Cross-user read
  of the rawest XP data in the app was a single query parameter away.
- **D2 — unsanitized failure.** `error.message` was echoed to the client (it
  carries the failing SQL and its bound parameters), the raw thrown value was
  logged, the response had no `code`, and no `Cache-Control: no-store` — so an
  error response was also cacheable.

### Live pre-fix disclosure (PGlite, production DDL, synthetic rows)

```
PROBE_FOREIGN  status=200  cacheControl=null  total=1  totalXp=5  sourceId=victim-secret-item
PROBE_ANON     status=200  total=0
```

An unauthenticated request naming another user's id returned that user's event,
its XP total, and its source id, and the response was cacheable.

### Contract traced before changing anything

- **Reads only.** `XpService.getLedger` issues a count and a paged `SELECT`;
  `getTotalXp` is an aggregate. Neither calls `syncRegistry` nor writes.
- **Response contract.** `{ success, entries[], total, totalXp, level, curve }`;
  entries expose `id`, `eventType`, `ruleKey`, `ruleVersion`, `points`,
  `basePoints`, `multiplier`, `sourceType`, `sourceId`, `breakdown`,
  `revokedAt`, `revokedReason`, `occurredAt`.
- **Pagination/filter params.** `limit` (default 50), `offset` (default 0),
  `eventType` (optional, unvalidated passthrough). All three are preserved
  verbatim; only `userId` changes semantics.
- **Consumers.** No in-repo caller of `/api/xp/ledger` exists (only gate-report
  prose and the generated `.next/types/routes.d.ts`), and no pre-existing ledger
  test file exists — so this change weakens no existing test. External clients
  cannot be ruled out; the compatibility delta is stated in §H.
- **Behaviour vs. contract conflict.** None for authenticated self-reads: the
  success payload, pagination defaults and curve block are byte-for-byte the
  same shape. The only intentional break is anonymous and foreign reads, which
  are the defect.

---

## D. Authorization matrix (implemented)

| Caller | `userId` in query | Result |
| --- | --- | --- |
| anonymous | absent | **401**, `success:false`, `no-store`; services never called |
| anonymous | `victim-1` | **401** — a query parameter confers no identity |
| authenticated | absent | **200**, own ledger (`getLedger`/`getTotalXp` receive the actor id) |
| authenticated | own id | **200**, own ledger |
| authenticated | foreign id | **403**, `no-store`; services never called |
| authenticated (any role: learner / editor / admin / owner) | foreign id | **403** — no role bypass |
| authenticated | `userId=` / blank / repeated | **400**, `no-store`; services never called |
| identity pipeline failure | any | sanitized **500** (`code: INTERNAL_ERROR`), not a 401 |
| any | DB failure | sanitized **500** with `no-store`, no SQL/params/DSN |

Authorization precedes query interpretation and every service/database call;
rejections produce zero reads of the ledger service and zero writes.

---

## E. Changes

Four files, 751 insertions / 14 deletions:

| File | Change |
| --- | --- |
| `src/app/api/xp/ledger/route.ts` | `authenticateActor()` → `resolveQueryIdentity(auth.actor, sp.getAll("userId"))` → `queryIdentityFailureResponse()`; verified `identity.userId` passed to `getLedger()`/`getTotalXp()`; catch replaced with `logOperationFailure()` + `{ success:false, error:"Failed to load XP ledger", code:"INTERNAL_ERROR" }`, 500, `Cache-Control: no-store` |
| `src/lib/logging/safeDiagnostics.ts` | one member added to the closed `DiagnosticOperation` union: `"XpService.getLedger"` |
| `tests/xp-ledger-read-authorization.test.ts` | new, 21 tests |
| `.github/workflows/ci.yml` | the new suite registered in the explicit Vitest list |

No new dependency, no new logging framework, no schema change, no migration, no
change to any sibling route, no change to `XpService` itself. `getTotalXp`'s
`"anonymous-user"` default parameter is untouched — the four other call sites
(write/summary paths) are out of scope and still pass an explicit id.

---

## F. Evidence

### Falsification (tests written first, run against `686918b`)

Baseline was recorded twice: on the working tree before the fix, and on a
disposable tree rebuilt from `git archive 686918b` (plus the new test file and a
`node_modules` symlink) so the evidence does not depend on the working tree.

| Tree | Result |
| --- | --- |
| `686918b` + new tests (pre-fix) | **17 failed / 4 passed** (21) |
| working tree (post-fix) | **21 passed** (21) |

Passing pre-fix (4): "an explicit self `userId` is accepted" and the three
response/pagination-contract tests — i.e. exactly the behaviour that must not
regress. Every authorization, sanitization and real-SQL test failed pre-fix,
with assertions of the form `expected 200 to be 403`, `expected 'anonymous-user'
to be 'learner-1'`, `expected 500 to be 401`, `expected 'GET /api/xp/ledger
error: …' not to contain 'SENTINEL_P26C'` and `expected undefined to be
'INTERNAL_ERROR'`.

Post-fix probe, same fixtures: `401` anonymous · `403` foreign · `200` own.

### Zero-read / zero-write proof

- Authorization-block tests assert `getLedger` and `getTotalXp` are **not
  called** for every rejection (anonymous, foreign, all four roles, empty,
  blank, repeated), so a rejected request performs no read at all.
- The PGlite block snapshots `id, user_id, points, revoked_at` for every row,
  issues three authorized `GET`s plus 401, 403 and 400 rejections, and asserts
  the snapshot is **identical** afterwards.
- Test 19 additionally re-counts the victim's rows after the 403 to prove the
  rejected cross-user attempt left them untouched.

### Gates

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean (exit 0) |
| Lint | `npm run lint` | 0 errors, 3 pre-existing warnings |
| Build | `npm run build` | exit 0 (`next-env.d.ts` reverted, `tsconfig.tsbuildinfo` removed) |

Targeted suites (all pass, nothing weakened or skipped):

| Suite | Result |
| --- | --- |
| `xp-ledger-read-authorization` (new) | 21 passed |
| `xp-analytics-read-authorization` (26B) | 23 passed |
| `xp-read-path-write-isolation` | 6 passed |
| `xp-dedupe-isolation` (26A) | 18 passed, 3 skipped |
| `xp-analytics-error-sanitization` | 16 passed |
| `xp-analytics-write-authorization` (25) | 33 passed |
| `xp-analytics-write-route-sanitization` | 36 passed |
| `questions-post-authorization` (25) | 55 passed, 1 skipped |
| `questions-get-error-sanitization` (24) | 12 passed |
| `seeding-log-sanitization` (24) | 16 passed |

Full suite, against the pre-change baseline:

| Metric | Baseline (`686918b`) | After (`9a62a4a`) |
| --- | --- | --- |
| Failing files | 23 | **23 (identical set)** |
| Failed tests | 103 | **103** |
| Passed | 1207 | **1228** (+21 = exactly the new suite) |
| Skipped | 131 | **131 (unchanged — no silent skips)** |

The 23 failing files are the pre-existing, environment-dependent
dictionary/kanji/JLPT/ETL suites, untouched by this change.

### Engines, stated precisely

- **Stub layer** (tests 1–17): real route handler and real `authenticateActor` /
  `resolveQueryIdentity` with the Phase 25 auth seams (`FakeUserStore`,
  `setSupabaseClientFactory`); the two XP service methods are spies, so these
  tests prove *authorization and sanitization*, not SQL.
- **PGlite layer** (tests 18–21): real route + real `XpService` against real
  PostgreSQL SQL on an emulated engine, using production DDL extracted from
  `drizzle/0000_*.sql` (`xp_events`, plus `srs_user_settings` and `srs_reviews`
  which the award/level paths read). This proves own-rows-only reads, real
  pagination/filtering and zero mutation.
- **Not exercised:** an actual PostgreSQL server, real Supabase, concurrent
  requests (PGlite serialises statements), and any deployed environment.

### CI

| Run | SHA | Result |
| --- | --- | --- |
| `40665452565` | `9a62a4a` (code) | **success** — `Install · Schema · Test · Typecheck · Lint · Build` |
| (report commit) | see PR #21 checks | verified after push |

---

## G. Delivery

- Commit `9a62a4a` — scoped implementation, tests and CI registration.
- Pushed only to `origin/arena/54293cff-nihingobridgeupgrade`
  (`686918b..9a62a4a`).
- Report commit separate (`reports/gates/PHASE-26C-XP-LEDGER-READ-AUTHORIZATION.md`).
- PR #21 updated with a separate Phase 26C section.
- No merge, no deploy, no production database access, no ingestion, no Windows
  checkout changes.

---

## H. Remaining risks / compatibility

- **Intentional break:** anonymous and cross-user ledger reads now return
  401/403. In-repo code is unaffected (no consumer). Any external client that
  relied on reading a `userId` other than its own — or on the `anonymous-user`
  bucket — breaks by design.
- **`eventType` is still an unvalidated passthrough** (also `limit`/`offset`
  accept `parseInt` results including `NaN`). This is pre-existing and was
  deliberately not changed: validation beyond the `userId` contract was out of
  the authorized scope. Tracked as follow-up **N5**.
- **`getTotalXp`'s `"anonymous-user"` default parameter** still exists in the
  service. The ledger route no longer relies on it, but a future caller could.
  Tracked as follow-up **N6** — hardening it changes a shared helper's contract
  and needs its own call-site audit.
- **Ten sibling route files still default to `anonymous-user`** (unchanged scope):
  `srs/{decks,personal,personal/lifecycle,sessions,settings,stats,sync}`,
  `knowledge/srs`, `jlpt/progress`, `quiz/analytics`. The `"anonymous-user"`
  occurrences left in `xp/route.ts` and `analytics/route.ts` are comments
  describing its removal.
- Rate limiting (D-13), sign-in UI, N3 (DELETE foreign-key oracle) and N4
  (client-supplied `occurredAt`/`dedupeKey`) remain open.
- **Public beta remains BLOCKED.**

---

## I. Next recommended phase

**Phase 26D — sweep the remaining `anonymous-user` defaulting routes**, one
route at a time, using the now-established
`authenticateActor → resolveQueryIdentity` boundary and this report's test shape
(stub block for the matrix, PGlite block for real SQL). Start with a read-only
inventory of the remaining occurrences to size the work before any edit.

An alternative bounded first step, if a cheaper win is preferred: harden
`getTotalXp` (N6) so its `"anonymous-user"` default parameter cannot be reached
by omission. Its remaining callers are all internal `XpService` methods
(`getSummary`, `award`, `awardSafe`, `levelForUser`) plus the ledger route, and
every one of them passes an explicit id today — so the default is dead code
that only an omission could resurrect.
