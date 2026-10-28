# PHASE 26F-F0 — ANONYMOUS IDENTITY FEASIBILITY AND OWNER-DECISION GATE

**Status:** read-only feasibility report
**Produced:** 2026-10-28
**Branch:** `arena/54293cff-nihingobridgeupgrade`
**Authorized scope:** investigation and this document only

> **This report does not authorize enabling anonymous sign-in, starting Phase 26F-D,
> or releasing the public beta.** It establishes what the code already does, what is
> missing, what depends on evidence this environment cannot obtain, and which decisions
> belong to the owner.

---

## 0. Verdict summary

**PASS WITH CONDITIONS.**

The identity *foundation* is present, verified, and green. The identity *provisioning for
signed-out visitors* does not exist in any form. Anonymous sign-in is not implemented,
not enabled by any evidence in this repository, and cannot be assumed enabled.

Implementation of Phase 26F-D remains **blocked** on owner decisions R1–R3 (§7).

---

## 1. Repository and gate evidence

All values below were produced by commands run in this session against
`/home/user/nihingobridgeupgrade`. No reset, stash, clean, rebase, amend, merge, or push
was performed.

### 1.1 Local repository

| Check | Command | Observed | Expected | |
|---|---|---|---|---|
| Root | `pwd` | `/home/user/nihingobridgeupgrade` | same | ✅ |
| Branch | `git branch --show-current` | `arena/54293cff-nihingobridgeupgrade` | same | ✅ |
| HEAD | `git rev-parse HEAD` | `7fc3b8305be3ead818589d448aec0aad585ad543` | `7fc3b8305be3ead818589d448aec0aad585ad543` | ✅ |
| Worktree | `git status --porcelain \| wc -l` | `0` | `0` | ✅ |
| Position | `git status --short --branch` | `[ahead 1]` | ahead of remote | ✅ |
| Remote branch tip | `git ls-remote origin refs/heads/arena/54293cff-nihingobridgeupgrade` | `1f56e6110b068caf2eabcb6da712479d433c0d55` | unchanged | ✅ |
| `7fc3b83` local-only | `git branch -a --contains 7fc3b83` | branch line only; remote tip `1f56e61` | unpushed | ✅ |

```
HEAD            7fc3b8305be3ead818589d448aec0aad585ad543
remote branch   1f56e6110b068caf2eabcb6da712479d433c0d55   (7fc3b83 NOT present)
=> 26F-B commit remains local and unpushed. No push performed.
```

### 1.2 Live GitHub state

| Check | Command | Observed |
|---|---|---|
| `origin/main` (live) | `git ls-remote origin refs/heads/main` | `cf7a4c673236af2f507af8529dae0946fbed3bdf` |
| local `main` | `git rev-parse main` | `cf7a4c673236af2f507af8529dae0946fbed3bdf` (identical) |
| PR #21 | `gh pr view 21` | `state=OPEN` `mergeable=MERGEABLE` `mergeStateStatus=CLEAN` `mergedAt=null` `isDraft=false` |
| PR #21 head | same | `headRefOid=1f56e6110b068caf2eabcb6da712479d433c0d55` |
| PR #21 base | same | `baseRefName=main` |
| PR #21 size | same | 35 files, +11,461 / −83 |
| URL | same | https://github.com/ranimony-afk/nihingobridgeupgrade/pull/21 |
| diff vs main | `gh api .../compare/main...1f56e61` | `status=ahead` `ahead_by=17` `behind_by=0` |

**Base-drift note (not a discrepancy).** An earlier phase recorded `ahead_by=19` against the
older base commit `dac1996e`. `main` has since advanced to `cf7a4c67`. Verified:
`dac1996e` is an ancestor of `cf7a4c67`; `cf7a4c67` is contained in HEAD; and
`git rev-list --count` gives 17 for `main..1f56e61` and 19 for `dac1996e..1f56e61`
(19 = 17 + 2 newly-merged base commits). `behind_by=0` confirms the branch contains all of
`main`. **No divergence, no drift, nothing to reconcile.**

### 1.3 Phase 26F-B artifacts remain present

