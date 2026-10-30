# Phase 26B — Authorization for the XP and analytics READ routes

**Scope:** `GET /api/xp`, `GET /api/analytics` — stop anonymous and cross-user
reads of XP and analytics data by reusing the Phase 25 authentication and
self-identity boundary.

Prepared 2026-10-28 · branch `arena/54293cff-nihingobridgeupgrade`
· code commit `9765844` · PR #21 (additive; PR not restructured)

---

## A. Verdict

**PASS.**

Both read handlers now authenticate before they interpret the query string or
touch the database, and serve only the verified actor's own data. The
`anonymous-user` fallback is gone, a foreign `userId` is a sanitized 403, an
empty or repeated one is a 400, and no role — including `admin` — has a
cross-user read bypass.

**17 of 23 new tests fail on the previous implementation; all 23 pass on the
fix.** Phase 26A, Phase 25 and Phase 24 suites are unchanged and green; the
full-suite failure set is identical to the pre-change baseline.

---

## B. Repository identity

| Item | Value |
| --- | --- |
| Repository | `https://github.com/ranimony-afk/nihingobridgeupgrade` |
| Branch | `arena/54293cff-nihingobridgeupgrade` |
| HEAD before this phase | `ac7f4d083369f03250ff4f460e4f3be321856023` (matched the expected value) |
| HEAD after code commit | `9765844e996fc6f9414ed999db74cc77fe54e47b` |
| Upstream | `origin/arena/54293cff-nihingobridgeupgrade`, 0 ahead / 0 behind before the change |
| Worktree before | clean; Phase 26A migration, snapshot and tests present |
| `origin/main` | `cf7a4c673236af2f507af8529dae0946fbed3bdf` |
| PR #21 | OPEN, `MERGEABLE`/`CLEAN`, CI green on `ac7f4d0` at start |

The environment was **not** reverted this time: the previous session's recovery
held (branch ref `ac7f4d0`, upstream tracking, clean worktree). No recovery
action was needed or taken.

---

## C. The defect (reproduced, not assumed)

```ts
// GET /api/xp                    // GET /api/analytics
const userId = sp.get("userId") || "anonymous-user";
```

No authentication, no ownership check, and the serving identity came straight
from the query string. Direct probe against `ac7f4d0` (disposable PGlite, real
SQL, victim row already in the ledger):

```
PROBE_LEAK   status=200 userId=victim-1 totalXp=5 recentSource="secret-item"
PROBE_ANON   status=200 userId=anonymous-user
```

An **unauthenticated** request read another learner's XP total and their study
source id. This is the read half of the same resource Phase 25 protected on the
write side; the pair was asymmetric.

### Consumers and the compatibility change

| Consumer | Evidence | Effect |
| --- | --- | --- |
| `src/app/progress/page.tsx:45` `fetch("/api/xp?historyDays=14")` | only in-repo caller of either GET | must now be signed in; it omits `userId`, so it resolves to the actor — **no code change needed** |
| External clients / Flutter app | route comments; no in-repo evidence | **must now hold a session**; a `userId` naming another learner is refused |
| Nothing in-repo | `grep -rn "api/xp\|api/analytics" src/` | no anonymous consumer exists in the repository |

**Compatibility change, stated plainly:** these reads are no longer public. Any
external client reading another user's XP/analytics — or reading anonymously —
breaks by design. The product consequence is bounded by the standing blocker
that there is still **no sign-in UI**, so real browsers cannot obtain a session
yet; the progress page will render its loading state until that exists. This is
the same trade Phase 25 accepted for writes.

---

## D. Authorization matrix (implemented)

| Case | Response | Service reached? |
| --- | --- | --- |
| no verified identity | **401** `{ error: "Authentication required.", code: "UNAUTHENTICATED" }` + `no-store` | no |
| `userId` omitted | 200, the actor's own data | yes, with the actor id |
| `userId` === actor | 200, the actor's own data | yes, with the actor id |
| `userId` foreign (any role) | **403** `{ error: "You do not have permission…", code: "FORBIDDEN" }` + `no-store` | no |
| `userId` empty / blank | **400** `{ error: "userId must be a single non-empty value" }` + `no-store` | no |
| `userId` repeated | **400**, same message (ambiguous, not "first wins") | no |
| identity pipeline throws | **500** `INTERNAL_ERROR` + `no-store`, classified diagnostic | no |

