# PHASE 00 — Security Baseline (Read-Only)

**Date:** 2026-03-25  
**No secrets printed.** Local `.env` contains `DATABASE_URL` only.

---

## 1. Inventory of sensitive surfaces

| Surface | Local | GitHub A | Repo B |
|---|---|---|---|
| `.gitignore` | **Missing** | **Missing** | Present in packages |
| `.env` committed? | Present in workspace (platform-managed); must never be committed to GitHub | Not in clone | `.env.example` in several packages |
| LICENSE | Missing | Missing | Missing at repo root |
| Auth | None | None | Supabase JWT ×3 + header bypass |
| Mutating APIs | None | Unauthenticated | JWT (and bypass) |
| Secrets in code | None found | None found | Env-based |
| Admin | None | None | RBAC tables + login page |
| File upload / S3 | None | None | S3 + MinIO clients |
| SSRF/TTS | None | TTS route | edge-tts, TTS pipeline |

---

## 2. Critical findings

### SEC-009 — Missing `.gitignore` (CRITICAL)

Neither local sandbox nor GitHub A root has `.gitignore`. Risk of committing `.env`, `.next`, `node_modules`.

**Phase 01 must-do.** Not created in Phase 00 (read-only).

### SEC-010 — No identity / open GitHub A mutators (HIGH)

If GitHub A routes are ported without auth, learners can spoof `learnerId` on SRS/XP/progress.

### SEC-011 — Insecure user header in B (HIGH)

`ALLOW_INSECURE_USER_HEADER=true` accepts `x-user-id`. Must never be ported.

### SEC-012 — Three parallel JWT verifiers (HIGH)

API / AI / Admin each implement auth. Drift risk. Another reason not to copy.

### SEC-013 — Dependency CVEs

Not re-audited with `npm audit` in this phase (no package changes). Prior GitHub A notes mentioned Next/postcss/nanoid/sharp. Local uses Next `16.2.6`. Re-run `npm audit` in Phase 01 before adding libraries.

### SEC-014 — No security headers middleware

No `middleware.ts` on A. B admin has middleware bound to B auth (do not copy as-is).

### SEC-015 — In-memory session Map

GitHub A SRS review sessions are process-local. Not a secret leak, but not multi-instance safe.

---

## 3. OWASP-oriented snapshot (pre-production local)

| Item | Score (0–1) | Note |
|---|---|---|
| Broken access control | 0 | No auth; few routes |
| Cryptographic failures | 0.5 | DB URL in env; no secrets manager story |
| Injection | 0.7 | Drizzle parameterized; keep it that way |
| Insecure design | 0.4 | No threat model yet |
| Security misconfiguration | 0.2 | No gitignore, starter defaults |
| Vulnerable components | unknown | Re-audit Phase 01 |
| Auth failures | n/a | No auth |
| Integrity | 0.5 | No lock on GitHub A extra files vs local |
| Logging | 0.2 | Health only |
| SSRF | n/a locally | TTS later |

Local is a starter: low attack surface, low security maturity.

---

## 4. License / provenance

GitHub A `etl/sources/registry.ts` records JMdict / KANJIDIC2 as CC-BY-SA-4.0 (EDRDG) and registers Tatoeba. **This is the correct approach.**

Do not import:

- Takoboto / Duolingo / Todaii / WaniKani content or UI
- Unlicensed scraped dumps
- B seed data without source/version/license rows in `source_provenance`

---

## 5. Phase 01 security must-do (not done now)

1. Add `.gitignore` (`.env`, `.next`, `node_modules`, coverage, ETL raw dumps)
2. Add `.env.example` with `DATABASE_URL=` only at first
3. Decide auth (DEC-0005 / DEC-0011)
4. Do not copy B auth bypass
5. Keep using Drizzle (no string-concat SQL)
6. Do not log tokens

---

## 6. Evidence

- `ls` local root: no `.gitignore`
- `ls` `/tmp/repo-a`: no `.gitignore`
- B auth bypass: `nihongobridge-ai/lib/auth.ts` `ALLOW_INSECURE_USER_HEADER`
- Health route: `src/app/api/health/route.ts`
