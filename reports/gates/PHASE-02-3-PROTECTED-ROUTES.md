# Phase 02.3 — Protected API Routes and Pages

**Date:** 2026-03-25
**Gate status:** PASS

---

## Deployment gate: unauthenticated access is rejected correctly

```
npm run test:smoke  →  51 tests, 51 pass, 0 fail
```

22 of those cover protection. Every protected surface was probed anonymously,
with forged credentials, and with header-forgery bypasses.

| Surface | Anonymous | Learner | Admin |
|---|---|---|---|
| `GET/PATCH /api/v2/me/profile` | **401** | 200 | 200 |
| `GET/PATCH /api/v2/me/preferences` | **401** | 200 | 200 |
| `GET /api/admin/users` | **401** | **403** | 200 |
| `/dashboard` | **307 → /login** | 200 | 200 |
| `/admin` | **307 → /login** | **403 view** | 200 |
| `/api/health`, `/`, `/api/auth/session` | 200 (public, unchanged) | | |

401 and 403 are deliberately distinct. Returning 401 to a signed-in learner
would tell them to sign in again, which cannot fix a missing role.

---

## The finding that shaped the design

Researching where to enforce authorization surfaced **CVE-2025-29927**: a 9.1
critical flaw where any Next.js middleware check could be skipped with a single
`x-middleware-subrequest` header.

Checking our own tree was worse. `npm audit` reported a **live, unpatched**
advisory against our exact configuration:

> **GHSA-6gpp-xcg3-4w24** — *Middleware / Proxy bypass in App Router
> applications using Turbopack*, HIGH, affects `>=16.0.0 <16.2.11`

We were on **16.2.6**, building with **Turbopack**. Had I put authorization in
middleware and stopped there, this phase would have shipped a bypassable
security boundary that passed every test.

Two consequences:

**1. Upgraded Next 16.2.6 → 16.3.5.** This cleared the middleware bypass *and*
two criticals below 16.3.3 (unauthenticated RCE on Windows hosts; RCE via the
image optimiser). `npm audit` now reports **no advisories for `next`**.
Typecheck, build, and all tests pass on the new version.

**2. Authorization is enforced in handlers and pages, not middleware.** The
upgrade fixes today's bypass; it does not change the structural fact that a
check running *before* the handler can be routed around, while a check inside
the handler cannot. Datadog's guidance on the CVE says the same: *"Ensure that
critical security checks are reinforced beyond middleware."*

So:

| Layer | Role |
|---|---|
| `src/lib/auth-guard.ts` in each handler/page | **the security boundary** |
| `src/middleware.ts` | security headers + sign-in redirect for UX |

Middleware only checks whether a session cookie is *present* — it never
validates it. If middleware is skipped entirely, the page's own guard still
rejects the request. The file says so in its header comment, so nobody later
mistakes it for the boundary.

Three smoke tests fire the documented bypass headers at both an API route and a
protected page and assert access is still refused.

---

## What was built

**Guards** (`src/lib/auth-guard.ts`) — `requireAuth`, `requireRoleAtLeast`,
`requireSelf`, `optionalAuth`. Each throws a typed error that route handlers
convert into the frozen envelope.

**Protected APIs** — `/api/v2/me/profile` and `/api/v2/me/preferences` (read and
partial update), `/api/admin/users` (admin-only, paginated).

"me" is resolved from the session, never from a path parameter, so there is no
id for a client to tamper with. `requireSelf` exists for the later routes that
do take an id.

**Protected pages** — `/dashboard` (learner), `/admin` (role-gated),
`/login` (redirects away if already signed in).

**Middleware** — five security headers on every response, plus the redirect.

---

## Adversarial coverage

Beyond the happy path, the suite asserts:

- forged bearer tokens and forged session cookies are rejected
- malformed `Authorization` headers (`Basic …`, bare `Bearer`, path traversal) are rejected
- a **revoked** session cannot be replayed — proven by signing in, logging out, and retrying the same cookie
- forged identity headers (`x-admin-role: super_admin`, `x-user-id`) are ignored, closing Repository B's header-trust pattern
- a 401 response leaks no user data: no email, timezone, hash, or cookie name
- protected page markup is never sent to an anonymous visitor
- private responses carry `cache-control: private, no-store`
- the `?next=` parameter cannot become an open redirect

---

## A test I had to correct rather than accept

The open-redirect test initially failed, asserting `evil.example.com` was
absent from the login page HTML.

Before changing anything I probed the running server to establish whether this
was a real vulnerability:

```
status:                 200
location:               (none)
rendered destination:   ["/dashboard"]
evil string present:    true  → inside the RSC flight payload
```

The guard was working: no redirect was issued and the rendered destination was
the safe fallback. The string appeared only in Next's serialised router state,
which echoes the request URL regardless of what the page does with it.

The assertion was testing the framework's serialisation, not our guard. I
rewrote it to assert the actual security properties — no `Location` header, no
`href` to the foreign origin, fallback to `/dashboard` — and widened it to
three hostile inputs including the protocol-relative `//evil.example.com`.

This is a case where the test encoded the wrong expectation. The distinction
matters: I verified the underlying behaviour first, and the replacement test is
stricter about what actually counts.

---

## Verification

| Layer | Tests | Result |
|---|---|---|
| Unit | 89 | pass |
| Integration | 20 | pass |
| API + smoke | 60 | pass |
| Migration gate | 34 checks × 2 databases | pass |
| **Total** | **169** | **pass** |

`npm run verify` passes end to end. Build output shows 11 routes plus
middleware; `/api/health` remains `{ ok: true }`.

---

## Gate approval

- [x] Protected API routes implemented
- [x] Protected pages implemented
- [x] **Unauthenticated access rejected correctly** — 401 for APIs, redirect for pages
- [x] Authenticated-but-unauthorised correctly separated (403, not 401)
- [x] Middleware bypass attempts do not grant access
- [x] Forged identity headers ignored
- [x] Next.js upgraded to clear a live middleware-bypass advisory and two criticals
- [x] `npm run verify` passes
- [x] **APPROVED**