| Artifact | Present | Size |
|---|---|---|
| `drizzle/0005_srs_catalogue_state_separation.sql` | ✅ | 3,779 B |
| `drizzle/meta/0005_snapshot.json` | ✅ | 89,235 B |
| `tests/srs-catalogue-materialization.test.ts` | ✅ | 28,574 B |
| `src/services/srs/srsCatalogueService.ts` | ✅ | 19,167 B |

### 1.4 Baseline (measured at this HEAD, isolated in-memory PGlite only)

```
Test Files  23 failed | 55 passed (78)
Tests      103 failed | 1250 passed | 131 skipped (1484)
```

Identical to the recorded 26F-B post-state — **no drift**. Identity-related suites are
**not** in the failing set: `supabase-auth-foundation`, `application-user-actor`,
`cms-security-*`, `questions-post-authorization`, `xp-*-authorization` all pass.

---

## 2. Existing identity architecture

### 2.1 Layers (trust flows one direction only)

```
   browser cookie ──► proxy.ts ──► updateSession()          session refresh, NO gating
                                        │
                                        ▼
   route/service ──► getAuthenticatedIdentity()             identity.ts:137   (verified sub)
                                        │
                                        ▼
                     resolveApplicationUser()               applicationUser.ts:162
                                        │  find by (auth_provider, auth_subject)
                                        │  or provision learner row (race-safe)
                                        ▼
                     getCurrentApplicationUser()            applicationUser.ts:196
                                        │
                                        ▼
                     getCurrentActor() / requireActor()     authorization.ts:122 / :127
                                        │  normalizeActor() freezes result, :98
                                        ▼
                     requirePermission(role model)          authorization.ts:139
```

### 2.2 File-by-file facts

| Component | Path:line | Verified behaviour |
|---|---|---|
| Browser client | `src/lib/auth/supabase/client.ts:12` | `createBrowserSupabaseClient()` defined — **never imported anywhere** (`grep` → definition only) |
| Server client | `src/lib/auth/supabase/server.ts:14` | `createServerClient` with async `cookies()`; `setAll` swallows writes during Server Component render |
| Session refresh | `src/lib/auth/supabase/proxy.ts:23-67` | Calls `supabase.auth.getClaims()` (`:63`) to refresh near-expiry tokens; returns the rebuilt response so refreshed cookies survive |
| Proxy entry | `proxy.ts:11-25` | Next 16 `proxy()`; matcher excludes static assets only. **No redirects, no gating** (documented `proxy.ts:8`) |
| Claims → identity | `src/lib/auth/identity.ts:75` | `normalizeSupabaseIdentity` reads **only** `sub`, `email`, `user_metadata.{display_name,full_name,name}`. **`is_anonymous` is ignored.** |
| Verification | `identity.ts:137` | `getAuthenticatedIdentity()` — zero-arg; `getClaims()`; every failure path → `null` (fail-closed) |
| Provider guard | `identity.ts:112-134` | Missing `NEXT_PUBLIC_SUPABASE_URL`/`_PUBLISHABLE_KEY` → returns a stub that always reports unauthenticated |
| Provisioning | `applicationUser.ts:162` | Find by `(provider, subject)`; else insert `id: user-<randomUUID()>`, `role: "learner"`, `ON CONFLICT DO NOTHING` + re-read |
| Provisioning name | `applicationUser.ts:144-154` | `displayName` → email local-part → `user-${subject.slice(0,8)}`. `users.name` is NOT NULL, so this fallback is what an anonymous user would get |
| Identity mapping | `src/db/schema.ts:38-47` | `auth_provider` / `auth_subject` **nullable**; unique index `idx_users_auth_identity_unique` at `:45`. Deliberately **not** an FK, and **not** equal to `users.id` |
| Actor boundary | `authorization.ts:37, 98, 122, 127` | `defaultActorResolver` → `getCurrentApplicationUser`; `normalizeActor` degrades unknown roles to `learner` and `Object.freeze`s; `requireActor` throws 401 |
| Route adapter | `src/app/api/_shared/authorizationResponse.ts:85` | `authenticateActor(msg)` → actor or a 401/403/500 `NextResponse` with `Cache-Control: no-store` (`:27`) |
| Self-identity policy | `src/lib/auth/learningIdentity.ts:75, 99` | `resolveQueryIdentity` / `resolveSelfIdentity`: absent → actor's id; foreign → 403; malformed/repeated/blank → 400 |
| OAuth callback | `src/app/auth/callback/route.ts:31-66` | Handles **only** `?code=` (PKCE) via `exchangeCodeForSession`; all failures redirect to `/`; no error surface; no provisioning; `sanitizeNext` blocks open redirect |

