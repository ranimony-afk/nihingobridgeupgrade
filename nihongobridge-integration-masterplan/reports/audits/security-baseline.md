# SECURITY BASELINE — Phase 00, Prompt 05

**Date:** 2025-07-16
**Phase:** Phase 00 — Discovery & Audit — Security Audit
**Auditor:** Integration Team (Arena AI)
**Status:** COMPLETE
**Mode:** READ-ONLY — No modifications made

---

## 1. Executive Summary

A comprehensive read-only security audit was performed across every application source file, configuration file, database connection, environment variable, build artifact, and npm dependency. The findings paint a clear picture: **this is a starter template with no security infrastructure yet built.** There are zero authentication, authorization, session, CSRF, CORS, rate-limiting, input validation, or logging implementations.

### Risk Rating: **PRE-PRODUCTION — NOT DEPLOYMENT-READY**

The application has no user-facing security controls. This is expected for a starter template at Phase 00. All security infrastructure must be built during Phase 01+.

### Critical Findings Count

| Severity | Count | Category |
|---|---|---|
| 🔴 CRITICAL | 4 | Missing auth, npm CVEs, default DB creds, no .gitignore |
| 🟠 HIGH | 6 | No middleware, no RBAC, no input validation, XSS vector, no CORS, no security headers |
| 🟡 MEDIUM | 5 | No rate limiting, no logging, no CSP, fs access in API, pool exported |
| 🟢 LOW | 3 | No API key support, no CSRF token, no error sanitization |
| ℹ️ INFO | 2 | Drizzle parameterized queries (positive), Server Components only (positive) |

---

## 2. Authentication

### 2.1 Current State

| Component | Status | Evidence |
|---|---|---|
| Auth provider | **ABSENT** | No auth library installed (no `next-auth`, `lucia`, `@auth/core`, `jsonwebtoken`, `bcrypt`) |
| Login/register routes | **ABSENT** | No `/api/auth/*` routes exist |
| Session management | **ABSENT** | No session table, no session cookie handling |
| User table | **ABSENT** | No user schema defined in `src/db/schema.ts` |
| Password hashing | **ABSENT** | No `bcrypt`, `argon2`, `scrypt` dependencies |
| Token management | **ABSENT** | No JWT signing/verification code |
| OAuth integration | **ABSENT** | No OAuth provider configuration |
| `middleware.ts` | **ABSENT** | No middleware file at root or in `src/` |
| Auth environment variables | **ABSENT** | No `NEXTAUTH_SECRET`, `AUTH_SECRET`, or similar |

### 2.2 Finding: SEC-001 — No Authentication (CRITICAL)

**All routes and pages are publicly accessible without authentication.**

- `GET /api/health` — Public by design (correct)
- `GET /api/masterplan` — Public (scaffolding — acceptable)
- All Server Component pages — Public (no session check)

**Impact:** When domain routes are added in Phase 01+, there will be no auth gate unless built first.

**Remediation:** Implement auth as the first Phase 01 task, before any authenticated API routes are created. Decision DEC-0005 (auth library choice) must be resolved.

---

## 3. Authorization / RBAC

### 3.1 Current State

| Component | Status |
|---|---|
| Role definitions | **ABSENT** — no user roles defined |
| Role-based access control | **ABSENT** — no middleware or guard checking roles |
| Admin route protection | **ABSENT** — no `/api/admin/*` routes exist |
| Editor permissions | **ABSENT** — no editorial workflow |
| API key authorization | **ABSENT** — no programmatic access support |

### 3.2 Finding: SEC-002 — No Authorization (HIGH)

No role-based access control exists. When admin routes are created, they must be gated by role checks from day one.

**Remediation:** Define RBAC roles (user, editor, admin) in the auth schema. Create middleware or guards that verify role before granting access.

---

## 4. Session & Cookie Security

### 4.1 Current State

| Component | Status |
|---|---|
| Session cookies | **ABSENT** — no cookies are set |
| `httpOnly` flag | **N/A** — no cookies |
| `Secure` flag | **N/A** — no cookies |
| `SameSite` attribute | **N/A** — no cookies |
| Session expiration | **N/A** — no sessions |
| Session rotation | **N/A** — no sessions |
| Session revocation | **N/A** — no sessions |

