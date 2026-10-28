# PHASE 26F-F1 — OWNER DECISION CAPTURE AND L2 TEST PREPARATION

**Status:** read-only decision capture + test preparation (no execution)
**Produced:** 2026-10-28
**Branch:** `arena/54293cff-nihingobridgeupgrade`
**Source of truth for decisions:** `reports/PHASE-26F-F0-ANONYMOUS-IDENTITY-FEASIBILITY.md`
**Authorized scope:** this document only

> **This document does not authorize enabling anonymous sign-in, changing any Supabase
> project setting, implementing an identity flow, touching application source, mutating
> production data, or pushing.** It records what is decided, what is not, and exactly how
> the L2 subject-preservation test would be executed once a disposable project exists.

**Evidence tags used throughout**
`[VERIFIED]` observed in this session by command or direct source read ·
`[OWNER DECISION]` requires an authorized human decision, not inferred ·
`[ASSUMPTION]` believed but unproven, listed again in §6 ·
`[PROPOSED]` a step that has **not** been executed

---

## 0. Verdict summary

**PASS WITH CONDITIONS.**

Gate revalidated cleanly and the F0 report is byte-identical to its recorded digest. The
owner-decision register is complete: **zero of nine decisions are DECIDED**, because no
decision-maker has supplied one and this phase must not infer approval.

The L2 test plan is executable and now rests on **locally verified harness mechanics** rather
than assumption. It has **not** been run — no project was created, no sign-in or linking call
was made, and no external setting was read or changed.

**Phase 26F-D and all anonymous identity implementation remain blocked.**

---

## 1. Gate evidence

### 1.1 Repository

| Check | Command | Observed | Expected | |
|---|---|---|---|---|
| Root | `pwd` | `/home/user/nihingobridgeupgrade` | same | ✅ |
| Branch | `git branch --show-current` | `arena/54293cff-nihingobridgeupgrade` | same | ✅ |
| HEAD | `git rev-parse HEAD` | `7fc3b8305be3ead818589d448aec0aad585ad543` | identical | ✅ |
| Worktree | `git status --porcelain` | exactly 1 entry: `?? reports/PHASE-26F-F0-ANONYMOUS-IDENTITY-FEASIBILITY.md` | F0 report only | ✅ |
| Tracked modifications | `git diff --stat` | empty | none | ✅ |
| Position | `git status --short --branch` | `[ahead 1]` | ahead of remote | ✅ |

`[VERIFIED]` The only uncommitted change at phase start was the authorised F0 report, exactly
as expected. No application source, test, workflow, migration, lockfile, or environment file
was modified.

### 1.2 Remote and PR

| Check | Command | Observed |
|---|---|---|
| Remote branch tip | `git ls-remote origin refs/heads/arena/54293cff-nihingobridgeupgrade` | `1f56e6110b068caf2eabcb6da712479d433c0d55` |
| `origin/main` | `git ls-remote origin refs/heads/main` | `cf7a4c673236af2f507af8529dae0946fbed3bdf` |
| `7fc3b83` containment | `git branch -a --contains 7fc3b83` | local branch only — **no remote ref** |
| PR #21 | `gh pr view 21` | `state=OPEN` `mergeable=MERGEABLE` `mergeStateStatus=CLEAN` `mergedAt=null` `isDraft=false` |
| PR #21 head | same | `headRefOid=1f56e6110b068caf2eabcb6da712479d433c0d55` |
| PR #21 base | same | `baseRefName=main` |
| PR #21 size | same | 35 files, +11,461 / −83 |

`[VERIFIED]` **`7fc3b83` remains local and unpushed.** The remote tip is unchanged from
26F-C/26F-D0/26F-F0. PR #21 is still open, unmerged, mergeable and clean.

### 1.3 Phase 26F-F0 report integrity

| Check | Observed |
|---|---|
| Present | `reports/PHASE-26F-F0-ANONYMOUS-IDENTITY-FEASIBILITY.md` |
| Size | 504 lines, 34,557 bytes |
| SHA-256 | `1e1f0d2314fb58fb726fca6ced1e17b4d00587720336d86b0e92437b796a561e` |
| Matches digest recorded at F0 close | ✅ identical |