### 2.3 What does **not** exist (verified by exhaustive search)

| Absent | Evidence |
|---|---|
| Any sign-in UI | no `login`/`signin` page under `src/app`; only `src/app/auth/callback/` |
| Any `signInWith*` / `signUp` / `signOut` call | `grep -rn "signInWith\|signUp\|signOut" src/` → **0 hits** |
| Client session init / auth listener | no `onAuthStateChange`, no `getSession()`, no `persistSession`, no `storageKey` |
| Client identity store | `grep "userId"` across all 8 SRS/knowledge pages → **0 hits** |
| Server Actions | `grep '"use server"'` → **0 hits** |
| CSRF / origin validation | no token, no `Origin`/`Sec-Fetch-Site` check anywhere |
| Rate limiting | no limiter in the repository |
| Anonymous-identity handling | `grep -i anonymous` across `src/lib/auth/` and the identity/clerk suites → only prose comments |

### 2.4 Installed library capability (local evidence, **not** project configuration)

From `node_modules` (no network, no dashboard access):

| Capability | Evidence | Meaning |
|---|---|---|
| `signInAnonymously()` | `@supabase/auth-js/.../GoTrueClient.d.ts:276` | The **client** can request an anonymous session |
| `JwtPayload.is_anonymous?: boolean` | `.../lib/types.d.ts:2030` | The **verified JWT** can carry an anonymous marker |
| `User.is_anonymous?: boolean` | `.../lib/types.d.ts:424` | The user object distinguishes anonymous accounts |
| `linkIdentity()` | `GoTrueClient.d.ts:2199, 2203` | OAuth / ID-token linking exists for account upgrade |
| `updateUser()` | `GoTrueClient.d.ts:1597+` | Email/password conversion path exists |
| Browser cookie storage | `@supabase/ssr/.../cookies.js:160` | Browser client defaults to the `document.cookie` API, so a browser sign-in produces cookies the server already reads |
| Captcha guidance | `GoTrueClient.d.ts:212` | SDK docs: "recommended to set up captcha for anonymous sign-ins to prevent abuse" |

`@supabase/supabase-js@2.117.0`, `@supabase/ssr@0.12.7`, `next@16.3.6`, `react@19.2.6`.

> **Critical distinction.** SDK availability is **not** project enablement. Nothing in this
> repository — or reachable from this environment — states whether the Supabase project has
> "Allow anonymous sign-ins" enabled. See §8 limitation L1.

---

## 3. Feasibility analysis (item 3, questions 1–8)

### Q1 — How a first visit would obtain a verified Supabase subject

**Feasible with existing machinery.** Required flow:

1. A client boundary calls `createBrowserSupabaseClient().auth.signInAnonymously()`.
2. Supabase issues an access token whose `sub` is a real UUID and whose `is_anonymous` is `true`.
3. `@supabase/ssr` writes the session into `document.cookie` (verified default).
4. The next request carries those cookies; `updateSession` refreshes them if near expiry.
5. `getAuthenticatedIdentity()` → `getClaims()` verifies the signature server-side → `{provider:"supabase", subject:<uuid>}`.
6. `resolveApplicationUser()` provisions `users` row `user-<uuid>`, role `learner`.

**Nothing in steps 3–6 needs new code.** Only step 1 is new (there is no client call site today).

**Unverified:** that the project permits anonymous issuance (L1).

### Q2 — How the browser would persist and refresh its session

**Persistence:** already solved by `@supabase/ssr` — cookies via `document.cookie`
(`cookies.js:160`). No `localStorage` session code exists or is needed.

**Refresh:** already implemented server-side — `updateSession` calls `getClaims()` on every
matched request (`proxy.ts:63`), which refreshes a near-expiry access token using the refresh
cookie and re-emits cookies on the response (`:43-54`). The existing comment at `:59-62` is
explicit that this ordering is required, and `:65-67` that returning a rebuilt response
would sign users out.

**Gap:** the browser never calls the client SDK, so a session is never *created*. Once created,
refresh works through the path above.

