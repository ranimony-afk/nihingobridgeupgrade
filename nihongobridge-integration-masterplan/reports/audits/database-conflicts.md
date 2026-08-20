# DATABASE CONFLICTS REPORT — Phase 00, Prompt 02

**Date:** 2025-07-16
**Phase:** Phase 00 — Discovery & Audit — Database Forensic Audit
**Auditor:** Integration Team (Arena AI)
**Status:** COMPLETE
**Mode:** READ-ONLY — No modifications made

---

## 1. Conflict Summary

### Current State: ZERO CONFLICTS

There are **no database conflicts** between the two repositories because Repository A has zero application tables. This report documents the *absence* of conflicts and identifies *potential* future conflicts that must be monitored when Repository B is inspected.

| Conflict Category | Count | Severity |
|---|---|---|
| Table name collisions | 0 | N/A |
| Column type mismatches | 0 | N/A |
| Foreign key conflicts | 0 | N/A |
| Index conflicts | 0 | N/A |
| Enum/type conflicts | 0 | N/A |
| Data conflicts | 0 | N/A |
| Schema namespace conflicts | 0 | N/A |
| Migration conflicts | 0 | N/A |
| Seed data conflicts | 0 | N/A |

---

## 2. Repository A Database Inventory

| Item | Value |
|---|---|
| Tables in `public` schema | 0 |
| Custom types | 0 |
| Sequences | 0 |
| Views | 0 |
| Functions | 0 |
| Triggers | 0 |
| Migration history | None |
| Drizzle schema definitions | 0 (empty `export {}`) |

**There is literally nothing in Repo A's database that could conflict with anything.**

---

## 3. Repository B Database — Anticipated Conflicts

Although no conflicts currently exist, the following areas represent *potential* conflict zones when Repository B schema becomes available. These are flagged proactively for monitoring.

### 3.1 Naming Convention Conflicts

**Risk: MEDIUM**

The master instruction specifically calls out `kg_*` prefixed tables in Repository B. The DOMAIN_MODEL.md uses unprefixed table names. This creates a naming mismatch:

| DOMAIN_MODEL.md Name | Likely Repo B Name | Resolution |
|---|---|---|
| `dictionary_entries` | `kg_dictionary` or `kg_entries` or `dictionary_entries` | Use DOMAIN_MODEL.md names; map Repo B names during ETL |
| `kanji` | `kg_kanji` or `kanji_entries` | Use DOMAIN_MODEL.md name `kanji` |
| `grammar_points` | `kg_grammar` or `grammar_patterns` | Use DOMAIN_MODEL.md name `grammar_points` |
| `example_sentences` | `kg_sentences` or `sentences` | Use DOMAIN_MODEL.md name `example_sentences` |
| `radicals` | `kg_radicals` or `kg_components` | Use DOMAIN_MODEL.md name `radicals` |

**Resolution Strategy:** Repository A schema follows DOMAIN_MODEL.md naming exactly. Repository B data is imported via ETL with column mapping. No Repo B table names are adopted directly.

### 3.2 Primary Key Type Conflicts

**Risk: LOW**

DOMAIN_MODEL.md specifies UUID primary keys for all tables. Repository B may use:
- Auto-incrementing integers (`SERIAL` / `BIGSERIAL`)
- String IDs from source data (e.g., JMdict `ent_seq`)
- UUIDs (matching)

| Scenario | Impact | Resolution |
|---|---|---|
| Repo B uses integers | LOW | Generate UUIDs during ETL; store original ID in `source_id` column |
| Repo B uses string source IDs | LOW | Generate UUIDs; store original in `source_id` |
| Repo B uses UUIDs | NONE | Direct mapping possible |

### 3.3 Column Name/Type Mismatches

**Risk: MEDIUM**

Common areas where schemas often diverge:

| Domain | Potential Mismatch | Resolution |
|---|---|---|
| Dictionary | `glosses` as text vs. JSONB vs. array | Normalize to JSONB in Repo A |
| Kanji | `readings` as single column vs. `on_readings` + `kun_readings` | Use separate columns per DOMAIN_MODEL.md |
| Grammar | `explanation` as text vs. JSONB vs. markdown | Normalize to text |
| SRS | Algorithm-specific fields (SM-2 vs. FSRS) | Use FSRS fields per DOMAIN_MODEL.md |
| Users | Auth-provider-specific columns | Depends on DEC-0005 |

### 3.4 Provenance Column Absence

**Risk: MEDIUM**

DOMAIN_MODEL.md requires provenance columns (`source`, `source_id`, `source_version`, `import_version`, `imported_at`) on all knowledge tables. Repository B may not have these columns.

| Scenario | Impact | Resolution |
|---|---|---|
| Repo B has no provenance | LOW | Add provenance during ETL import |
| Repo B has partial provenance | LOW | Supplement missing fields during ETL |
| Repo B has different provenance model | LOW | Map to DOMAIN_MODEL.md provenance columns |

### 3.5 Auth Schema Conflict

**Risk: HIGH (most critical potential conflict)**

The most dangerous potential conflict is in authentication tables. Repository B may define user/session/account tables that:
- Use different column names for email, name, role
- Use different session token formats
- Use different password hashing algorithms
- Include fields for a different auth provider (e.g., Clerk, Supabase Auth)

| Scenario | Impact | Resolution |
|---|---|---|
| Repo B uses NextAuth.js | LOW | Schema may be directly compatible |
| Repo B uses Prisma + auth | MEDIUM | Must translate Prisma schema |
| Repo B uses custom auth | HIGH | Must evaluate and decide: adapt or replace |
| Repo B uses external auth (Clerk, Supabase) | HIGH | Cannot use — build Repo A auth per DEC-0005 |

