# Phase 25 — XP and analytics WRITE-path authorization

**Scope:** `POST /api/xp`, `DELETE /api/xp`, `POST /api/analytics` — attribute
every XP and study-event write to a verified server-side identity, and refuse
caller-controlled identity before any mutation.

Prepared 2026-10-28 · branch `arena/54293cff-nihingobridgeupgrade`
· code commit `d6b702c` · PR #21 (additive commit; PR not restructured)

---

## A. Executive verdict

**PASS WITH CONDITIONS.**

All three write routes now authenticate and authorize *before* validating,
reading or writing, and the acting user id comes from the verified actor — never
from the request. A body `userId` naming another user is refused with **403** and
performs **zero mutating statements**; a non-string `userId` is a **400** field
error, so validation stays distinguishable from authorization; anonymous writes
are **401**. **23 of 33 new tests fail on the previous implementation and all 33
pass on the fix.** Every Phase 24 sanitization assertion still passes (36/36).
The full-suite failing-file set is byte-identical to the Phase 24 baseline.

**Conditions (all require a user decision, none blocks review):**

1. The `DELETE /api/xp` policy was chosen as **owner-only** because the repository
   contains no evidence of an operator/organizational revocation role, and no
   XP or analytics administration permission exists in the model (§C.4, §K.1).
   Inventing an `admin`-may-revoke-anyone rule was explicitly out of bounds.
2. **Product consequence:** these endpoints have **no in-repo caller** (verified
   in §C.5), so no web UI breaks — but external clients (the route's own comment
   names the Flutter app) now need a session, and the app still has **no sign-in
   UI** (§H.1). Until that exists these writes are effectively unavailable to
   real users. That is the correct trade for closing an anonymous write, and it
   is recorded as a release blocker, not as a finished feature.
3. Legacy ledger rows written under the old `anonymous-user` fallback have no
   owner and are therefore no longer revocable over HTTP (§H.4).

---

## B. Repository identity

| Item | Value |
| --- | --- |
| Repository | `https://github.com/ranimony-afk/nihingobridgeupgrade` |
| Branch (pinned by session) | `arena/54293cff-nihingobridgeupgrade` |
| Baseline HEAD at start | `16e5aca53ae0b1984179ea097c2d37ea31a6592b` |
| Code commit | `d6b702c0d797add200d3a59d8f33d1b1f391e680` |
| `origin/main` | `cf7a4c673236af2f507af8529dae0946fbed3bdf` |
| PR | #21 — OPEN, `MERGEABLE` / `CLEAN` at baseline; **not merged, not deployed** |
| Stack | Next.js 16.3.6 · React 19.2.6 · Drizzle 0.45.2 · vitest 5 · PGlite |
| Worktree before change | clean; 0 unpushed; 9 ahead / 0 behind `origin/main` |
| CI baseline on `16e5aca` | green (all required checks) |

Baseline was re-verified live in this session rather than taken from the Phase 24
report: branch, HEAD, worktree, divergence, PR state and check-runs were all read
before any file was touched.

---

## C. Root cause and the trust boundaries involved

### C.1 — What was there before

| Route | Identity used | Consequence |
| --- | --- | --- |
| `POST /api/xp` | `(body.userId as string) \|\| "anonymous-user"` (`xp/route.ts:84`) | any caller awards XP **to any user id** |
| `POST /api/analytics` | `body.userId` forwarded into `AnalyticsService.trackStudyEvent` | any caller records study events **for any user** |
| `DELETE /api/xp` | none — revoked by `dedupeKey` alone | any caller revokes **anyone's** award |

`src/lib/auth` (the Phase 13.3A–13.4D boundary) already existed and was reused by
`POST /api/questions` in PR #20, but none of the three routes imported it. There
was no service-level authorization either: `XpService.award`,
`XpService.revokeByDedupeKey` and `AnalyticsService.trackStudyEvent` are pure
persistence and stay that way.

### C.2 — The boundary that was reused (not re-invented)

```
request → getAuthenticatedIdentity()  (auth.getClaims(): verified, signature-checked)
        → resolveApplicationUser()    (users row, provisioned as learner; race-safe)
        → CmsActor { id, role }       (normalizeActor: unknown roles → learner, frozen)
        → requireActor()              (401 when absent)
```

