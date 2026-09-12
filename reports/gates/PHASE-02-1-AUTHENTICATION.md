# Phase 02.1 — Authentication

**Date:** 2026-03-25
**Scope:** audit existing auth, select one canonical system, document, implement to gate
**Gate status:** PASS
**Decision record:** `docs/architecture/decisions/DEC-0015-authentication.md`

---

## Deployment gate: registration / login / session smoke test passes

```
npm run test:smoke  →  27 tests, 27 pass, 0 fail
```

16 of those are the authentication journey:

```
ok  1 - registration creates an account and returns the user
ok  2 - registration sets a hardened session cookie
ok  3 - a password hash is never returned to the client
ok  4 - duplicate registration is rejected
ok  5 - a weak password is rejected with guidance
ok  6 - login succeeds with correct credentials
ok  7 - login is case-insensitive on email
ok  8 - login fails with a wrong password
ok  9 - login does not reveal whether an email is registered
ok 10 - an anonymous session request reports not authenticated
ok 11 - a cookie session identifies the user
ok 12 - a bearer session identifies the same user
ok 13 - session responses are never cached
ok 14 - a forged token is rejected
ok 15 - logout revokes the session immediately
ok 16 - full journey — register, login, session, logout
```

---

## Audit result: no authentication system existed

The instruction was *do not add another auth framework if one already exists*.
Verified before writing any code:

| Check | Result |
|---|---|
| Auth packages in `package.json` | **none** |
| Auth code in `src/` | **none** (only Phase 01.2 config keys) |
| Identity tables | **none** — schema was `export {}` |
| `src/middleware.ts` | absent |
| Repository B's three Supabase verifiers | already rejected (DEC-0011) |

Nothing was replaced and no competing system was introduced. This is the
first and only authentication system in the repository.

---

## Selection: both named candidates failed on verifiable constraints