**This is the single most important schema element to inspect when Repo B becomes available.**

---

## 4. Duplicate/Overlap Analysis

### 4.1 Cross-Repository Table Overlap Matrix

Since Repo A has no tables, the overlap matrix is trivially empty:

```
                    Repo A Tables
                    (none)
Repo B Tables   ┌──────────┐
  (unknown)     │  0 / 0   │  ← Zero overlaps
                └──────────┘
```

### 4.2 Intra-DOMAIN_MODEL.md Overlap Check

Within the DOMAIN_MODEL.md specification itself, there are no duplicate or overlapping table definitions. Each entity has a unique name and clear purpose:

| Entity Pair | Overlap Risk | Analysis |
|---|---|---|
| `dictionary_entries` ↔ `kanji` | NONE | Different entities (words vs. characters) |
| `dictionary_senses` ↔ `dictionary_readings` | NONE | Different aspects of same parent |
| `courses` ↔ `decks` | NONE | Learning vs. SRS domains |
| `questions` ↔ `cards` | LOW | Both test knowledge, but different lifecycle (quiz vs. SRS) |
| `user_progress` ↔ `reviews` | LOW | Both track user activity, but different domains |
| `user_xp` ↔ `streaks` | NONE | Different gamification aspects |
| `ai_conversations` ↔ `ai_messages` | NONE | Parent-child relationship |

The only entities with potential semantic overlap are:
1. **`questions`** (Learning domain) vs. **`cards`** (SRS domain) — Both present knowledge items to users. Resolution: questions are for structured quizzes within lessons; cards are for freeform spaced repetition.
2. **`user_progress`** (Learning domain) vs. **`reviews`** (SRS domain) — Both track user learning activity. Resolution: progress tracks course/lesson completion; reviews track individual SRS card interactions.

---

## 5. Data Migration Conflicts

### 5.1 Current Data at Risk

**NONE.** The database is empty. There is no data to migrate, no data to preserve, and no data that could conflict with imports.

### 5.2 Future Data Conflict Risks

Once Phase 02 (ETL) imports knowledge data, the following conflicts become possible in subsequent ETL runs:

| Scenario | Risk | Mitigation |
|---|---|---|
| Re-importing same JMdict version | LOW | Idempotent upsert by `source_id` |
| Importing newer JMdict version | MEDIUM | Version comparison; update only newer records |
| Re-importing after manual edits | HIGH | Track `is_manually_edited` flag; skip manual edits during ETL |
| Importing from multiple sources with overlapping entries | MEDIUM | Source-scoped uniqueness constraints |

---

## 6. ORM-Level Conflicts

### 6.1 Drizzle ORM Configuration

Repository A uses Drizzle ORM. Potential ORM-level conflicts:

| Conflict Type | Current Risk | Notes |
|---|---|---|
| Different ORM in Repo B | UNKNOWN | If Repo B uses Prisma, schemas must be translated |
| Drizzle version mismatch | UNKNOWN | Repo A: drizzle-orm 0.45.2, drizzle-kit 0.31.10 |
| Schema file organization | NONE | Repo A uses single `schema.ts`; can be split later |
| Relation definitions | NONE | No relations exist yet |
| Custom type definitions | NONE | No custom types exist yet |

### 6.2 Query Pattern Conflicts

Repository A has no domain queries. No query patterns exist to conflict with.

---

## 7. Recommendations

### 7.1 Pre-Phase-01 Actions (No Blockers)

1. ✅ Proceed with Phase 01 schema creation from DOMAIN_MODEL.md
2. ✅ Use UUID primary keys consistently
3. ✅ Include provenance columns on all knowledge tables
4. ✅ Update `src/db/index.ts` to pass schema to `drizzle()`
5. ✅ Create necessary PostgreSQL extensions (`uuid-ossp` or `pgcrypto`)

### 7.2 When Repo B Becomes Available

1. 🔍 Inspect Repo B schema file(s) — identify ORM, table names, column types
2. 🔍 Compare every Repo B table against DOMAIN_MODEL.md
3. 🔍 Document every naming difference
4. 🔍 Identify any Repo B tables NOT in DOMAIN_MODEL.md (may need additions)
5. 🔍 Inspect Repo B auth tables with highest priority
6. 🔍 Check for `kg_*` prefixed tables specifically
7. 📝 Update this conflicts report with actual findings

### 7.3 Conflict Prevention Rules for Phase 01+

1. **Schema is DOMAIN_MODEL.md** — Do not invent new table names
2. **UUIDs everywhere** — All primary keys are UUID
3. **Provenance always** — All knowledge tables carry source metadata
4. **No Repo B table names** — Map during ETL, don't adopt foreign naming
5. **Auth is Repo A's** — Build auth in Repo A; do not import Repo B auth schema

---

## 8. Conclusion

**There are zero database conflicts today.** This is the ideal starting state.

The primary risk is not *current* conflicts but *future* conflicts when:
- Repository B schema is inspected (may reveal unexpected patterns)
- ETL imports data (must be idempotent and versioned)
- Auth is implemented (must be chosen carefully)

All of these risks are mitigated by:
1. Following DOMAIN_MODEL.md as the canonical schema source
2. Using ETL with column mapping (not direct table copying)
3. Making auth decision (DEC-0005) before implementing
4. Conducting Repo B schema comparison when access is available