### 4.2 Finding: SEC-003 — No Session Management (HIGH)

**Remediation (Phase 01):** When auth is implemented:
- Set `httpOnly: true` on all auth cookies
- Set `Secure: true` in production
- Set `SameSite: lax` (or `strict` for admin routes)
- Implement session expiration (e.g., 30 days)
- Implement session rotation on privilege change
- Store sessions server-side (database), not in JWT alone

---

## 5. JWT / Token Security

### 5.1 Current State

No JWT tokens are issued or verified by application code. Next.js internally uses `jsonwebtoken` (found in `.next/` build artifacts as a compiled dependency), but this is framework-internal and not exposed to application code.

### 5.2 Finding: SEC-004 — No Token Strategy Defined (MEDIUM)

For mobile consumers (Flutter), Bearer token auth will be needed. The token strategy must define:
- Token signing algorithm (RS256 recommended over HS256)
- Token expiration (short-lived access tokens, longer refresh tokens)
- Token refresh flow
- Token revocation capability
- Secure storage guidance for mobile clients

---

## 6. CSRF Protection

### 6.1 Current State

| Component | Status |
|---|---|
| CSRF tokens | **ABSENT** |
| Double-submit cookie | **ABSENT** |
| `SameSite` cookie attribute | **N/A** (no cookies) |
| Server Actions | **ABSENT** (no server actions exist) |
| Form submissions | **ABSENT** (no forms exist) |

### 6.2 Finding: SEC-005 — No CSRF Protection (LOW)

Currently LOW severity because no state-changing operations exist. When POST/PUT/DELETE routes are added:

**Remediation:**
- Next.js Server Actions include built-in CSRF protection via origin checking
- For API routes accepting form submissions, add CSRF token validation
- `SameSite: lax` cookies provide baseline CSRF protection for same-site requests

---

## 7. CORS Configuration

### 7.1 Current State

| Component | Status | Evidence |
|---|---|---|
| CORS headers | **DEFAULT** (Next.js defaults) | No CORS config in `next.config.ts` |
| `Access-Control-Allow-Origin` | **NOT SET** | No explicit CORS headers |
| `Access-Control-Allow-Methods` | **NOT SET** | Default behavior |
| Preflight handling | **DEFAULT** | Next.js handles OPTIONS automatically |

### 7.2 Finding: SEC-006 — No CORS Configuration (HIGH)

**Impact:** When the Flutter mobile app (Phase 08) makes cross-origin requests, they will be blocked by the browser's same-origin policy (if testing via web) or need explicit CORS headers for proper mobile-to-server communication.

**Remediation (Phase 01):**
```typescript
// next.config.ts
const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: "/api/:path*",
      headers: [
        { key: "Access-Control-Allow-Origin", value: process.env.ALLOWED_ORIGINS || "" },
        { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
        { key: "Access-Control-Allow-Headers", value: "Content-Type,Authorization" },
      ],
    }];
  },
};
```

---

## 8. Rate Limiting

### 8.1 Current State

| Component | Status |
|---|---|
| Rate limiting middleware | **ABSENT** |
| Per-IP limiting | **ABSENT** |
| Per-user limiting | **ABSENT** |
| AI endpoint limiting | **ABSENT** |
| Brute-force protection | **ABSENT** |

### 8.2 Finding: SEC-007 — No Rate Limiting (MEDIUM)

API_CONTRACT.md defines rate limits (60/min public, 300/min auth, 30/min AI, 120/min admin), but none are implemented.

**Remediation (Phase 01 or 09):** Implement rate limiting via middleware or `next-rate-limit` / `upstash/ratelimit`. Critical for:
- Login endpoints (brute-force protection)
- AI endpoints (cost control)
- Public search (abuse prevention)

---

## 9. Input Validation & Injection

### 9.1 SQL Injection