No new authentication mechanism, no service-role credential anywhere near the
client, no shared-secret header, no `process.env` bypass. `requireActor()` takes
no arguments, so there is no channel for a request value to become identity.

### C.3 — The policy implemented

New file `src/lib/auth/learningIdentity.ts` holds the whole decision, as a pure
total function (`resolveSelfIdentity(actor, claimed)`):

| Claimed `userId` | Outcome | HTTP |
| --- | --- | --- |
| absent, `null`, `""` | use the **verified** actor id | 200 on success |
| equal to the actor id | allowed (explicit self-report) | 200 on success |
| any other non-empty string | `foreign` | **403** `FORBIDDEN`, zero writes |
| non-string (`123`, `true`, `[]`, `{}`) | `malformed` | **400** `userId must be a string`, zero writes |

**No CMS permission is required or granted.** These are learning endpoints; a
`learner` holds zero CMS permissions, so requiring `cms.*` would have broken the
product for the only role that should use it — and granting `cms.*` to make a
learning endpoint work would invert the role model. Nothing in the codebase
defines XP or analytics administration, so no role is given a cross-user XP
bypass (§H.2 records that this remains impossible by design, and is asserted).

Validation order is **authorization → parse → field validation → identity claim →
write**. An anonymous caller therefore cannot use validation messages as an
oracle (test 26): `POST /api/xp` with a malformed body answers 401, not 400.

### C.4 — `DELETE /api/xp`: why owner-only, and what the alternative was

Revocation needs *ownership*, which the request does not carry — only a
`dedupeKey`. The route now reads the owner from the stored row
(`XpService.findEventOwner`, a single-column `SELECT … LIMIT 1`) and compares it
with the verified actor:

- owner === actor → the existing `revokeByDedupeKey` runs;
- owner exists and differs → **403**, no `UPDATE` executed;
- no such row → unchanged pre-existing contract `{ success: true, revoked: false }`.

`?userId=` in the query string is ignored entirely (test 10): query strings are
never identity.

**Decision evidence, not preference:**

1. No in-repo caller, no test, and no document describes an operator revocation
   console; the only `reason` value ever supplied in production code is the
   default `"manual-revoke"`, and the one in-domain reversal
   (`sessionService.revokeByDedupeKey("review:…")`) is a service call, not HTTP.
2. The permission model has **no** XP or analytics permission. Using a CMS
   permission (`cms.edit`, `cms.publish`, …) to gate XP revocation would be a
   category error, and minting a new `xp.admin` permission is a policy change
   that was explicitly not authorized for this phase.
3. Fail-closed default: if no permission expresses "act on another user's XP",
   then no caller may. A future operator console must introduce an explicit,
   audited permission — never a silent widening of this route.

`revokeByDedupeKey`'s signature and behavior are untouched, because its
service-level caller already acts for the row's owner.

### C.5 — Caller trace (done before changing any contract)

| Consumer | Evidence | Impact of this change |
| --- | --- | --- |
| Web app | `grep -rn "api/xp\|api/analytics" src/` → **one** hit, `src/app/progress/page.tsx:45` `fetch("/api/xp?historyDays=14")` | GET only — **unaffected** |
| `POST /api/xp` | none in-repo; route comment says clients + Flutter app report events | 401 without a session |
| `POST /api/analytics` | none in-repo (`AnalyticsService.trackStudyEvent` has no other HTTP caller) | 401 without a session |
| `DELETE /api/xp` | none in-repo; `sessionService.ts:673` revokes in-process | 401 without a session |
| Tests (Phase 24) | `tests/xp-analytics-write-route-sanitization.test.ts` | updated to run authenticated; assertions unchanged (§E.3) |

**Twenty other routes still default `userId` to `"anonymous-user"`**, several of
them writes (`src/app/api/knowledge/srs/route.ts`, `src/app/api/srs/personal/*`,
`src/app/api/srs/settings/route.ts`, `src/app/api/srs/sync/route.ts`,
`src/app/api/jlpt/progress/route.ts`, `src/app/api/xp/ledger/route.ts`, …). They
are the same class of defect. They are **not** touched here: the instruction was
to keep this patch bounded, and each has its own contract and callers.

---

## D. Changes