`[VERIFIED]` The F0 report is intact and unmodified. Its claims remain the baseline for this phase.

### 1.4 Baseline reference

`[VERIFIED]` at F0 (re-measured, not re-run here): 23 failed / 55 passed (78 files);
103 failed / 1250 passed / 131 skipped (1484 tests). Not re-executed in this phase; no test or
source change has occurred since, so the figure stands as a recorded reference, not a fresh run.

---

## 2. Owner decision register

**Status legend**

| Status | Meaning |
|---|---|
| `DECIDED` | An authorized decision-maker has supplied a binding decision |
| `UNDECIDED` | Decision belongs to an owner and has not been supplied |
| `EVIDENCE REQUIRED` | Cannot be decided responsibly until specific evidence exists |

> **No owner approval is inferred anywhere in this document.** The existence of a feature in
> an installed SDK, a recommendation in F0, or the fact that a code path could support a
> behaviour is **not** approval. All nine items below are open.

### 2.1 Register

| ID | Decision required | Evidence already available | Evidence still missing | Authorized decision-maker | Blocking effect | Status |
|---|---|---|---|---|---|---|
| **R1** | Anonymous learning **vs** mandatory sign-in | `[VERIFIED]` full verified identity pipeline exists and is green (`identity.ts:137`, `applicationUser.ts:162`, `authorization.ts:122/127`); **no login UI and no `signInWith*` call exist** (F0 §2.3); no client identity store in any of 8 SRS pages | Product intent; the cost of stranding current signed-out learners; whether any deployment currently has signed-in users | Product owner | **Blocks 26F-D** (determines whether enforcement 401s the entire UI) | `UNDECIDED` |
| **R2** | Anonymous account **retention & cleanup** (TTL, inactivity, on-sign-out, purge vs inert) | `[VERIFIED]` no retention code, no cleanup job, no sign-out path exists; F0 §3 Q6 documents that storage loss is unrecoverable | Supabase project retention capabilities; storage-growth estimate; legal/product retention stance | Product + ops owner | **Blocks anonymous issuance**; also blocks 26F-D shipping | `EVIDENCE REQUIRED` |
| **R3** | **Issuance + mutation rate limits** and CAPTCHA | `[VERIFIED]` no limiter anywhere in repo; SDK guidance `GoTrueClient.d.ts:212` recommends captcha; D-13 already an open residual item | Hosting/runtime limiter options actually available; per-endpoint budget; captcha provider choice | Security owner | **Blocks anonymous issuance** | `EVIDENCE REQUIRED` |
| **R7** | **Foreign-resource response convention** (404 vs 403) | `[VERIFIED]` existing convention in hardened routes: 403 for foreign `?userId=`, 400 for malformed (`authorizationResponse.ts:57-67`, `learningIdentity.ts:75/99`); no convention yet for path-addressed resources | Owner confirmation of the path-resource rule (recommend 404 for `/sessions/[id]`, `/decks/[id]`) | Security owner | **Blocks 26F-D route tests** (settles assertions) | `UNDECIDED` |
| **R9** | Supabase **project configuration**: is anonymous sign-in enabled? cookie/session settings; refresh lifetime | `[VERIFIED]` **client capability only**: `signInAnonymously()` (`GoTrueClient.d.ts:276`), `JwtPayload.is_anonymous` (`types.d.ts:2030`), `User.is_anonymous` (`types.d.ts:424`), browser `document.cookie` storage (`ssr/cookies.js:160`) | **The actual project setting.** Not inspectable here: `.env.example:30-31` has empty values; CI has no Supabase secrets; no dashboard/API access; no credentials held | Owner / platform admin | **Blocks implementation** (implementing against a disabled provider fails at runtime) | `EVIDENCE REQUIRED` — **UNVERIFIED** |
| **R4** | Anonymous→permanent **linking & subject preservation** | `[VERIFIED]` SDK supports `updateUser()` (`:1597+`), `linkIdentity()` (`:2199/2203`), `exchangeCodeForSession()` (`:856`), `refreshSession()` (`:1968`). `[VERIFIED]` app mapping is `(auth_provider, auth_subject)` → `users.id`, deliberately **not** an FK (`schema.ts:38-47`), so subject preservation implies zero data re-keying | **Whether the subject is actually preserved** — requires the L2 test (§3). Also: email-confirmation behaviour for an anonymous account with no email (`updateUser` docs: "sends a confirmation link to both the user's current and new email") | Product + engineering | Blocks the *upgrade feature*; does **not** block 26F-D | `EVIDENCE REQUIRED` (gated on L2) |
| **R5** | **Legacy shared SRS data** disposition (the `anonymous-user` bucket) | `[VERIFIED]` bucket contains 4 demo decks + up to 41 seeded cards + lazily created kana/kanji decks, all with hardcoded sentinel owners (`srsService.ts:208/310`, `knowledgeService.ts:791`); F0 §6 invariants | Measured inventory by class (C1–C4); explicit owner stance on "leave inert indefinitely" | Product owner | No for 26F-D (it leaves the bucket untouched); yes for 26F-G | `UNDECIDED` |
| **R6** | **Unattributable kana/kanji history** | `[VERIFIED]` cross-learner handoff is structural: deterministic id `card-kana-${id}` + unscoped `findExistingCard(deckId, front)` returns another learner's card (`knowledgeService.ts:644-655, 798`) | Whether affected learners must re-add; acceptable messaging | Product owner | No for 26F-D; yes for 26F-G | `UNDECIDED` |
| **R8** | Authorize pushing `7fc3b83` into PR #21 | `[VERIFIED]` §1.2 — local-only, PR head still `1f56e61` | Owner authorization to push | Repo owner | No — but 26F-D would build on an unreviewed, unpushed base | `UNDECIDED` (see §5) |