| Finding | Status | Evidence |
|---|---|---|
| Parameterized queries | ✅ **SAFE** | Drizzle ORM uses parameterized queries exclusively |
| Raw SQL with interpolation | ✅ **NONE FOUND** | `grep 'sql\`.*\${'` returned 0 matches in `src/` |
| User input in queries | ✅ **NONE** | No routes accept user input yet |

**Assessment:** Drizzle ORM's `sql` tagged template literal automatically parameterizes values. The only SQL in the codebase is `sql\`select 1\`` — zero injection risk. This is an inherent positive of using Drizzle.

### 9.2 XSS (Cross-Site Scripting)

| Finding | Severity | Evidence |
|---|---|---|
| `dangerouslySetInnerHTML` usage | 🟠 **HIGH** | `src/app/docs/[slug]/page.tsx:216` |

**Detail:** The `MarkdownRenderer` component in the doc viewer uses `dangerouslySetInnerHTML` to render parsed markdown as HTML. The content source is local markdown files from the masterplan directory (not user input), which limits the attack surface. However:

1. The `escapeHtml()` function is applied to text content ✅
2. The markdown parsing is custom (not a hardened library) ⚠️
3. If this pattern is copied to user-generated content, it becomes an XSS vector 🔴

**Remediation:**
- This specific instance is acceptable because the content source is trusted (local files)
- When building production content rendering, use a hardened markdown library (e.g., `remark` + `rehype-sanitize`)
- NEVER use `dangerouslySetInnerHTML` with user-supplied content without sanitization
- Archive this component (classified as ARCHIVE in decision matrix)

### 9.3 Path Traversal

| Finding | Status | Evidence |
|---|---|---|
| Path traversal in API routes | ✅ **MITIGATED** | `/api/masterplan` uses hardcoded base path, no user input in paths |
| `../` in route handlers | ✅ **NONE** | grep found 0 matches |

**Detail:** The `/api/masterplan` route reads files from disk, but the root directory is hardcoded:
```typescript
const rootDir = path.join(process.cwd(), "nihongobridge-integration-masterplan");
```
No user input influences file paths. Document filenames are from a hardcoded array. Safe.

### 9.4 Request Body Validation

| Finding | Status |
|---|---|
| Schema validation library | **ABSENT** (no `zod`, `yup`, `joi`, `ajv`) |
| Request body parsing | **N/A** (no routes accept request bodies) |
| Query param validation | **N/A** (no routes accept query params) |

**Remediation (Phase 01):** Install `zod` for request validation. Create validation middleware or helpers for all POST/PUT/PATCH routes.

---

## 10. Secrets & Environment Variables

### 10.1 Current State

