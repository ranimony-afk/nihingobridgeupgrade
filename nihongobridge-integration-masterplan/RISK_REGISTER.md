# RISK REGISTER — NihongoBridge Integration

Local Phase 00 update. Historical RISK-0009 (Repo B unavailable) is CLOSED.

---

### RISK-0001 — Schema Conflicts Between Repositories

**Date Identified:** 2025-01-01  
**Phase:** 00–01  
**Status:** OPEN (confirmed)  
**Severity:** CRITICAL  
**Probability:** HIGH  
**Impact:** CRITICAL  

Identical table names with text vs uuid PKs. Mitigation: DEC-0010. Contingency: do not apply B migrations.

---

### RISK-0002 — Authentication Incompatibility

**Status:** OPEN (confirmed)  
**Severity:** HIGH  
**Mitigation:** DEC-0011. Design A auth from scratch in Phase 01.

---

### RISK-0009 — Repo B Unavailable

**Status:** CLOSED  
**Date Closed:** 2026-03-25  
**Resolution:** Cloned https://github.com/ranimony-afk/Knowledge-base-NihongoBridge and audited.

---

### RISK-0010 — Auth Must Be Built From Scratch

**Status:** OPEN  
**Severity:** HIGH  
**Phase:** 01  
**Description:** Neither local nor GitHub A has identity. GitHub A already has learner-mutating routes.  
**Mitigation:** Implement auth before exposing `/api/v2` mutators.

---

### RISK-0012 — Local Sandbox Diverges From GitHub A

**Date Identified:** 2026-03-25  
**Status:** OPEN  
**Severity:** CRITICAL  
**Probability:** HIGH  
**Impact:** CRITICAL  

**Description:** This workspace is a blank starter; GitHub A `main` contains schema, APIs, services, ETL. Integrating B into local without reconciling GitHub A forks the canonical repo.

**Mitigation:** DEC-0009. Phase 01 ports GitHub A foundation additively.

**Contingency:** Stop implementation and re-sync from GitHub A before any B code.

**Owner:** Integration Team  
**Related:** DEC-0009, C-001

---

### RISK-0013 — Dangling learnerId Without Users Table

**Date Identified:** 2026-03-25  
**Status:** OPEN  
**Severity:** HIGH  
**Description:** GitHub A progress/SRS/XP tables reference `learnerId` with no FK.  
**Mitigation:** Additive identity table + backfill in Phase 01/04. No silent dummy users in production.

---

### RISK-0014 — ETL Parsers Are Stubs

**Status:** OPEN  
**Severity:** HIGH  
**Description:** GitHub A JMdict pipeline yields 0 records. Knowledge data cannot load until parsers are ported from B Python.  
**Mitigation:** ETL phase MERGE of `jmdict_parser.py` / Tatoeba into TypeScript.  
**Related:** C-010

---

### RISK-0015 — Competing Search Backends

**Status:** MITIGATED (decision) / OPEN (if someone copies B)  
**Severity:** HIGH  
**Mitigation:** DEC-0012.

---

### RISK-0016 — Missing .gitignore

**Status:** OPEN  
**Severity:** HIGH  
**Description:** Local and GitHub A lack `.gitignore`.  
**Mitigation:** Add in Phase 01. Do not commit `.env`.

---

### RISK-0017 — License / Copyrighted UI

**Status:** OPEN  
**Severity:** HIGH  
**Description:** Pressure to "look like" Takoboto/Duolingo/WaniKani or to import unlicensed dumps.  
**Mitigation:** A's source registry; provenance table; no scraping.

---

### RISK-0018 — Stale Architecture Freeze

**Status:** OPEN  
**Severity:** MEDIUM  
**Description:** TARGET_ARCHITECTURE.md frozen on "0 tables / green field". Following it blindly will re-litigate schema that already exists on GitHub A.  
**Mitigation:** Phase 01 doc update; treat GitHub A schema as the freeze input.

---

### RISK-0019 — Next 14 vs Next 16 Incompatibility

**Status:** OPEN  
**Severity:** MEDIUM  
**Description:** B packages are Next 14 / React 18. A is Next 16 / React 19. Direct file copies will fail typecheck/build.  
**Mitigation:** DEC-0013. Rewrite against A's stack; do not npm-install B apps.

---

### RISK-0020 — In-Memory SRS Sessions

**Status:** OPEN  
**Severity:** MEDIUM  
**Description:** GitHub A `ReviewSession` uses a process `Map`.  
**Mitigation:** Durable session in SRS phase. Do not add Redis solely because B has ioredis.

---

## Closed / accepted

| ID | Status | Note |
|---|---|---|
| RISK-0009 | CLOSED | Repo B cloned and inventoried |