### 2.2 Notes on non-inference

- **R9 is recorded as unverified, not as "disabled".** No authorized mechanism to read project
  configuration was available, and none was attempted. Both "enabled" and "disabled" remain
  possible. `[VERIFIED]` only that the *client library* can request an anonymous session.
- **R1 is not implied by the existence of the identity pipeline.** The pipeline supports
  *any* verified identity; it says nothing about whether signed-out visitors should have one.
- **R4 is not implied by `linkIdentity()` existing.** Presence of a linking API is not evidence
  of subject preservation on this deployment.

### 2.3 Blocking set

```
26F-D may start only when:  R1, R2, R3, R7, R9  are DECIDED
Anonymous issuance only when: R2, R3            are DECIDED
Upgrade feature only when:   R4                 is DECIDED (after L2 PASS)
26F-G only when:             R5, R6             are DECIDED
```

---

## 3. L2 test plan — prepared, **not executed**

### 3.1 Objective and hypothesis

`[PROPOSED]` Determine whether converting an anonymous Supabase account to a permanent one
preserves the JWT `sub`, and therefore whether the application mapping
`(auth_provider, auth_subject) → users.id` and every SRS/XP row keyed by `users.id` survives.

**Null hypothesis (the safe default): the subject is NOT preserved.**
The test exists to *disprove* the null. Until it is disproved, all planning assumes conversion
may mint a new `sub` and therefore a duplicate application user.

**Why this matters.** `users.id` is the application key for `srs_decks`, `srs_cards`,
`srs_reviews`, `srs_review_sessions`, `srs_sync_devices`, `srs_user_settings`,
`srs_personalization` and `xp_events`. A changed subject does not rewrite those rows — it
silently makes them unreachable and provisions a *second* user. That is silent data orphaning,
the exact failure class this phase must prevent.

### 3.2 Why L2 cannot be a repository test

`[VERIFIED]` Every existing auth test is fully injected and contacts no project:
`tests/supabase-auth-foundation.test.ts` header states "No Supabase project is contacted", and
uses `setSupabaseClientFactory` (`:49`). `grep "createClient(" tests/*.ts` → no live client.
The repository therefore contains **no harness that can create a real anonymous session**.

`[VERIFIED]` The precedent for environment-dependent gates already exists:
`tests/mobile-dictionary-search-api-live.test.ts` skips with an explicit reason when its
dependency is unreachable and **never weakens assertions**.