| File | Change |
| --- | --- |
| `src/lib/auth/learningIdentity.ts` | **new** — pure self-identity policy: `resolveSelfIdentity`, `SelfIdentityResolution`, `SELF_IDENTITY_MALFORMED_MESSAGE` |
| `src/app/api/_shared/authorizationResponse.ts` | **new** — transport glue only: `authenticateActor()` (401/403 canonical, other failures → sanitized 500 + classified log), `authorizationFailureResponse()`, `selfIdentityFailureResponse()` |
| `src/app/api/xp/route.ts` | `POST`: `authenticateActor` first, then parse/validate, then identity claim, then award with `identity.userId`; no `"anonymous-user"` fallback. `DELETE`: `authenticateActor`, then `dedupeKey`, then `findEventOwner` ownership gate, then revoke |
| `src/app/api/analytics/route.ts` | `POST`: `authenticateActor` first, identity claim before field validation, `trackStudyEvent({ userId: identity.userId, … })` |
| `src/services/gamification/xpService.ts` | **additive** — `static findEventOwner(dedupeKey): Promise<string \| null>`, one column, `LIMIT 1`, read-only; `revokeByDedupeKey` untouched |
| `src/lib/auth/index.ts` | barrel exports for the new module |
| `src/lib/logging/safeDiagnostics.ts` | two closed-vocabulary operations added: `auth.requireActor`, `XpService.findEventOwner` |
| `tests/xp-analytics-write-authorization.test.ts` | **new** — 33 tests across runtime stub, real auth pipeline, and disposable PGlite |
| `tests/xp-analytics-write-route-sanitization.test.ts` | Phase 24 suite made authenticated via `setActorResolver`; **no assertion removed or relaxed** |
| `.github/workflows/ci.yml` | new suite registered in the PostgreSQL test step |

Response shape: authorization failures are flattened into the routes'
**pre-existing flat envelope** `{ success: false, error: <generic message>, code }`
— the same translation `POST /api/questions` already performs — with
`Cache-Control: no-store`. Reusing `toErrorPayload`'s nested
`{ error: { code, message } }` would have restyled working clients for no benefit.

`AuthorizationError` messages are generic by construction
(`"Authentication required."` / `"You do not have permission to perform this action."`),
so 403 discloses that the claim was refused, not whose row exists.

---

## E. Security evidence

### E.1 — Falsification: the tests were written first

The 33-test suite was written **before** any implementation change and run
against baseline `16e5aca`:

```
Tests  23 failed | 10 passed (33)
 9 × AssertionError: expected 200 to be 401
 6 × AssertionError: expected 200 to be 403
 1 × AssertionError: expected 400 to be 401
 3 × AssertionError: expected 'anonymous-user' to be 'learner-1' / 'learner-self'
 2 × AssertionError: expected 200 to be 500
 + PGlite row-count failures (tests 31, 32)
```

Pre-fix behaviour observed, not inferred: anonymous `POST /api/xp`,
`POST /api/analytics` and `DELETE /api/xp` all returned **200**; a request
claiming `userId: "victim-1"` returned **200**; the ledger row was written with
`user_id = 'anonymous-user'` (or the claimed id), i.e. the spoof was persisted.

Re-running the identical suite after the fix: **33 passed**. Re-running it again
with the implementation stashed (`git stash push -- src/`) reproduced
**23 failed / 10 passed**; `git stash pop` restored **69/69** across the Phase 24
and Phase 25 suites. So the suite is sensitive to the vulnerability and stable on
the fix.

### E.2 — Zero-write evidence, two independent layers

1. **Statement recorder** (`@/db` stub): every `insert`/`update`/`delete` is
   recorded before it runs. Rejected requests (anonymous 401, foreign 403,
   malformed 400, validation 400) assert `mutations().length === 0`, including
   the failed writes for `POST /api/xp` from a foreign claim and `DELETE` on a
   foreign key (no `UPDATE` is issued at all).
2. **Disposable PGlite, real SQL** (tests 30–33): real `xp_rules` / `xp_events` /
   `srs_user_settings` / `srs_reviews` DDL from
   `drizzle/0000_absurd_emma_frost.sql`, real Drizzle adapter, real
   `XpService.award` path. Row counts are read back after each request:
   owner award → exactly one row with `user_id = 'learner-1'`; anonymous and
   spoofed awards → **zero** rows; foreign `DELETE` → `revoked_at` still `NULL`;
   owner `DELETE` → `revoked_at` set, one row; unknown key → zero rows created or
   changed.

