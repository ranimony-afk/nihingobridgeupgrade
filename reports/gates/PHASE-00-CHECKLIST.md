# Phase 00 — Discovery & Audit Checklist

**Date:** 2026-03-25  
**Gate status:** CONDITIONAL PASS  
**Production code modified:** NO  
**Scope:** Read-only audit of local sandbox, GitHub Repository A, and GitHub Repository B

This checklist supersedes `nihongobridge-integration-masterplan/checklists/phase-00-checklist.md` on GitHub A (that gate assumed Repo B was unavailable and Repo A was an empty starter).

---

## Gate requirements

All mandatory items must pass before Phase 01. Phase 01 must **not** start in the same implementation step as this audit.

| Item | Status | Evidence |
|---|---|---|
| Repository A (local sandbox) inventoried | PASS | `reports/audits/repo-a-inventory.csv` |
| Repository A (GitHub canonical) inventoried | PASS | `reports/audits/repo-a-inventory.csv` + `reports/audits/repo-audit.md` |
| Repository B inventoried | PASS | `reports/audits/repo-b-inventory.csv` |
| Database schemas compared | PASS | `reports/audits/database-comparison.md` |
| API routes compared | PASS | `reports/audits/api-comparison.md` |
| Authentication analysed | PASS | `reports/audits/authentication-analysis.md` |
| Conflicts identified | PASS | `reports/audits/conflict-analysis.md` |
| Integration classification matrix | PASS | `reports/audits/decision-matrix.md` |
| Capability map (B → A) | PASS | `reports/audits/capability-map.md` |
| Security baseline | PASS | `reports/audits/security-baseline.md` |
| Decision log updated | PASS | `nihongobridge-integration-masterplan/DECISION_LOG.md` |
| Risk register updated | PASS | `nihongobridge-integration-masterplan/RISK_REGISTER.md` |
| Production code unchanged | PASS | `src/` not edited in this phase |
| No blind merge performed | PASS | No Repo B directories copied |

---

## Repository audit (P01)

- [x] Local sandbox complete file inventory
- [x] GitHub `nihingobridgeupgrade` complete file inventory (143 tracked files)
- [x] GitHub `Knowledge-base-NihongoBridge` package + source inventory
- [x] Every significant file classified KEEP / MODIFY / MERGE / MOVE / DEPRECATE / REPLACE / ARCHIVE
- [x] File purposes documented
- [x] Dependencies mapped (stack, schema, API, clients)

## Database audit (P02)

- [x] Local schema documented — empty (`export {}`), 0 tables
- [x] GitHub A schema documented — 39 tables, 15 enums, 2081 lines
- [x] Repo B knowledge/admin/ai schemas documented
- [x] Schema comparison report produced
- [x] Conflicts identified (same table names, different PK types and columns)
- [x] Gaps identified (no identity/users table on GitHub A; no courses on Repo B knowledge)
- [x] Database dependency map produced

## API audit (P03)

- [x] Local API inventoried — `GET /api/health` only
- [x] GitHub A API inventoried — 31 route handlers
- [x] Repo B API inventoried — 33 + 5 AI + 5 admin routes
- [x] Route conflicts identified
- [x] Backward compatibility: `/api/health` must remain
- [x] Consumer map produced (web, Flutter, admin, none for local)

## Authentication audit

- [x] Local auth documented — none
- [x] GitHub A auth documented — none (learnerId is unbound text)
- [x] Repo B auth documented — `jose` + Supabase JWT (HS256 or JWKS)
- [x] Auth decision **not** executed (DEC-0005 remains open; DEC-0011 rejects blind adoption)
- [x] Security implications reviewed

## Conflict / classification

- [x] Conflicts between A and B identified with severity
- [x] Resolution recommended for each conflict
- [x] Integration matrix with confidence and migration risk

## Self-review

- [x] Prior GitHub A Phase 00 reports marked ARCHIVE (Repo B was missing; GitHub A later grew)
- [x] Three-way discrepancy (local vs GitHub A vs Repo B) documented as RISK-0012
- [x] No production code, schema push, or package install performed
- [x] No DROP / TRUNCATE / auth swap

## Gate approval

- [x] Phase 00 audit complete with Repo B evidence
- [x] Critical blockers documented, not ignored
- [x] **CONDITIONAL PASS** — proceed to Phase 01 Architecture/Foundation only after this report is accepted
- [ ] Phase 01 implementation — **NOT STARTED** (stop condition honoured)

### Conditions for Phase 01

1. Treat GitHub A's 39-table Drizzle schema as the canonical *candidate*, not Repo B's UUID schema.
2. Reconcile local sandbox (blank starter) with GitHub A (domain code present) before adding Repo B code.
3. Do not copy `nihongobridge-api`, `nihongobridge-web`, `nihongobridge-admin`, or `nihongobridge-ai` as nested Next.js apps.
4. Do not introduce Supabase JWT as the identity system without an accepted DEC.
5. Do not enable Meilisearch in v1; PostgreSQL FTS / `pg_trgm` is the initial search backend.
6. Keep `/api/health` behaviour unchanged.