**Conclusion:** L2 must run as an out-of-band procedure against a disposable project, not as a
committed vitest file. Nothing about L2 requires modifying application source.

### 3.3 Environment and authorization preconditions

| # | Precondition | Status |
|---|---|---|
| P1 | A **disposable** Supabase project, separate from any production project | ⬜ not available |
| P2 | Its authorized owner enables anonymous authentication **on that project only** | ⬜ not requested (out of scope this phase) |
| P3 | A disposable Postgres/DB for the `users`/SRS/XP rows (or PGlite, since only mapping semantics are tested) | ⬜ not provisioned |
| P4 | Project URL + **publishable** key, held by the operator; no secret/service-role key ever used | ⬜ |
| P5 | Explicit written confirmation that P1 is disposable and may be destroyed | ⬜ |
| P6 | `[VERIFIED]` Node v22.22.3 and installed SDKs (`supabase-js@2.117.0`, `ssr@0.12.7`) | ✅ |

**Hard rules implied by the standing constraints:** no production project, no service-role key,
no real user data, no email address belonging to a real person, and no configuration change on
any non-disposable project.

### 3.4 Harness mechanics — locally verified, no network used

`[VERIFIED]` Two mechanics were confirmed against the actual code, without contacting anything:

1. **The trusted-path module can be imported outside Next.js only under the `react-server`
   condition.** `src/lib/auth/identity.ts` imports `server-only`, whose default export throws:

   ```
   default conditions      → IMPORT FAILED: This module cannot be imported from a
                             Client Component module. It should only be used from a Server Component.
   --conditions=react-server → import OK; exports: getAuthenticatedIdentity,
                             normalizeSupabaseIdentity, resetSupabaseClientFactory,
                             setSupabaseClientFactory
   ```

   So the harness runs as `node --conditions=react-server <harness>.mjs`, using Node 22 native
   TypeScript stripping. `[VERIFIED]` this exercises the **real** `getAuthenticatedIdentity`
   and `normalizeSupabaseIdentity`, not a re-implementation.

2. **Request scope is avoidable via the existing test seam.** `getAuthenticatedIdentity()`
   normally reaches `next/headers` through `./supabase/server`. The harness installs
   `setSupabaseClientFactory()` with a `createServerClient` bound to a hand-built cookie jar —
   the same seam the repo's own tests use (`supabase-auth-foundation.test.ts:49`).

`[ASSUMPTION]` A hand-built cookie jar faithfully reproduces browser cookie transport. If it
does not, fall back to a disposable Next.js preview deployment and call a route that returns
the actor, rather than weakening the assertion.

### 3.5 Procedure

`[PROPOSED]` — none of these steps has been executed.

| Step | Action | Evidence captured | Maps to requirement |
|---|---|---|---|
| **1** | Operator creates disposable project and enables anonymous auth on it only | project ref, settings screenshot/hash, enablement confirmation | §3 item 1 |
| **2** | `supabase.auth.signInAnonymously()` on a fresh client | resulting `access_token`, `refresh_token`, `user.id`, `user.is_anonymous` | §3 item 2 |
| **3** | Verify through the **app's** path: harness sets `setSupabaseClientFactory`, calls `getAuthenticatedIdentity()` (run with `--conditions=react-server`); independently call `getClaims(access_token)` and `getUser(access_token)` | `AuthenticatedIdentity.subject` **S0**; `claims.is_anonymous` (read directly — `normalizeSupabaseIdentity` discards it, `identity.ts:75`); `getUser().id` | §3 item 3 |
| **4** | `resolveApplicationUser({provider:"supabase", subject:S0})`; record mapping. Create test-only rows with unmistakable ids: user `user-l2-<runId>`, deck `deck-l2-<runId>`, cards `card-l2-<runId>-NN`, review `rev-l2-<runId>`, XP `l2:<runId>` | `users.id` **U0**, `(auth_provider, auth_subject)`, row counts per table | §3 item 4 |
| **5** | Perform the upgrade with the **intended** flow — primary path `updateUser({ email: "l2-<runId>@example.invalid" })`; alternate path `linkIdentity({ provider })` → `/auth/callback?code=` → `exchangeCodeForSession` | flow used, all responses, error codes | §3 item 5 |
| **6** | `refreshSession()`; re-verify subject via `getClaims()` **and** `getUser()`; re-run `getAuthenticatedIdentity()` through the injected factory | **S1** (requested/refreshed subject), `is_anonymous` now, token `iat`/`exp` | §3 item 6 |
| **7** | Re-resolve application user from S1; re-count every test row by `users.id` | **U1**, and per-table row counts joined to U0 vs U1 | §3 item 7 |
| **8** | Negative cases (§3.8) | each case's status + resulting subject/mapping | §3 item 8 |
| **9** | Cleanup limited to `*-l2-<runId>` rows, then destroy the disposable project | deletion log, confirmation no non-test row touched | §3 item 9 |