**Auth.js v5** was DEC-0005's primary candidate. It is disqualified by a hard
technical conflict: its Credentials provider **cannot** use database sessions.
Official docs state *"The Credentials Provider can only be used if JSON Web
Tokens are used for sessions"*; pairing it with an adapter raises
`UnsupportedStrategy`, and the failure is still open against
`@auth/drizzle-adapter` (nextauthjs/next-auth#12858). Email/password is our
primary factor, so the one provider we need is the one that cannot satisfy
ARCHITECTURE_FREEZE §3.1's "sessions live in PostgreSQL" — and therefore
cannot revoke a session before it expires.

**Lucia** is deprecated. Its maintainer announced end-of-life in March 2025
and now describes Lucia as *"a learning resource on implementing auth from
scratch."* Adopting a dead dependency for the security core is indefensible.

**Selected:** a first-party session system on Node's `crypto`. This is *not*
rolling your own crypto — no algorithm is implemented. There are no JWTs, so
no signature verification, no `alg` confusion, and no key rotation. What
remains is inserting and looking up a row.

---

## Implementation

| Concern | Choice |
|---|---|
| Password hashing | scrypt, N=2¹⁶ r=8 p=1, digest `scrypt$N$r$p$salt$hash` |
| Session token | 32 random bytes, base64url (256-bit) |
| Token at rest | SHA-256 digest only |
| Session store | `identity_sessions`, expiry + revocation filtered in SQL |
| Web | httpOnly, `SameSite=Lax`, `Secure` in production |
| Mobile | `Authorization: Bearer` — same token, same user |
| RBAC | `identity_user_roles`, ranked learner → super_admin |
| **Dependencies added** | **zero** |

Tables created and verified live: `identity_users`, `identity_credentials`,
`identity_sessions`, `identity_user_roles`, plus a unique index on
`lower(email)`.

### Cost parameters, measured not guessed

| N | Memory | Time |
|---|---|---|
| 2¹⁴ | 16 MB | 45 ms |
| 2¹⁵ | 32 MB | 88 ms |
| **2¹⁶** | **64 MB** | **177 ms** |
| 2¹⁷ | 128 MB | 362 ms |

OWASP's first choice is 2¹⁷. We chose 2¹⁶ on availability grounds: scrypt
allocates 128·N·r bytes **per concurrent hash**, so 2¹⁷ reserves 128 MB per
in-flight login and eight simultaneous logins would exhaust a 1 GB function —
turning a login spike into an outage an attacker could trigger deliberately.
Because digests are self-describing, `needsRehash()` upgrades a user's hash
transparently on next login, so raising the cost later needs no migration and
no forced reset.

---

## Verified at the storage layer

Queried the database directly after the smoke run rather than trusting the API:

```
accounts created                        12
password digest prefix                  scrypt$65536$8$1$…
rows containing plaintext password      0
session token_hash length / sha256 shape 64 / true
revoked sessions after logout tests     2 of 15
roles auto-granted                      learner × 12
```

---

## Security properties worth calling out

**Login cannot be used to enumerate accounts.** Unknown email, wrong password,
and suspended account all return an identical 401. When the address is unknown
the service still performs a dummy scrypt hash, so response times are
comparable. Registration necessarily reveals collisions — a signup form cannot
silently discard an account — so that path returns 409 by design.

**Revocation is immediate.** Logout marks the row revoked; the next lookup
filters it out in SQL. The smoke suite proves it: the same cookie authenticates
before logout and fails after. This is precisely the capability JWT sessions
cannot provide, and why the Auth.js constraint was disqualifying rather than
merely inconvenient.

**Password digests live in a separate table**, so a user row can be selected or
logged without a hash travelling with it. A test asserts no response body ever
contains `scrypt`, `passwordHash`, or the plaintext.

---

## Test coverage

| Layer | Tests | Result |
|---|---|---|
| Unit | 89 (was 61; +28 auth) | pass |
| Integration | 11 | pass |
| API | 9 | pass |
| **Smoke** | **27** (was 11; **+16 auth**) | **pass** |
| **Total (gate)** | **136** | **pass** |

`npm run verify` — structure → env → lint → typecheck → unit → integration →
api + smoke — passes end to end.

Two unit tests are deliberately adversarial: a tampered digest claiming
`N=2^30` must be rejected rather than allocated against, and Unicode-normalised
passwords (`café` composed vs decomposed) must not lock a user out.

---

## Known issue: browser E2E layer is environment-blocked

The Playwright suite passed 8/8 when established in Phase 01.3. It now fails
with `browserType.launch: Target page, context or browser has been closed`
and `kill ESRCH` — the sandbox kills Chromium at launch. Memory is not the
cause (3.5 GB free, 4 CPUs), and the browser binary is present on disk.

This is an environment change, not a code regression: the same specs, unchanged,
passed earlier in this session, and the one spec that needs no browser
(`request.get('/api/health')`) still passes.

It does not affect this gate. The Phase 01.3 rationale for keeping browsers out
of `npm run verify` — *"a gate that fails on a missing download is a gate people
learn to ignore"* — is now demonstrated rather than hypothetical. Browser
coverage should be re-confirmed in CI where the runtime is controlled.

---

## Scope boundary

Deferred deliberately, each an omission of scope rather than correctness:
refresh-token rotation (mobile phase — schema already distinguishes transports
and TTLs), security-headers middleware, email verification and password reset
(both need an email transport decision), login rate limiting, OAuth.

Nothing implemented here must be undone to add them.

---

## Gate approval

- [x] Authentication audited — none existed, nothing replaced
- [x] One canonical system selected, alternatives rejected on documented evidence
- [x] Decision recorded (DEC-0015, supersedes DEC-0005)
- [x] Registration, login, session, logout implemented for both transports
- [x] **Smoke test passes (27/27, including 16 auth)**
- [x] structure, env, lint, typecheck, build all clean
- [x] Zero dependencies added
- [ ] Browser E2E — environment-blocked, tracked above
- [x] **APPROVED** — proceed to Phase 02.2
