# PHASE 00 — Authentication Analysis

**Date:** 2026-03-25  
**Rule:** Do not swap authentication. Do not implement auth in this phase.

---

## 1. Local sandbox (A-local)

| Question | Evidence | Result |
|---|---|---|
| Auth provider? | No next-auth, lucia, clerk, supabase, jose in `package.json` | **Absent** |
| Session? | No middleware.ts, no cookies | **Absent** |
| User table? | `src/db/schema.ts` is empty | **Absent** |
| RBAC? | None | **Absent** |
| Token format? | None | **Absent** |
| Password hashing? | None | **Absent** |

`GET /api/health` is public (correct).

---

## 2. GitHub A (canonical GitHub tree)

| Question | Evidence | Result |
|---|---|---|
| Auth provider? | `package.json` has no auth library | **Absent** |
| middleware.ts? | Not present | **Absent** |
| JWT/jose usage? | Only unrelated "authoritative" comments in SRS sync | **Absent** |
| User / identity table? | 39 tables; none are `users`/`sessions`/`accounts` | **Absent** |
| Learner identity? | `learnerId: text` on progress, SRS, XP, streaks, bookmarks | **Unbound string** |
| Route protection? | Mutating `/api/v2/*` and `/api/ai/*` have no auth checks | **Open** |

Masterplan DEC-0003 says "Repository 1 authentication is authoritative." That is **vacuous**: there is no implementation to preserve. DEC-0005 (PROPOSED) already recorded this and recommended Auth.js v5 as a candidate, pending Phase 01.

GitHub A TARGET_ARCHITECTURE describes cookie sessions (web) + Bearer (mobile) as a **specification**, not code.

---

## 3. Repository B

### 3.1 Shared pattern (three copies)

Packages `nihongobridge-api`, `nihongobridge-ai`, `nihongobridge-admin` each contain `lib/auth.ts` using `jose`:

1. Read `Authorization: Bearer <token>`
2. If `SUPABASE_JWT_SECRET` → `jwtVerify` HS256, audience `authenticated`
3. Else if `SUPABASE_URL` → remote JWKS at `/auth/v1/.well-known/jwks.json`
4. `sub` becomes user id; roles from `role` / `app_metadata`
5. AI package also maps subscription tier `free|premium`
6. Non-production bypass: header `x-user-id` when `ALLOW_INSECURE_USER_HEADER=true`

### 3.2 Knowledge `users` table

UUID PK, email, username, display name, avatar, target/current JLPT, study languages (`en|ta|ml|hi`), streak, xp. This is a **profile** table, not a credential store. No password hash, no oauth accounts, no sessions. Identity is assumed to live in Supabase Auth.

### 3.3 Admin RBAC

`admin_user_roles` with enum `super_admin` and others; `admin_audit_logs`. Admin `middleware.ts` gates `/admin`. Login page exists (`app/login/page.tsx`).

### 3.4 Flutter

`lib/core/api/auth_token_store.dart` + `lib/features/auth/auth_repository.dart` store Bearer tokens and attach them to `api_client.dart`. No first-party IdP implementation in the Flutter tree.

### 3.5 Web learner app

No NextAuth. Relies on API + demo session helpers (`lib/demo-session.ts`). Not a production auth UI.

---

## 4. Classification of B auth

| Component | Classification | Reason |
|---|---|---|
| Supabase JWT verifier | DEPRECATE as A's identity | Would introduce a second auth system and a SaaS IdP A does not use |
| `x-user-id` bypass | DO NOT PORT | Insecure; violates production security |
| `users` profile columns | MERGE ideas | Additive profile table after A's identity exists |
| Admin role enum / audit log | MERGE later | Admin phase |
| Flutter token store | KEEP pattern | Retarget to A's tokens in Phase 08 |
| Duplicate auth.ts ×3 | ARCHIVE | Competing copies |

---

## 5. Options for Phase 01 (do not implement now)

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Auth.js v5 (Auth.js) | App Router, OAuth + credentials, ecosystem | Extra dependency; session strategy must also serve Flutter | **Primary candidate** (DEC-0005) |
| Lucia / custom cookies + jose | Full control | Easy to get wrong; more code | Fallback |
| Custom jose access+refresh | Mobile-friendly Bearer | Must also do web cookies/CSRF | Needed **in addition** for Flutter regardless |
| Adopt Repo B Supabase | Existing B clients | Violates "no auth swap"; couples A to Supabase; B still has no credential tables in-app | **Rejected** (DEC-0011) |

Required capabilities (from master plan, not from B):

- Web session (httpOnly cookie)
- Mobile Bearer token
- RBAC (learner vs admin/editor)
- No competing parallel auth systems
- Identity table in the **same** PostgreSQL as knowledge

---

## 6. Security implications if ignored

GitHub A's mutating APIs accept any `learnerId`. If those routes are ported without auth, XP/SRS/progress can be forged. Phase 01 must add identity **before** exposing those routes publicly.

Local sandbox currently has no such routes — risk is latent until port.

---

## 7. Evidence

- Local: `package.json` dependencies = dotenv, drizzle-orm, next, pg, react, react-dom
- GitHub A: same; `rg` for jose/jwt/next-auth in `src` finds no auth library
- B API: `/tmp/repo-b/nihongobridge-api/lib/auth.ts`
- B AI: `/tmp/repo-b/nihongobridge-ai/lib/auth.ts`
- B Admin: `/tmp/repo-b/nihongobridge-admin/lib/auth.ts`
- B users: `/tmp/repo-b/nihongobridge-knowledge/schema/users.ts`
