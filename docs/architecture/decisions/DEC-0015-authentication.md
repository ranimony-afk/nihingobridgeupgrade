# DEC-0015 — Canonical Authentication System

**Date:** 2026-03-25
**Phase:** 02.1
**Status:** ACCEPTED
**Supersedes:** DEC-0005 (Authentication Library — PROPOSED, left open since Phase 00)
**Related:** DEC-0011 (Reject Repository B Supabase JWT)

---

## 1. Audit: does an authentication system already exist?

The instruction is explicit — *do not add another auth framework if one already
exists*. So the first question is whether one does.

| Surface | Evidence | Result |
|---|---|---|
| Auth dependencies in `package.json` | scanned for `auth`, `jose`, `jwt`, `lucia`, `clerk`, `supabase`, `passport`, `bcrypt`, `argon` | **NONE** |
| Auth code in `src/` | grep for `password`, `session`, `login`, `jwt`, `bearer`, `cookie` | only the *config* keys added in Phase 01.2 |
| Identity tables | `src/db/schema.ts` was `export {}` | **NONE** |
| Middleware | `src/middleware.ts` | **absent** |
| Repository B | three duplicate `lib/auth.ts` Supabase JWT verifiers | **rejected** by DEC-0011 |

**Conclusion: no authentication system exists.** Nothing is being replaced, and
no competing framework is being introduced. This decision creates the first and
only one.

`AUTH_SESSION_SECRET`, `AUTH_COOKIE_NAME` and the three TTL variables were
already defined in Phase 01.2, so the configuration surface was reserved before
the implementation existed. This decision fills it.

---

## 2. Requirements the choice must satisfy

From `ARCHITECTURE_FREEZE.md` §3.1:

1. Credentials and sessions live in **A's PostgreSQL**
2. Web authenticates with an httpOnly, SameSite session cookie
3. Flutter authenticates with a Bearer token
4. Both resolve to the **same** `identity_users.id`
5. RBAC: `learner`, `reviewer`, `content_editor`, `admin`, `super_admin`
6. Authorization is server-side; inbound identity headers are never trusted
7. Every learner-mutating endpoint requires an authenticated subject
8. Secrets only from the environment

---

## 3. Options considered

### Option A — Auth.js v5 (NextAuth)

DEC-0005 named this the primary candidate. **It is disqualified on a hard
technical conflict, not on preference.**

Auth.js's Credentials provider *cannot* be combined with database sessions.
The official error documentation states: *"The Credentials Provider can only be
used if JSON Web Tokens are used for sessions."* Pairing it with an adapter and
`session: { strategy: "database" }` raises `UnsupportedStrategy` at startup.
This is an intentional design decision by the maintainers, not a bug, and it is
still reproducible against `@auth/drizzle-adapter` (nextauthjs/next-auth#12858:
credentials logins produce an orphaned token with no session row).

Consequences had we adopted it:

- Requirement 1 fails — sessions would be self-contained JWTs, not database rows.
- Sessions could not be revoked before expiry, so "log out everywhere" and
  "suspend this account now" become impossible.
- Requirement 3 needs custom work regardless; Auth.js has no Bearer story for a
  native client.
- Auth.js additionally documents that database sessions are incompatible with
  Edge middleware.

Email/password is our primary factor, so the one provider we need is the one
provider that cannot do what the freeze requires. **Rejected.**

### Option B — Lucia

**Deprecated.** The maintainer announced in October 2024 that Lucia v3 would be
deprecated by March 2025, adapters by end of 2024, and that *"Lucia is now a
learning resource on implementing auth from scratch. You'll essentially
recreate Lucia v3 in your project — just without all the bloat."*

Adopting a deprecated dependency for the security-critical core of the platform
is indefensible. **Rejected** — but note its guidance points directly at
Option D.

### Option C — A hosted identity provider (Supabase, Clerk, Auth0)

Moves identity outside the platform. Requirement 1 fails by definition, and
DEC-0011 already rejected exactly this shape when it came from Repository B.
It would also make a paid third party a hard dependency of a platform whose
freeze states it must run with only `DATABASE_URL` configured. **Rejected.**

### Option D — First-party implementation on Node's `crypto` — **SELECTED**

A session system built from vetted primitives that ship with the runtime.

**This is not "rolling your own crypto."** No cryptographic algorithm is being
invented or implemented. The design deliberately avoids the parts of
authentication that are genuinely dangerous to hand-write:

| Risk usually meant by "roll your own" | How this design avoids it |
|---|---|
| Writing a hash function | Uses Node's `scrypt` |
| Writing signature verification | **No signatures.** Tokens are opaque random strings |
| JWT `alg` confusion / `alg: none` | No JWTs exist |
| Key rotation bugs | No signing keys |
| Timing-unsafe comparison | `crypto.timingSafeEqual`; session lookup is an indexed digest match |
| Weak randomness | `crypto.randomBytes` (CSPRNG) |