### Q3 — How API requests deliver credentials, and how the server verifies them

**Delivery:** ambient same-origin cookies. All 8 pages use plain `fetch("/api/...")` with no
credential configuration, so cookies flow by default.

**Verification:** `getClaims()` on the server (JWKS-verified), never the raw cookie reader
(`identity.ts` header comment; `proxy.ts:62`). The pipeline is zero-argument by construction,
so no request value can inject an identity — enforced by tests
(`supabase-auth-foundation.test.ts` test 7 "zero-arg boundary", test 8+9 "no request-body
userId or role is consulted").

**Consequence for native clients:** a bearer-token path does not exist in this repository.
Any non-browser client must send `Authorization: Bearer` and the server would need an
equivalent `getClaims` path. Out of scope here; flagged L4.

### Q4 — Representing anonymous users without using `"anonymous-user"` as identity

**The design is already correct and needs no invention.**

An anonymous Supabase session has a genuine `sub`. The sentinel string is never involved:

```
supabase sub 9f1c… → users.id user-4b2e… → CmsActor.id "user-4b2e…" → srs_*.user_id
```

The literal `"anonymous-user"` therefore remains **legacy data provenance only**, exactly as
26F-C §6.1 classified it. `materializeSystemDeck` already refuses it
(`srsCatalogueService.ts:498`), which is the correct permanent behaviour.

**One real gap:** `normalizeSupabaseIdentity` discards `is_anonymous`, and `users` has no
column to record it. So today an anonymous account is indistinguishable from a permanent one
at the application layer. Consequences: cannot target retention cleanup, cannot prompt an
upgrade, cannot reason about "account is upgradeable". **A minimal change is required** —
surface `is_anonymous` on `AuthenticatedIdentity` and persist it on `users`
(additive nullable column; a later migration, not this phase).

### Q5 — Upgrading an anonymous learner without changing the subject or orphaning SRS data

**Probably feasible; not verified.** Two SDK-supported routes exist:
`updateUser()` (email/password) and `linkIdentity()` (OAuth). Both are designed to convert the
signed-in anonymous user in place.

Our data model is well-positioned: `users.id` is the *application* key, and every SRS/XP row
uses that id (or, after 26F-D, the actor derived from it). The provider subject is stored only
for lookup on `(auth_provider, auth_subject)` (`schema.ts:38-47`), deliberately **not** as a
foreign key. So **if and only if the subject is preserved** across conversion, all learner data
survives untouched — no rewrite, no re-keying.

**This is the single highest-risk assumption in the plan (L2).** If Supabase issues a new
`sub` on conversion, the new identity would provision a *second* `users` row and the learner's
SRS history would silently orphan. That must be proven by a controlled integration test
against a **disposable, non-production** project before any code depends on it.

Also unhandled today: `/auth/callback` accepts only `?code=` (PKCE). An email-OTP or
magic-link upgrade that returns `token_hash`/`type` would not be processed by this route. See Q7.

### Q6 — Sign-out, token expiry, storage loss, multiple tabs, second device

| Scenario | Today's behaviour | After identity enforcement | Required control |
|---|---|---|---|
| **Sign-out** | No sign-out code exists. Cookies would clear; next request resolves unauthenticated | Unknown anonymous visitor on a new request ⇒ **new anonymous account**; prior data unreachable unless upgraded | Explicit sign-out UX + "secure your account" prompt before sign-out; retention policy (R2) |
| **Access-token expiry** | Refreshed by `updateSession` | Transparent while refresh token valid | None new |
| **Refresh-token expiry / revocation** | Resolves unauthenticated → silently lands in the shared bucket | **401 on every SRS route** | UI re-auth path; do not silently mint a second identity mid-session |
| **Storage loss** (cleared cookies, incognito, new browser) | Falls back to the shared bucket | **Anonymous identity is unrecoverable** — no email, no recovery channel | This is the decisive product risk of Option A: without an upgrade prompt, a learner can lose access to their own data by closing the browser. Retention decision R2 governs |
| **Multiple tabs** | No client SDK, so no races today | Two tabs refreshing the same rotating refresh token can race | Must be covered by an integration test; `@supabase/ssr` is designed for this but we have no in-repo evidence |
| **Second device** | Same shared bucket (deviceId is not identity) | **Separate anonymous account** — no sharing | Cross-device continuity requires permanent sign-in (upgrade). Must be communicated in UI |

### Q7 — Does the OAuth callback conflict with anonymous → permanent linking?

**No structural conflict; several gaps.**

- No conflict: the callback performs **no provisioning** (`route.ts:61-65` just exchanges the
  code). Provisioning is lazy, on the next request, keyed by `(provider, subject)`. If linking
  preserves the subject, the same `users` row is reused — which is exactly what we want.
- The callback is PKCE-`code`-only. `linkIdentity()` for OAuth returns a PKCE redirect, so it
  *should* work, but an email-OTP upgrade path would need a `token_hash` handler that does not exist.
- It swallows every error and redirects to `/` (`:62-64`). A failed **link** would look
  identical to a failed sign-in and to no action at all — the learner would believe they had
  secured their account when they had not. This must be fixed before linking ships.
- The same route is used for sign-in and linking with no distinguishing parameter. Adding an
  explicit linking intent (and an error surface) is required.

### Q8 — Are CSRF/origin protection, rate limiting and abuse prevention required first?

**Yes — all three, before any anonymous mutation endpoint is enabled.**

- **CSRF.** There is no CSRF token and no `Origin`/`Sec-Fetch-Site` check anywhere in the
  repository. Today this is moot because mutations are unauthenticated; once a cookie
  identifies a learner, a cross-site form post could ride that cookie to mutate **their own**
  data. Session cookies are written by `@supabase/ssr` with its default options — the actual
  `SameSite`/`Secure`/`HttpOnly` values are not asserted by any test in this repository (L3).
  Required: explicit same-origin enforcement on all `POST/PUT/PATCH/DELETE`, verified cookie
  flags, and a test asserting a foreign `Origin` is rejected.
- **Rate limiting.** No limiter exists. Anonymous issuance is an unauthenticated
  account-creation endpoint; SRS mutations are unauthenticated writes. Both need limits.
  This is already a tracked open item (D-13 in the residual-risk register).
- **Abuse.** The SDK's own documentation (`GoTrueClient.d.ts:212`) recommends captcha for
  anonymous sign-ins. Treat captcha as a requirement, not an option, if anonymous issuance
  is enabled on a publicly reachable deployment.

**Sequencing consequence:** enabling anonymous identity *before* these controls would convert
an already-open system into an open system with account-creation spam. The controls are
prerequisites of 26F-D shipping, not follow-ups.

---

## 4. Proposed browser-to-server identity flow (design only, not implemented)

```
 FIRST VISIT
 ───────────
  browser                        server
  ───────                        ──────
  layout / client bootstrap
    └─ if no session cookie:
         signInAnonymously()                     [NEW — only new browser-side code]
              │
              ├─ Supabase returns session {sub, is_anonymous:true}
              └─ @supabase/ssr writes document.cookie   [EXISTING library behaviour]

 EVERY SUBSEQUENT REQUEST
 ───────────────────────
  fetch("/api/...")  ── cookies ──►  proxy.ts
                                       └─ updateSession → getClaims()  [EXISTS] refresh
                                     route
                                       └─ authenticateActor()          [EXISTS]
                                            └─ requireActor()
                                                 └─ getCurrentActor()
                                                      └─ getCurrentApplicationUser()
                                                           └─ getAuthenticatedIdentity()
                                                                └─ getClaims() verified sub
                                                           └─ resolveApplicationUser()
                                                                └─ users row (user-<uuid>)
                                       └─ service(actor)               [26F-D]
                                            └─ WHERE id = ? AND user_id = actor

 UPGRADE (later phase)
 ────────────────────
  authenticated anonymous user
    └─ updateUser({email}) or linkIdentity(oauth)
         └─ /auth/callback?code=…                       [EXISTS, needs error surface]
              └─ exchangeCodeForSession
                   └─ SAME sub  ⇒ SAME users.id ⇒ all SRS/XP rows unchanged   [MUST BE PROVEN]
```

**Invariants this flow preserves**

- The sentinel `"anonymous-user"` is never an identity; it only labels pre-auth rows.
- No request-supplied `userId`/`ownerId`/`deviceId` ever reaches an ownership decision.
- Existing legacy rows are neither read as, nor transferred to, the first visitor.
- Catalogue content stays global; scheduling state stays per learner.
- The actor is derived server-side from a verified JWT on every request.

---

## 5. Account-upgrade / linking risks

| # | Risk | Severity | Mitigation | Evidence needed |
|---|---|---|---|---|
| U1 | Conversion issues a **new `sub`** → second `users` row → SRS/XP history orphaned | **Critical** | Prove subject stability before depending on it; if unstable, design an explicit re-key step (never silent) | Controlled integration test on a disposable project (L2) |
| U2 | Learner believes they upgraded but did not (callback swallows errors) | High | Add linking intent + explicit failure surface to `/auth/callback` | Code change; testable |
| U3 | Anonymous account lost on storage clear with no recovery channel | High | Upgrade prompt before first meaningful study; documented retention (R2) | Owner decision |
| U4 | Two anonymous accounts for one person (two devices) | Medium | Explain in UI; converge on upgrade | Product decision |
| U5 | Email-OTP upgrade path unsupported (`token_hash` unhandled) | Medium | Implement handler or restrict to OAuth/password upgrade | Code change |
| U6 | Sign-out destroys access to un-upgraded data | Medium | Block sign-out while anonymous, or offer upgrade first | Product decision (R2) |
| U7 | XP idempotency merged across identities | Low (design avoids it) | Per-learner card ids + `(user_id, dedupe_key)` uniqueness already prevent merging (`schema.ts` `idx_xp_events_user_dedupe_key_unique`) | Already proven by 26A tests |
| U8 | CSRF on cookie-authenticated mutations | High | Same-origin enforcement + cookie flag verification (§3 Q8) | Code change + test |
| U9 | Multi-tab refresh-token race | Medium | Integration test; rely on `@supabase/ssr` semantics | Integration test (L3) |

---

## 6. Legacy-data invariants (mandatory; none are satisfied by enabling identity)

These are requirements for 26F-D, not properties that anonymous sign-in confers.

1. **No silent adoption.** A pre-existing `"anonymous-user"` row must never be assigned to the
   first (or any) authenticated visitor. Identity creation must not read from, or write to,
   the sentinel bucket.
2. **No transfer, deletion, or reassignment.** No `UPDATE` of `owner_id`/`user_id`, no `DELETE`,
   no backfill. Legacy rows become inert (readable by nobody once routes are enforced), not
   destroyed.
3. **No card-ID handoff.** `KnowledgeService.addKanaToSrs` / `addKanjiToSrs` must stop returning
   an existing card id created by another learner (`knowledgeService.ts:644, 646-652`), and
   `ensureDeck` must stop hardcoding `ownerId: "anonymous-user"` (`:791`). Per-learner card ids
   are required, not cosmetic: sharing an id would also merge XP idempotency keys.
4. **Catalogue stays global; scheduling stays per learner.** `srs_system_decks` /
   `srs_card_templates` carry content only (no scheduling columns); materialization creates
   learner-owned rows. `materializeSystemDeck` must keep rejecting the sentinel (`:498`).
5. **No production or shared database operations in this phase.** Confirmed: this phase ran
   only in-memory PGlite and static inspection; no connection string was used, no migration
   was applied, no seed was executed.
6. **Unattributable data stays unattributed.** Legacy kana/kanji cards cannot be attributed by
   construction; they are not to be guessed at by name, content, or id similarity.

---

## 7. Owner decision register

No decision below is made on the owner's behalf.

| ID | Decision | Recommendation | Consequence if wrong | Evidence required | Owner | Blocks 26F-D? |
|---|---|---|---|---|---|---|
| **R1** | Anonymous learning **vs** mandatory sign-in | **Anonymous learning**, with an upgrade prompt. The identity pipeline supports it and no login UI exists today; mandatory sign-in would strand every current signed-out learner. | Mandatory sign-in without UI ⇒ total SRS outage. Anonymous without retention policy ⇒ silent data loss. | This report §3 Q1–Q8; conversion test (L2) | Product owner | **YES** |
| **R2** | Anonymous account **retention & cleanup** (TTL, inactivity, on-sign-out) | Define a TTL (e.g. 30–90 days inactive) and **never hard-delete** before a documented export window; keep rows inert rather than purged | Too short ⇒ data loss users cannot foresee; too long ⇒ unbounded growth; unclear ⇒ cannot implement cleanup at all | Supabase project retention capabilities (L1); storage estimates | Product + ops | **YES** (before issuance) |
| **R3** | Anonymous **issuance & SRS mutation rate limits**, captcha | Captcha on issuance + per-IP/per-session limits on issuance and on SRS mutations | Open account-creation spam; SRS write amplification | SDK guidance (`GoTrueClient.d.ts:212`); hosting limiter options; existing D-13 item | Security owner | **YES** |
| **R4** | Anonymous → permanent **linking & subject preservation** | Require subject preservation as a hard acceptance criterion; add explicit linking intent + failure surface to `/auth/callback` | Silent orphaning of a learner's entire SRS/XP history | **Controlled integration test (L2)** on a disposable project | Product + engineering | No (blocks the *upgrade* feature, not 26F-D) |
| **R5** | **Legacy shared SRS data** disposition (sentinel bucket) | Leave inert indefinitely; archive only under a later retention decision. **No reassignment.** | Silent cross-learner transfer — the exact defect class under remediation | This report §6; measured inventory (26F-G dry-run) | Product owner | No (26F-D leaves it untouched) |
| **R6** | **Unattributable kana/kanji history** | Accept as unattributable; new adds become per-learner; do not guess ownership | Guessing would assign one learner's history to another | `knowledgeService.ts:644-655, 791` | Product owner | No (needed by 26F-G) |
| **R7** | **Foreign-resource response convention** (404 vs 403) | **404** for path-addressed resources (`/sessions/[id]`, `/decks/[id]`); **403** for identity-claim params (`?userId=`) — the latter matches existing XP routes | A distinguishable "exists but forbidden" becomes an enumeration oracle | Existing convention: `xp/ledger`, `questions` | Security owner | **YES** (shapes route tests) |
| **R8** | Authorize pushing local `7fc3b83` into PR #21 | Push before 26F-D so the catalogue work is reviewable in the PR it belongs to | 26F-D would build on an unreviewed, unpushed base; PR #21 stays incomplete | Gate evidence §1.1 | Repo owner | No (but strongly advised) |
| **R9** | Does the Supabase project have anonymous sign-ins **enabled**, and what are its cookie/refresh settings? | Must be confirmed **before** implementation, not during | Implementing against a disabled provider fails at runtime; cookie flags decide CSRF posture | Dashboard/project config — **not reachable from this environment (L1)** | Owner / platform admin | **YES** |

**Blocking set for 26F-D: R1, R2, R3, R7, R9.** R4, R5, R6, R8 are required later but do not block service/route ownership enforcement.

---

## 8. Explicit limitations (evidence unavailable in this environment)

| # | Limitation | Impact | How to close |
|---|---|---|---|
| **L1** | Supabase **project configuration** cannot be inspected: anonymous sign-in enabled?, captcha settings, email templates, JWT signing mode, refresh-token lifetime. No dashboard, no project credentials, no production env vars (`NEXT_PUBLIC_SUPABASE_*` are empty in `.env.example:30-31`; CI has no Supabase secrets). | R9, R2, R3 remain open. Anonymous issuance may be disabled. | Owner confirmation, or a read-only config check by an authorized operator |
| **L2** | **Subject stability across anonymous→permanent conversion is unproven.** SDKs expose `updateUser`/`linkIdentity`, but nothing in this repository demonstrates whether `sub` is preserved. | U1 — the largest data-loss risk in the plan | Controlled integration test on a **disposable** project: create anonymous user, record `sub`, upgrade, assert `sub` unchanged and the `users`/SRS rows still join |
| **L3** | **Cookie attributes** (`SameSite`, `Secure`, `HttpOnly`) and multi-tab refresh behaviour are library defaults, not asserted by any repository test | CSRF posture unknown; U9 unknown | Integration test in a browser context; assert `Set-Cookie` attributes on the auth response |
| **L4** | **Native/bearer token path** does not exist in this repo (`src/lib/auth/supabase/*` is cookie-only) | Any native client cannot authenticate | Confirm whether a native client exists (out of tree) |
| **L5** | Deployed environment cannot be inspected (Vercel project settings, whether Supabase env vars are set in preview/production) | Cannot state whether authentication works in production at all | Owner confirmation |
| **L6** | No production data or secrets were accessed. All legacy counts remain **unmeasured** | Legacy classification sizes unknown | 26F-G dry-run (read-only, schema-level) |

---

## 9. Go / no-go checklist for the implementation phase

A later implementation phase may begin **only** when every box is checked.

```text
GATE — repository
[x] HEAD == 7fc3b8305be3ead818589d448aec0aad585ad543
[x] worktree clean
[x] branch == arena/54293cff-nihingobridgeupgrade
[x] remote branch tip == 1f56e6110b068caf2eabcb6da712479d433c0d55
[x] PR #21 OPEN / MERGEABLE / CLEAN / head 1f56e61 / base main / unmerged
[x] 26F-B artifacts present (0005 SQL, snapshot, catalogue service, tests)
[x] baseline recorded: 23 failed / 55 passed (78); 103 failed / 1250 passed / 131 skipped (1484)

GATE — evidence (currently OPEN)
[ ] L1  Supabase project config confirmed (anonymous enablement, cookie/refresh settings)   → R9
[ ] L2  subject-preservation integration test PASSES on a disposable project               → R4
[ ] L3  cookie attributes asserted (SameSite/Secure/HttpOnly) + multi-tab refresh tested
[ ] L5  deployed-environment auth configuration confirmed

GATE — owner decisions (currently OPEN)
[ ] R1  anonymous learning vs mandatory sign-in
[ ] R2  anonymous account retention & cleanup
[ ] R3  issuance + SRS mutation rate limits, captcha
[ ] R7  404 vs 403 convention
[ ] R5  legacy sentinel disposition (can be "leave inert" — must be stated)
[ ] R8  decision on pushing 7fc3b83

GATE — engineering preconditions for the coordinated 26F-D
[ ] CSRF / same-origin enforcement designed and tested for cookie-authenticated mutations
[ ] upgrade path design accepted (callback intent + error surface)
[ ] plan to migrate kana/kanji to per-learner card ids without touching existing rows
[ ] rollback story: no data transformed, so revert = disable flag + revert route layer
```

**Do not start 26F-D while any L1/L2/L5 or R1/R2/R3/R7/R9 item is open.**

---

## 10. Final verification for this phase

| Requirement | Result |
|---|---|
| Only worktree change is this report | ✅ single untracked file `reports/PHASE-26F-F0-ANONYMOUS-IDENTITY-FEASIBILITY.md` |
| No tracked source / test / workflow / migration / lockfile / env changed | ✅ `git status --porcelain` shows exactly one entry |
| No database contacted or mutated | ✅ static inspection + prior in-memory PGlite only; no `DATABASE_URL` used |
| No external authentication setting changed | ✅ none attempted; no dashboard/API access |
| No commit or push | ✅ HEAD unchanged at `7fc3b83`; remote unchanged at `1f56e61` |
| No dependency change | ✅ `package.json` / lockfile untouched |

---

## 11. Conclusion

The repository already contains a **verified, tested, fail-closed identity boundary** that is
sufficient to carry anonymous learners without ever using `"anonymous-user"` as an identity.
What is missing is not architecture but three concrete things:

1. **A client call site** that creates an anonymous session (no client SDK call exists today).
2. **Surfacing `is_anonymous`** through `AuthenticatedIdentity` and `users` (currently discarded).
3. **The enabling controls** — CSRF/same-origin, rate limits, captcha, retention — without which
   anonymous accounts would be spammable and cookie-authenticated mutations cross-site forgeable.

The critical unresolved technical assumption is **subject preservation on upgrade (L2)**; the
critical unresolved product decision is **retention (R2)**, because an anonymous learner whose
storage is cleared has no recovery channel.

**Verdict: PASS WITH CONDITIONS.** The feasibility question is answered with evidence: the
approach is viable, the blocking work is bounded and identified, and nothing may be implemented
until R1, R2, R3, R7, R9 and L1/L2/L5 close.

**Next authorized step:** owner decisions R1, R2, R3, R7, R9 (plus R8 for the push) and the L2
subject-preservation integration test on a disposable Supabase project. **No implementation,
no anonymous sign-in enablement, no push, and no public-beta release is authorized by this report.**