| Variable | Value | Exposure Risk |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5432/app_db` | **CRITICAL** — default credentials |
| `NODE_ENV` | Read only, not set in `.env` | SAFE |

### 10.2 Finding: SEC-008 — Default Database Credentials (CRITICAL)

The database uses `postgres:postgres` as username:password. Acceptable for local development, **unacceptable for production.**

**Remediation (Phase 09):**
- Use strong, unique passwords in production
- Use environment-specific `.env` files (`.env.production`)
- Consider connection via Unix socket or IAM auth in cloud environments

### 10.3 Finding: SEC-009 — No .gitignore File (CRITICAL)

**There is no `.gitignore` file in the project root.** This means if this project were committed to git:
- `.env` (containing database credentials) would be committed
- `node_modules/` would be committed
- `.next/` build artifacts would be committed
- `.next/server/server-reference-manifest.json` contains an encryption key that would be exposed

**Remediation (Immediate):** Create `.gitignore` with standard Next.js exclusions:
```
node_modules/
.next/
.env
.env.local
.env.production
```

### 10.4 Finding: SEC-010 — Build Artifacts Contain Encryption Keys (MEDIUM)

Found in `.next/` (framework-internal, not application code):
- `.next/server/server-reference-manifest.json`: `encryptionKey: "iyAF8MuGVqFz4LbyYaF5Z5e7faKytvzj1weHC8P+CII="`
- `.next/prerender-manifest.json`: `previewModeEncryptionKey: "05f6814178cb7de7fa0a86acc69407899b845421dd74c3539dc335c585d3c5c2"`

These are Next.js internal keys for Server Actions encryption and preview mode. They are regenerated on each build. Not a direct application risk, but `.next/` must be in `.gitignore`.

### 10.5 Missing Environment Variables (Future Phases)

| Variable | Purpose | Phase | Sensitivity |
|---|---|---|---|
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | Auth session encryption | Phase 01 | **HIGH** |
| `NEXTAUTH_URL` / `AUTH_URL` | Auth callback URL | Phase 01 | LOW |
| `OPENAI_API_KEY` | AI provider | Phase 06 | **HIGH** |
| `ANTHROPIC_API_KEY` | AI provider (alt) | Phase 06 | **HIGH** |
| OAuth provider secrets | OAuth login | Phase 01 | **HIGH** |
| `ALLOWED_ORIGINS` | CORS whitelist | Phase 01 | LOW |

### 10.6 Client-Side Exposure

| Check | Status |
|---|---|
| `NEXT_PUBLIC_*` variables | **NONE** — no client-exposed env vars |
| `"use client"` directives | **NONE** — all components are Server Components |
| Sensitive data in client bundle | ✅ **NONE** — no domain data sent to client beyond HTML |

**Assessment:** Excellent. All current pages are Server Components. No sensitive data is exposed to the client bundle.

---

## 11. Security Headers

### 11.1 Current State

| Header | Status |
|---|---|
| `Content-Security-Policy` | **ABSENT** |
| `X-Frame-Options` | **ABSENT** (Next.js does NOT set by default) |
| `X-Content-Type-Options` | **ABSENT** |
| `Strict-Transport-Security` | **ABSENT** |
| `X-XSS-Protection` | **ABSENT** (deprecated but still useful) |
| `Referrer-Policy` | **ABSENT** |
| `Permissions-Policy` | **ABSENT** |

### 11.2 Finding: SEC-011 — No Security Headers (MEDIUM)

**Remediation (Phase 01 or 09):** Add security headers in `next.config.ts`:
```typescript
async headers() {
  return [{
    source: "/:path*",
    headers: [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ],
  }];
}
```

---

## 12. Database Security

### 12.1 Connection Security

| Check | Status | Detail |
|---|---|---|
| Connection string | Plaintext in `.env` | Acceptable for dev; use secrets manager in prod |
| SSL/TLS | **NOT CONFIGURED** | Local connection; required for remote/production |
| Connection pooling | ✅ Pool singleton | Prevents connection exhaustion |
| Pool size limits | **DEFAULT** | `pg.Pool` defaults to 10 connections |

### 12.2 Query Security

| Check | Status |
|---|---|
| Parameterized queries | ✅ Drizzle ORM enforces parameterization |
| Raw SQL injection risk | ✅ NONE — only `sql\`select 1\`` exists |
| Destructive operations | ✅ NONE — no DELETE/TRUNCATE/DROP in code |

### 12.3 Finding: SEC-012 — Database Pool Exported (MEDIUM)

`src/db/index.ts` exports both `pool` and `db`:
```typescript
export const pool = ...;
export const db = drizzle(pool);
```

Exporting `pool` directly allows any importing file to execute arbitrary SQL bypassing Drizzle's query builder. This is needed for some auth libraries (e.g., NextAuth.js adapter) but should be restricted.

**Remediation:** Consider not exporting `pool` directly, or documenting that direct pool access should only be used by the auth adapter.

---

## 13. Dependency Vulnerabilities

### 13.1 npm Audit Results

```
4 high severity vulnerabilities
```

| Package | Severity | CVEs / Advisories | Fix |
|---|---|---|---|
| `next` 16.2.6 | **HIGH** | GHSA-6gpp (middleware bypass), GHSA-m99w (DoS in Server Actions), GHSA-89xv (SSRF), GHSA-68g3 (cache confusion), GHSA-4c39 (unbounded payload), GHSA-p9j2 (SSRF via rewrites), GHSA-q8wf (image DoS), GHSA-955p (function endpoint disclosure) | Update to 16.3.1 |
| `postcss` ≤8.5.22 | **HIGH** | GHSA-qx2v (XSS in stringify), GHSA-6g55 (file read via sourcemap), GHSA-fxqj (incomplete fix), GHSA-r28c (path traversal) | Transitive via `next`; update next |
| `nanoid` ≤3.3.17 | **HIGH** | GHSA-28wg (infinite loop), GHSA-2v37 (zero-size loop) | Transitive via `postcss`; update next |
| `sharp` <0.35.0 | **HIGH** | GHSA-f88m (libvips CVEs) | Update next or sharp |