What remains is ordinary application logic: insert a row, look up a row by
indexed digest, check an expiry timestamp. That is well within the standard of
care, and it is precisely what Lucia's author now recommends.

---

## 4. Decision

**The canonical authentication system is a first-party, database-backed,
opaque-token session system owned by `src/services/auth/`.**

| Element | Choice | Rationale |
|---|---|---|
| Password hashing | scrypt (`node:crypto`) | Memory-hard, OWASP-accepted, no native build, no supply chain |
| Cost parameters | N=2¹⁶, r=8, p=1 | See §5 |
| Digest format | `scrypt$N$r$p$salt$hash` | Self-describing → parameters can be raised later |
| Session token | 32 random bytes, base64url | 256 bits of entropy |
| Token storage | SHA-256 digest only | A database dump yields no usable sessions |
| Session store | `identity_sessions` in PostgreSQL | Immediate revocation |
| Web transport | httpOnly, `SameSite=Lax`, `Secure` in production | XSS and CSRF defence |
| Mobile transport | `Authorization: Bearer <token>` | Same token, same user, one identity |
| RBAC | `identity_user_roles`, ranked | Roles read from the database only |
| Dependencies added | **zero** | Everything is in Node's standard library |

---

## 5. Password cost parameters, measured

Benchmarked on this platform:

| N | Memory | Time |
|---|---|---|
| 2¹⁴ | 16 MB | 45 ms |
| 2¹⁵ | 32 MB | 88 ms |
| **2¹⁶** | **64 MB** | **177 ms** |
| 2¹⁷ | 128 MB | 362 ms |

OWASP's first-choice scrypt configuration is N=2¹⁷. We selected 2¹⁶, and the
reason is availability rather than convenience: scrypt allocates 128·N·r bytes
**per concurrent hash**. At 2¹⁷ that is 128 MB per in-flight login, so eight
simultaneous logins would exhaust a 1 GB serverless function. A login spike
would become an outage, and an attacker could trigger that deliberately.

64 MB / 177 ms keeps offline brute-force expensive while remaining survivable
under load. The trade-off is not permanent: because every digest records its own
parameters, `needsRehash()` detects weaker digests and the service transparently
re-hashes a user's password on their next successful login. Raising the cost
later is a one-line change with no migration and no forced password reset.

---

## 6. Deliberate security properties

**Login does not reveal whether an email is registered.** Unknown address,
wrong password, and suspended account all return the same 401 with the same
message. When the address is unknown the service still performs a dummy scrypt
hash (`burnTime`), so the timing is comparable and the endpoint cannot be used
to enumerate accounts. *Registration* necessarily reveals collisions — a signup
form cannot silently discard an account — so that path returns 409 by design.

**Revocation is immediate.** Logout deletes nothing client-side and trusts
nothing client-side; it marks the row revoked, and the next lookup filters it
out in SQL. This is the capability that JWT sessions structurally cannot offer,
and it is why the Auth.js constraint in §3 was disqualifying rather than
inconvenient.

**Expiry and revocation are enforced in the query**, not in application code
after the fetch, so there is no path where a stale session is loaded and then
forgotten about.

**`SameSite=Lax`** prevents the browser attaching the session cookie to
cross-site POST requests, which covers the state-changing CSRF case.
`Strict` was not chosen because it also breaks ordinary inbound links from
email and search results.

**Hashes live in their own table**, so a user row can be selected, logged, or
serialised without a password digest travelling alongside it.

---

## 7. Scope boundary

Implemented now: registration, login, session resolution, logout, RBAC
primitives, both transports.

Deferred, with reasons:

| Item | Phase | Why |
|---|---|---|
| Short-lived access + refresh rotation | Mobile | The schema already distinguishes transports and TTLs; rotation is only useful once a real offline client exists |
| `src/middleware.ts` security headers | Security | Needs its own bounded change and CSP decisions |
| Email verification / password reset | Security | Requires an email transport decision |
| Rate limiting on login | Security | Store must be pluggable; not Redis-by-default |
| OAuth providers | Later | No requirement yet; the schema admits an accounts table additively |

These are omissions of scope, not of correctness. Nothing implemented here has
to be undone to add them.

---

## 8. Consequences

- Identity is now a real foreign-key target. RISK-0013 ("dangling `learnerId`
  with no users table") can be closed as tables are migrated onto it.
- `/api/v2` mutating endpoints can be gated; until now there was nothing to gate
  them with.
- The platform still runs with only `DATABASE_URL` configured.
- Zero new dependencies, so the authentication core has no supply-chain surface
  and cannot be broken by an upstream deprecation — which is exactly how
  Options A and B failed.

---

## 9. Reversibility

Medium. The HTTP contract (`/api/auth/*`) and the service interface are
independent of the storage design, so an alternative could be swapped behind
them. Migrating existing users would require a password reset cycle, since
scrypt digests are not portable to another scheme — normal for any auth change.

**Confidence:** HIGH — both alternatives were eliminated by documented,
verifiable constraints rather than by preference.