Query values are always strings, so the query transport is handled explicitly:
`resolveQueryIdentity(actor, searchParams.getAll("userId"))` in
`src/lib/auth/learningIdentity.ts`. It deliberately does **not** reuse the
JSON-body rule, where `""` is indistinguishable from an absent key; on a read,
guessing which user was meant decides whose data is returned, so empty and
repeated parameters are refused rather than coerced. Comparison is exact —
padded or differently-cased ids are foreign — and there is no trimming that could
turn a near-miss into the actor's identity.

No role check is involved anywhere: the rule is ownership, so `admin` gets the
same 403 as `learner` (asserted for all four roles), and every role can still
read its own data.

---

## E. Changes

| File | Change |
| --- | --- |
| `src/lib/auth/learningIdentity.ts` | **added** `resolveQueryIdentity()` + `QUERY_IDENTITY_MALFORMED_MESSAGE` — pure, total, no I/O |
| `src/app/api/_shared/authorizationResponse.ts` | **added** `queryIdentityFailureResponse()` (400/403 mapping, `no-store`) |
| `src/lib/auth/index.ts` | barrel exports |
| `src/app/api/xp/route.ts` | `GET`: `authenticateActor("Failed to load XP summary")` first, then query identity, then `getSummary(identity.userId, …)` |
| `src/app/api/analytics/route.ts` | `GET`: same pattern, `getUserProgressSummary(identity.userId)` |
| `tests/xp-analytics-read-authorization.test.ts` | **new** — 23 tests |
| `tests/xp-analytics-error-sanitization.test.ts` | authenticated seam added; the two `anonymous-user` expectations now name that actor; the "documented userId parameter" case uses a self id and additionally asserts 403 for a foreign one |
| `tests/xp-read-path-write-isolation.test.ts` | authenticated seam added after the module reset; same two expectations updated |
| `.github/workflows/ci.yml` | new suite registered in the PostgreSQL test step |

Not touched: `POST`/`DELETE` authorization, XP deduplication, schema, migrations
(no migration needed — this phase changes no persistence), and every other
learning route.

---

## F. Evidence

### Falsification (tests written first, run against `ac7f4d0`)

```
Tests  17 failed | 6 passed (23)
  × 1-5   anonymous reads: expected 500/200, got no 401 (service still reached)
  × 6,7   foreign userId: no 403
  × 8     no-role-bypass matrix
  × 9     omitted userId resolves to actor ('anonymous-user' instead)
  × 12,13 analytics envelope scoped to actor
  × 14,15 empty / repeated userId not refused
  × 16    validation not distinguishable from authorization
  × 19    identity failure not a 500 (no identity existed to fail)
  × 20    two users' ledgers not isolated (own read returned the anonymous one)
  × 21    rejected reads were not rejected at all
```

On the fix: **23 passed**. The 6 that passed on the vulnerable code are the ones
asserting behaviour that already existed (self-`userId` acceptance, response
envelopes, sanitized 500s, write-route 401/403, write-free reads).

### Zero-read / zero-write proof

* Rejections are asserted to **not call** `XpService.getSummary` /
  `AnalyticsService.getUserProgressSummary` at all (`toHaveBeenCalledTimes(0)`);
  test 5 additionally asserts the `@/db` boundary is never reached.