### 13.2 Finding: SEC-013 — High-Severity Dependency Vulnerabilities (CRITICAL)

4 high-severity vulnerability chains, all fixable by updating `next` to 16.3.1.

**Relevant active threats:**
- **SSRF in Server Actions** — If server actions are added, attackers could trigger server-side requests to internal services
- **Middleware bypass** — If middleware is added for auth, attackers could bypass it in some configurations
- **DoS via Server Actions** — Unbounded payload in Edge runtime

**Current exposure:** LOW (no server actions, no middleware, no image optimization in use), but must be fixed before adding those features.

**Remediation:** Run `npm audit fix` or update `next` to 16.3.1 in Phase 01.

---

## 14. File System Access

### 14.1 Finding: SEC-014 — API Route Reads File System (MEDIUM)

`/api/masterplan` reads files from disk using `fs.readdirSync` and `fs.readFileSync`. Analysis:

| Check | Status |
|---|---|
| User input in file paths | ✅ NONE — paths are hardcoded |
| Path traversal possible | ✅ NO — base path is fixed, filenames are from arrays |
| Sensitive files readable | ✅ NO — reads only masterplan markdown files |
| Production appropriate | ❌ NO — `fs` reads are not suitable for serverless/edge deployment |

**Remediation:** This route is classified as ARCHIVE. When removed, the fs access issue disappears. Do not replicate this pattern in production routes.

---

## 15. Logging & Monitoring

### 15.1 Current State

| Component | Status |
|---|---|
| Request logging | **ABSENT** |
| Error logging | **ABSENT** (errors are caught and silently returned as JSON) |
| Audit trail | **ABSENT** |
| Security event logging | **ABSENT** |
| Monitoring/alerting | **ABSENT** |

### 15.2 Finding: SEC-015 — No Security Logging (MEDIUM)

No logging exists anywhere. The health check route silently catches errors:
```typescript
catch {
  return Response.json({ ok: false }, { status: 500 });
}
```

**Remediation (Phase 09):** Implement structured logging for:
- Authentication attempts (success/failure)
- Authorization failures (403s)
- Rate limit violations
- Input validation failures
- Database errors
- AI API errors
- Admin actions (audit trail)

---

## 16. File Upload Security

### 16.1 Current State

No file upload functionality exists. No `multipart/form-data` handling, no file storage, no media processing.

### 16.2 Future Risk (Phase 04+)

When media/file uploads are added:
- Validate file type (allowlist, not blocklist)
- Validate file size (enforce limits)
- Scan for malware (if user-uploaded)
- Store outside web root
- Generate unique filenames (prevent path traversal)
- Serve via CDN with appropriate cache headers

---

## 17. AI Endpoint Security (Future — Phase 06)

### 17.1 Planned Concerns

| Concern | Mitigation Strategy |
|---|---|
| Prompt injection | Input sanitization, system prompt hardening |
| Cost abuse | Rate limiting (30 req/min per user), token budgets |
| Data exfiltration via AI | Restrict AI context to public knowledge data |
| API key exposure | Server-side proxy only; never expose to client |
| Response content safety | Content filtering on AI responses |
| PII in prompts | Warn users; don't log full prompts |

---

## 18. Security Baseline Scorecard

### 18.1 OWASP Top 10 Mapping