PGlite is **not** PostgreSQL: this is emulated-engine SQL evidence. No real
PostgreSQL server, no production database, no production credentials, no
`srs`/`users` fixtures outside the disposable instance.

### E.3 — The Phase 24 guarantees still hold

`tests/xp-analytics-write-route-sanitization.test.ts` — 36 tests, **36 passed**.
The only change is the seam that makes each request an authenticated learner
(`setActorResolver(() => ({ id: "u-42", role: "learner" }))`) plus one body that
named a different user (`"u-1"` → the actor's id) so its 400 stays a *validation*
assertion rather than becoming a 403. Every sanitization, status, envelope,
cache-header and log-classification assertion is the original one — the file's
header now states this explicitly so a future reader cannot mistake the seam for
a relaxation.

Note for reviewers: `DELETE`'s failure tests still classify as
`XpService.revokeByDedupeKey failed [category=database_statement_rejected]`
because they fail the `UPDATE`; the ownership `SELECT` runs first and succeeds
there. A failure of the ownership read is separately covered as a sanitized 500
by Phase 25 test 28 with the `XpService.findEventOwner` operation name.

### E.4 — Failure classification, unchanged and extended

| Situation | Response | Log |
| --- | --- | --- |
| no session | 401 `UNAUTHENTICATED` | none (not an error) |
| foreign `userId` | 403 `FORBIDDEN` | none |
| non-string `userId` | 400 `userId must be a string` | none |
| unknown `eventType`, missing `itemType`/`itemId`, missing `dedupeKey`, malformed JSON (authenticated) | unchanged 400s | none |
| users row unreadable while the DB is down | **500** `INTERNAL_ERROR` (never 401 — a server fault is not the caller's fault) | `auth.requireActor failed [category=…]` |
| award / revoke / owner-read failure | unchanged sanitized 500 | classified operation name, no message, no stack |

The thrown value is never read for text, never serialized, and never logged; a
thrown `null`/`undefined`/string/plain object cannot raise inside the catch
(the Phase 24 shape matrix still exercises the routes that now authenticate).

---

## F. Verification matrix

| # | Check | Result |
| --- | --- | --- |
| 1 | `tests/xp-analytics-write-authorization.test.ts` (new, 33) | **33 passed** |
| 2 | Same suite on pre-fix code (falsification) | **23 failed / 10 passed** |
| 3 | `tests/xp-analytics-write-route-sanitization.test.ts` (Phase 24, 36) | **36 passed** |
| 4 | `tests/xp-analytics-error-sanitization.test.ts` (16) | **16 passed** |
| 5 | `tests/xp-read-path-write-isolation.test.ts` (6) | **6 passed** |
| 6 | `tests/questions-get-error-sanitization.test.ts` (12) | **12 passed** |
| 7 | `tests/seeding-log-sanitization.test.ts` (16) | **16 passed** |
| 8 | `tests/questions-post-authorization.test.ts` (55) | **54 passed / 1 skipped** (pre-existing PGlite-only case) |
| 9 | `npm run typecheck` | clean |
| 10 | `npm run lint` | **0 errors**, 3 pre-existing warnings (unchanged) |
| 11 | `env -u DATABASE_URL npm run build` | **exit 0** (`next-env.d.ts` reverted) |
| 12 | Full suite, no `DATABASE_URL` (1400 tests) | **23 failed files / 103 failed / 1169 passed / 128 skipped** |
| 13 | Failing-file set vs Phase 24 baseline (23 files, normalized) | **identical** (`diff` empty); passed count +33 = the new suite |
| 14 | CI on `d6b702c` (run `40646632662`) | **success** — Install/Schema/Test/Typecheck/Lint/Build, incl. the real-PostgreSQL test step that now lists this suite |

Real-PostgreSQL coverage: CI runs the registered suites against a provisioned
PostgreSQL service and includes the new suite. In this sandbox no PostgreSQL
server was available, so the sandbox evidence is real route handlers + real auth
pipeline + a recording statement stub + disposable PGlite; the PGlite suites that
require a wire-protocol server (`tests/analytics-progress.test.ts`) fail with
`DATABASE_URL is required` exactly as they did before this change and are not in
the CI list — a pre-existing gap recorded in §H.5.

---

## G. Delivery

- Code + tests + CI registration: **`d6b702c`** on
  `arena/54293cff-nihingobridgeupgrade`, pushed (`16e5aca..d6b702c`).
- This report: separate documentation commit.
- PR: **#21**, updated additively (Part 6) — the branch is pinned by the session,
  so a separate PR was impossible (§K.5). Nothing was rewritten, force-pushed,
  amended, squashed or reordered.
- **No merge, no deployment, no production access, no branch deletion.**

---

## H. Remaining risks

1. **No sign-in UI** — the highest-impact consequence. These three routes are now
   useless to real users until the app can obtain a session. Required before any
   public exposure; public beta remains **BLOCKED**.
2. **Self-reported XP inflation** — a learner can still report arbitrary
   `content.read` events about themselves (that is the route's documented
   purpose: "events the server did not originate"). Attribution is fixed;
   truthfulness of the claim is not, and cannot be, proved by authorization.
   Rate limiting / anti-abuse is D-13 and remains open.
3. **Twenty sibling routes** still accept a caller-supplied `userId` or default
   to `"anonymous-user"`, several of them writes (§C.5). Same class, separate
   patches.
4. **Legacy `anonymous-user` ledger rows** have no owner, so HTTP revocation of
   them is refused (fail closed). If those rows matter, a one-off, audited data
   migration is needed — not a route-level exception.
5. `POST /api/analytics` still classifies a malformed JSON body as 500 (the parse
   sits inside the mutation `try`). Pre-existing, unchanged, out of scope; worth
   folding into a later phase.
6. `tests/analytics-progress.test.ts` is excluded from the CI test list, so the
   service-level analytics contract is asserted only in sandbox runs.
7. The auth pipeline may provision the caller's own `learner` row on first
   sight — an established behavior of the reused boundary, not a mutation of
   user data, but it does mean "zero writes" is scoped to XP/analytics rows.

---

## I. Safety

- No production database, credential or data was read, written or contacted.
- No merge, deployment, force-push, history rewrite, branch deletion or config
  change.
- No new authentication system, no service-role credential exposed to the client,
  no new permission and no admin bypass.
- `POST /api/questions`, the Phase 24 sanitizers, the XP read-path write
  isolation and every unrelated route protection are unchanged and re-tested.
- Windows action: **NONE** (no verified Windows-only requirement).

---

## J. Next phase

1. **Phase 26 (recommended): same self-identity boundary on the remaining
   `userId`-accepting routes**, one route family per patch, starting with the
   writes (`knowledge/srs`, `srs/personal`, `srs/settings`, `srs/sync`,
   `jlpt/progress`) and leaving the read-only `xp/ledger` for last.
2. Then the sign-in path that makes authenticated writes reachable at all, since
   every future authorization phase now depends on it.
3. Fold `analytics-progress` and the remaining DB-gated suites into the CI test
   list, and add `next build` regression coverage for the auth barrel's
   `server-only` contract.

---

## K. User decisions requested

1. **`DELETE /api/xp` policy (implemented: owner-only).** Confirm, or specify the
   operator story (who may revoke whose XP, under which permission, with which
   audit record). Changing it is a small, local change to `xp/route.ts`.
2. **Anonymous writes are now 401.** Accept the product impact until sign-in
   exists, or schedule the sign-in UI first.
3. **Legacy `anonymous-user` rows are not revocable over HTTP.** Accept, or
   authorize a data migration to attribute them.
4. **Contract change:** an anonymous caller with a malformed body now gets 401
   instead of 400 (authorization precedes parsing, matching `POST
   /api/questions`). Confirm that ordering is the intended convention.
5. **Branch limitation:** a separate PR was impossible because the session is
   pinned to PR #21's branch. This work is commit `d6b702c` on that branch and is
   cleanly separable (three commits, disjoint file sets) — but extracting it into
   its own PR requires the user to unblock separate-branch delivery.

---

## L. Status

- Authorization before mutation: **done** for all three routes.
- Spoofed identity: **refused with zero writes**, proven at statement level and
  at row level.
- Phase 24 sanitization: **intact** (36/36).
- Gates: typecheck / lint / build green; full-suite failure set unchanged.
- CI on the exact final HEAD: run `40646632662` on `d6b702c` — **success**
  (code commit; the documentation commit below carries its own green run).
- **Public beta: BLOCKED** (unchanged).