* PGlite block: rejected reads (401/401/403/400) leave the ledger rows
  byte-identical; three authorized reads also leave them identical and issue no
  writes; two users hold separate ledgers and each read returns only its own
  total (`learner-1` → 5, victim's ledger unreadable and never named).

### Gates

| Check | Result |
| --- | --- |
| `tests/xp-analytics-read-authorization.test.ts` (new, 23) | **23 passed** |
| Same suite on `ac7f4d0` | **17 failed / 6 passed** |
| `tests/xp-dedupe-isolation.test.ts` (Phase 26A, 18) | 15 passed / 3 skipped (PG block) |
| `tests/xp-analytics-write-authorization.test.ts` (Phase 25, 33) | 33 passed |
| `tests/xp-analytics-write-route-sanitization.test.ts` (Phase 24, 36) | 36 passed |
| `tests/xp-analytics-error-sanitization.test.ts` (Phase 23, 16) | 16 passed |
| `tests/xp-read-path-write-isolation.test.ts` (6) | 6 passed |
| questions auth / GET / seeding (83) | 82 passed, 1 pre-existing skip |
| Combined focused run (6 suites) | **129 passed / 3 skipped** |
| typecheck | clean |
| lint | 0 errors, 3 pre-existing warnings |
| `next build` | exit 0 (`next-env.d.ts` reverted, `tsconfig.tsbuildinfo` removed) |
| Full suite | **103 failed / 1207 passed / 131 skipped** vs baseline **103 / 1169 / 128**; failing-file set **identical** (23 files); +38 passes = 23 new + 15 carried from 26A |
| CI on `9765844` (run `40661536687`) | **success** — Install, Schema, Test (PostgreSQL step, now including this suite), Typecheck, Lint, Build, no-DB-at-boot |

### Engines, stated precisely

* **PGlite** — 3 of the new tests run real SQL (DDL from
  `drizzle/0000_absurd_emma_frost.sql` + the Phase 26A migration) on an
  **emulated** PostgreSQL. No engine is a PostgreSQL server.
* **Service-spy layer** — 20 of the new tests assert authorization outcomes and
  "service not reached" with the real auth pipeline and real route handlers, no
  database. This is why `GET /api/analytics`'s SQL is not exercised here:
  `getUserProgressSummary` seeds several unrelated tables and the isolation claim
  does not depend on its queries.
* **Genuine PostgreSQL** — none of the new tests run against a server. The CI
  step that does run against PostgreSQL now includes this suite, so the
  authorization paths at least execute in that environment; the DB-backed
  isolation assertions remain PGlite-only and are labelled as such.

---

## G. Delivery

* `9765844` — implementation + tests + CI registration, pushed to the task branch.
* This report — separate documentation commit.
* PR #21 updated with a separately headed Phase 26B section.

**No merge, no deployment, no production database access, no ingestion, no
Windows checkout touched.**

---

## H. Remaining risks / compatibility

1. **Breaking change for external clients.** Both reads now need a session and
   refuse a foreign `userId`. There is still no sign-in UI, so the progress page
   cannot load data for a real browser yet — the dominant product blocker and the
   reason public beta stays blocked.
2. `POST /api/xp` still accepts a client-chosen `dedupeKey` and `occurredAt`
   (backdating, N4 — open).
3. `DELETE /api/xp` still distinguishes a foreign key (403) from an unknown one
   (200 `revoked:false`) — N3, open.
4. Seventeen sibling routes still default `userId` to `"anonymous-user"`, several
   of them reads (`api/xp/ledger`, `api/srs/*`, `api/jlpt/progress`,
   `api/knowledge/srs`, `api/quiz/analytics`) — same class, separate phases.
5. `historyDays` remains unvalidated (`parseInt` of garbage → `NaN`), unchanged
   and now reachable only by an authenticated owner.
6. No rate limiting (D-13).
7. The progress page does not yet surface a 401 distinctly — it shows its loading
   state. A small UI follow-up, out of scope here.

---

## I. Next recommended phase

**Phase 26C — the sibling read/write families** (`api/xp/ledger`, `api/srs/*`,
`api/jlpt/progress`, `api/knowledge/srs`, `api/quiz/analytics`), applying this
same boundary one family per patch, starting with the ones that expose another
user's ledger. Then the sign-in UI, which now gates almost every learning view.