| OWASP Category | Current Status | Severity |
|---|---|---|
| A01: Broken Access Control | ❌ **NO ACCESS CONTROL EXISTS** | CRITICAL |
| A02: Cryptographic Failures | ⚠️ Default DB creds, no encryption | HIGH |
| A03: Injection | ✅ Drizzle ORM parameterizes queries | SAFE |
| A04: Insecure Design | ⚠️ No threat model, no security architecture | MEDIUM |
| A05: Security Misconfiguration | ❌ No security headers, no .gitignore | HIGH |
| A06: Vulnerable Components | ❌ 4 high-severity npm vulnerabilities | CRITICAL |
| A07: Auth Failures | ❌ No auth exists | CRITICAL |
| A08: Software/Data Integrity | ⚠️ No integrity checks on dependencies | MEDIUM |
| A09: Logging/Monitoring | ❌ No logging exists | MEDIUM |
| A10: SSRF | ⚠️ Next.js has known SSRF CVE (fix available) | HIGH |

### 18.2 Summary Score

| Dimension | Score (0-10) | Notes |
|---|---|---|
| Authentication | **0/10** | Nothing exists |
| Authorization | **0/10** | Nothing exists |
| Input Validation | **5/10** | Drizzle parameterizes queries (positive), but no request validation |
| Data Protection | **2/10** | No encryption, default creds, but no sensitive data stored yet |
| Transport Security | **3/10** | HTTPS handled by platform, but no HSTS header |
| Dependency Security | **2/10** | 4 high vulns; all packages current versions but with known CVEs |
| Logging & Monitoring | **0/10** | Nothing exists |
| Configuration | **2/10** | No .gitignore, no security headers, empty next.config |
| **Overall** | **1.75/10** | Pre-production starter template |

---

## 19. Remediation Priority Matrix

### Phase 01 (Must-Do)

| ID | Finding | Severity | Action |
|---|---|---|---|
| SEC-001 | No authentication | CRITICAL | Implement auth (DEC-0005) |
| SEC-009 | No .gitignore | CRITICAL | Create .gitignore immediately |
| SEC-013 | npm vulnerabilities | CRITICAL | Update `next` to 16.3.1 |
| SEC-002 | No authorization | HIGH | Implement RBAC with auth |
| SEC-003 | No session management | HIGH | Implement with auth library |
| SEC-006 | No CORS configuration | HIGH | Configure in next.config.ts |

### Phase 01-04 (Should-Do)

| ID | Finding | Severity | Action |
|---|---|---|---|
| SEC-007 | No rate limiting | MEDIUM | Add rate limiting middleware |
| SEC-011 | No security headers | MEDIUM | Add headers in next.config.ts |
| SEC-008 | Default DB credentials | CRITICAL (prod) | Change for production deployment |
| SEC-014 | FS access in API route | MEDIUM | Archive route when building real API |

### Phase 09 (Production Hardening)

| ID | Finding | Severity | Action |
|---|---|---|---|
| SEC-015 | No security logging | MEDIUM | Implement structured logging |
| SEC-004 | No token strategy | MEDIUM | Define token lifecycle for mobile |
| SEC-005 | No CSRF protection | LOW | Implement for form submissions |
| SEC-012 | DB pool exported | MEDIUM | Restrict direct pool access |

---

## 20. Positive Security Findings

Not everything is negative. The following are security-positive aspects of the current codebase:

| Finding | Detail |
|---|---|
| ✅ Drizzle ORM parameterized queries | Zero SQL injection risk in current code |
| ✅ Server Components only | No sensitive data leaked to client bundle |
| ✅ No `NEXT_PUBLIC_*` env vars | No secrets exposed to browser |
| ✅ No `"use client"` directives | All rendering is server-side |
| ✅ TypeScript strict mode | Type safety reduces certain bug classes |
| ✅ Modern dependency versions | All packages are latest or near-latest |
| ✅ Minimal attack surface | Only 2 routes, no user input, no state mutation |
| ✅ Empty database | No sensitive data to leak |

---

## 21. Conclusion

The security posture is that of a **blank starter template** — no security controls exist, but also no security-sensitive features exist. The attack surface is trivially small (2 read-only routes, no user input, no auth, no data).

This is the ideal starting point: **build security controls before building features that need them.** Phase 01 must establish authentication, authorization, session management, and CORS before any authenticated API routes are created.

The most urgent action items are:
1. Create `.gitignore` (prevent credential leaks)
2. Update `next` to patch known CVEs
3. Implement auth as first Phase 01 deliverable
4. Add security headers in `next.config.ts`