### 3.6 PASS / FAIL criteria

**PASS (all of the following must hold):**

| # | Criterion |
|---|---|
| P-a | `S1 === S0` — the JWT subject is byte-identical before and after upgrade |
| P-b | Exactly **one** `users` row exists for `(supabase, S0)`; no second row provisioned for the upgraded identity |
| P-c | `U1 === U0` — the application-user mapping is unchanged |
| P-d | Every test-only row created in step 4 still resolves to `U0`: `srs_decks`, `srs_cards`, `srs_reviews`, `xp_events` counts identical |
| P-e | After upgrade, `claims.is_anonymous === false` and the account is reachable with the new credential |
| P-f | `refreshSession()` returns a session whose `sub` is still `S0`, and `getUser()` agrees |
| P-g | No orphaned rows: zero rows referencing `U0`'s test ids that cannot be joined to a users row |

**FAIL (any one is sufficient — the plan must then be redesigned, not worked around):**

| # | Failure condition | Consequence |
|---|---|---|
| F-a | `S1 !== S0` | **Hard fail.** Conversion mints a new identity. Upgrade would orphan all learner data unless an explicit, audited re-key step is designed |
| F-b | A second `users` row is provisioned | **Hard fail.** Duplicate application-user mapping |
| F-c | Any test SRS/XP row becomes unreachable from the post-upgrade identity | **Hard fail.** Silent orphaning |
| F-d | `refreshSession()` returns a different subject, or the token cannot be verified | **Hard fail.** Session continuity broken |
| F-e | Upgrade "succeeds" but the learner cannot authenticate afterwards | **Hard fail.** Silent lockout |
| F-f | Cleanup cannot be confined to test rows | **Hard fail.** Cannot even run the test safely |

`[PROPOSED]` A FAIL is **not** a reason to weaken criteria; it is a reason to return to design
(§3.10).

### 3.7 Negative cases (required, step 8)

| Case | Expected | Recorded |
|---|---|---|
| **N1 — cancellation**: abandon the upgrade mid-flow (close before confirmation) | Anonymous session remains valid; `sub` still `S0`; no partial permanent credential | ⬜ |
| **N2 — linking conflict**: `linkIdentity` with an OAuth identity already bound to another account | Deterministic, surfaced error; original anonymous session intact; no second mapping | ⬜ |
| **N3 — duplicate email**: `updateUser({email})` with an address already registered | Deterministic error; `sub` unchanged; no account merge occurs silently | ⬜ |
| **N4 — refresh failure**: use an invalidated/replayed refresh token | Fails closed (no session), never silently issues a different identity | ⬜ |
| **N5 — retry**: repeat the successful upgrade operation | Idempotent or deterministic error; still exactly one `users` row; no duplicate SRS/XP rows | ⬜ |
| **N6 — post-sign-out**: `signOut()` then re-authenticate as the upgraded account | Same `sub`, same `users.id`, data intact — confirms R2's sign-out risk is understood | ⬜ |

### 3.8 Cleanup

`[PROPOSED]` Delete only rows matching the run id (`*-l2-<runId>`, `l2:<runId>`), verify
post-delete counts return to the pre-test values, then destroy the disposable project.
**No cleanup step may target production, and none may target the `anonymous-user` bucket.**

### 3.9 If the result is FAIL — the redesign decision tree

`[PROPOSED]` Do not patch around a changed subject:

1. **If `updateUser` preserves but `linkIdentity` does not** (or vice versa) → restrict the
   supported upgrade to the preserving flow, and state the restriction in the UI and docs.
2. **If no flow preserves the subject** → the upgrade must become an explicit, audited
   re-key operation: create the new application user, then move only *that learner's* rows
   under a recorded mapping, with dry-run counts and rollback. This is a materially larger
   phase and requires its own approval — it must never be silent.
3. **If behaviour is version- or setting-dependent** → pin the Supabase project/version and
   re-run L2 on any upgrade. Record the dependency as a release condition.

---

## 4. Security-control readiness checklist

`[VERIFIED]` states below are from source inspection in 26F-C/26F-F0 and re-confirmed where
noted. **No control is claimed implemented merely because it is planned.**

| # | Control | Current state | Evidence required before an anonymous SRS mutation is enabled |
|---|---|---|---|
| 1 | **CSRF / same-origin** for the actual credential transport | ❌ **NOT IMPLEMENTED** — no CSRF token, no `Origin`/`Sec-Fetch-Site` validation anywhere in the repo; `proxy.ts` performs no gating | An explicit same-origin check on every `POST/PUT/PATCH/DELETE`; a test asserting a foreign `Origin` is rejected |
| 2 | **Server-side JWT validation** | ✅ **IMPLEMENTED** — `getClaims()` (JWKS-verified) is the only identity source (`identity.ts:137`); the raw cookie reader is deliberately not used (`proxy.ts:62`) | Already satisfied; assert it stays the only path (existing zero-arg tests 7/8+9 cover this) |
| 3 | **Issuance + mutation rate limits** | ❌ **NOT IMPLEMENTED** — no limiter in repo; D-13 open | Per-IP/session budgets for anonymous issuance and for SRS mutations; a test proving the limit is enforced |
| 4 | **CAPTCHA / abuse controls** | ❌ **NOT IMPLEMENTED** — SDK guidance (`GoTrueClient.d.ts:212`) recommends captcha for anonymous sign-ins; `SignInAnonymouslyCredentials.options.captchaToken` exists (`types.d.ts:557`) | Chosen provider, documented rationale, and server-side token verification before issuance |
| 5 | **Session expiry / refresh / sign-out / storage loss** | ⚠️ **PARTIAL** — refresh implemented via `proxy.ts:63`; **sign-out does not exist**; storage-loss recovery does not exist; F0 §3 Q6 documents unrecoverable loss | Defined behaviour + UI for each of the four cases; R2 decision |
| 6 | **Anonymous retention + upgrade prompts** | ❌ **NOT IMPLEMENTED** — no cleanup job, no prompt, no `is_anonymous` surfaced (`identity.ts:75` discards it; `users` has no column) | R2 decision; `is_anonymous` persisted; upgrade prompt before first meaningful study |
| 7 | **Ownership checks at service *and* route boundary** | ❌ **NOT IMPLEMENTED** — `[VERIFIED]` 20/20 SRS routes import no auth; services accept caller `userId` with `\|\| "anonymous-user"` defaults (`srsService.ts:341/394/506/546/594/721`, `syncService.ts:121/248/582`, `dailyQueueService.ts:143/667`, `sessionService.ts:85/743/780`) | 26F-D: required actor + explicit ownership predicates, proven at both layers |
| 8 | **Cross-user denial tests** (cards, sessions, reviews, devices, XP) | ❌ **NOT IMPLEMENTED** — `[VERIFIED]` zero cross-user denial tests exist for any SRS route | The full matrix in 26F-D0 §5, including "Alice's rows byte-identical after Bob's attempt" |
| 9 | **kana/kanji card-ID handoff protection** | ❌ **NOT IMPLEMENTED** — `[VERIFIED]` `findExistingCard(deckId, front)` is unscoped (`knowledgeService.ts:798`, used `:644/:700`) and `ensureDeck` hardcodes the sentinel (`:791`); a second learner receives the first learner's card id | Owner-scoped lookup + per-learner card ids; a test proving learner B never receives learner A's id |
| 10 | **No `anonymous-user` fallback as an authenticated actor** | ❌ **NOT IMPLEMENTED** — sentinel defaults remain on ~20 signatures; only `materializeSystemDeck` rejects it (`srsCatalogueService.ts:498`) | Every default removed; a test proving the sentinel never satisfies an ownership check |

**Readiness: 1 of 10 controls verified implemented (server-side JWT validation).**
Everything else is outstanding. Enabling anonymous mutations now would add an account-creation
surface to an already-unauthenticated system.

---

## 5. R8 — commit and PR decision (recorded separately)

| Item | State |
|---|---|
| Local commit `7fc3b83` | `[VERIFIED]` present, **ancestor of HEAD**, absent from remote |
| Remote branch tip | `1f56e6110b068caf2eabcb6da712479d433c0d55` (unchanged) |
| PR #21 | `[VERIFIED]` OPEN / MERGEABLE / CLEAN / head `1f56e61` / base `main` / unmerged |
| Push authorization | **NONE.** No push performed in this phase; none authorized |
| R8 status | `UNDECIDED` — repo owner |

`[VERIFIED]` The two reports produced by 26F-F0 and 26F-F1 are untracked working-tree files.
They are **not** committed, and this phase creates no commit.

---

## 6. Assumptions and limitations

| # | Item | Kind | Mitigation |
|---|---|---|---|
| A1 | Project configuration (anonymous enablement, cookie flags, refresh lifetime) is unknown | **Assumption / unverified** | R9; operator confirmation |
| A2 | Subject preservation across conversion | **Assumption (null = not preserved)** | L2 (§3) |
| A3 | A hand-built cookie jar faithfully reproduces browser transport for the harness | **Assumption** | Fall back to a disposable Next.js preview deployment |
| A4 | `updateUser({email})` is the primary upgrade path for an anonymous account with no email; the docs note a confirmation link is sent to both current and new email (`GoTrueClient.d.ts:1598-1599`) — behaviour for a *no-email* account must be observed | **Assumption** | Observe in L2 step 5 |
| A5 | Multi-tab refresh-token rotation behaves safely | **Assumption** | N4/N5 negative cases; browser integration test |
| A6 | Legacy class counts (C1–C4) are unmeasured | **Known gap** | 26F-G dry-run |
| L1 | No Supabase dashboard/API access; no credentials held; `.env.example` values empty; CI has no Supabase secrets | **Limitation** | Owner confirmation |
| L2 | No production or shared database was contacted in this phase; no migration, seed, or sign-in call was made | **Verified constraint** | — |
| L3 | The local import check (§3.4) used only installed modules; **no network request was issued** | **Verified** | — |

---

## 7. Final verification for this phase

| Requirement | Result |
|---|---|
| Only new worktree change is this report | ✅ (verified below) |
| No application source / test / workflow / migration / lockfile / env file changed | ✅ `git diff --stat` empty |
| No database contacted or mutated | ✅ static inspection + local module import only |
| No external authentication configuration changed | ✅ none attempted |
| No anonymous sign-in or linking call made | ✅ none executed |
| No commit, no push | ✅ HEAD still `7fc3b83`; remote still `1f56e61` |
| F0 report preserved unmodified | ✅ SHA-256 identical to recorded digest |

---

## 8. Conclusion and next prerequisite

`[VERIFIED]` The gate is clean and unchanged. The F0 evidence base is intact. The decision
register is complete and **entirely open** — nine items, zero decided.

`[VERIFIED]` The L2 test is now executable in principle: the trusted-path module imports
outside Next.js under `--conditions=react-server`, and the existing `setSupabaseClientFactory`
seam avoids request scope. What it lacks is a **disposable project** and the associated
authorization.

**Verdict: PASS WITH CONDITIONS** — decision capture and test preparation are complete and
evidence-backed; nothing has been executed or changed; all decisions remain with the owner.

**Exact prerequisite for the next phase:** the authorized owner supplies **R1, R2, R3, R7, R9**
(and R8 if the commit is to be pushed), **and** provides a disposable Supabase project with
anonymous authentication enabled on that project only, so that L2 can be executed and R4
resolved.

**Stop condition (in force):** until those decisions are supplied and a disposable project
exists, **do not begin anonymous identity implementation and do not begin Phase 26F-D.**
Public beta remains blocked.
