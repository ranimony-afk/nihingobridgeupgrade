# Phase 03.1 — Canonical Knowledge Schema

**Date:** 2026-03-25
**Gate status:** PASS

---

## Deployment gate: migration + rollback strategy verified

```
npm run db:test-migrations
→ Migration gate passed: clean apply, verified schema, rollback proven, re-apply identical.
```

The gate runs against two databases built from nothing. For each it:

1. applies the full chain to an empty database
2. verifies 18 tables, 9 check constraints, enums, indexes, and `pg_trgm`
3. exercises the constraints with real inserts
4. takes a **schema fingerprint** — every column, constraint, index and enum
   label, canonically ordered and SHA-256 hashed
5. rolls the chain back and asserts nothing is left behind
6. re-applies and asserts the fingerprint is **byte-identical**

```
fingerprint d113dd870bfd3e17… (199 columns, 60 constraints, 80 indexes, 57 enum labels)
  ok  rollback of an irreversible migration is refused
  ok  rollback without --yes is refused
  ok  knowledge tables removed by rollback
  ok  identity tables untouched by rollback
  ok  knowledge enums removed by rollback
  ok  schema after rollback + re-apply is identical
```

Step 6 is the real test. An orphaned enum, index, or constraint left behind by
a rollback changes the hash and fails the gate. Both databases produced the
same fingerprint, which also proves the forward chain is deterministic across
machines.

---

## Rollback strategy

drizzle-kit generates forward SQL only — verified, not assumed:

```
$ npx drizzle-kit generate --help | grep -i "down|rollback|revert"
NO down/rollback flag
```

So every migration has a hand-written partner in `drizzle/rollback/`, and each
declares its own safety metadata in a header the runner parses:

```sql
-- @reversible: yes
-- @drops-data: knowledge tables (re-importable from source via ETL)
```

The runner refuses to proceed when a down script is missing, when the
migration is declared irreversible, or when `--yes` was not passed. Before
running it prints the plan **and the row count of every table it will drop**,
so the cost is visible rather than discovered afterwards.

`DATABASE_OWNERSHIP` forbids `DROP` without an authorising decision. A
reviewed down script *is* that authorisation — written and read at review
time rather than improvised during an incident.

### One migration is declared irreversible, deliberately

`0002_backfill_profiles_preferences` cannot be rolled back mechanically. It
gave every existing user a profile and preferences row; learners have since
edited them. There is no way to distinguish "row we backfilled and nobody
touched" from "row we backfilled and the learner then configured".

Writing a down script that deletes them would destroy learner data the forward
migration never created. Declaring it irreversible — and having the runner
refuse it with the reason — is the honest answer. The gate asserts that
refusal happens.

---

## The twelve tables

| Table | Purpose |
|---|---|
| `knowledge_sources` | licence registry, one row per dataset |
| `knowledge_provenance` | one row per import run: counts, checksum, outcome |
| `dictionary_entries` | headword, reading, JLPT, frequency |
| `dictionary_readings` | alternative kana and written forms |
| `dictionary_senses` | meaning groups, glosses keyed by language |
| `radicals` | the 214 classical Kangxi radicals |
| `kanji_entries` | character, strokes, grade, meanings |
| `kanji_readings` | on / kun / nanori |
| `kanji_components` | visual decomposition |
| `grammar_patterns` | pattern, formation, register, JLPT |
| `sentences` | Japanese, furigana, translations by language |
| `conjugations` | materialised inflected forms |

### Design decisions worth stating

**Licence verification is a constraint, not a note.** The Phase 00 audit found
the same dataset described as CC BY-SA 3.0 in one repository and 4.0 in the
other, and TTS audio whose redistribution terms were never established. So:

```sql
CHECK (status <> 'active' OR license_verified = true)
```

A source stays unusable until someone records that the licence was actually
checked. The gate proves an unverified source cannot be activated.

**Provenance is enforced by foreign key.** Every imported row requires a valid
`source_id`, and deleting a source that has data is *refused* rather than
cascaded — losing the source row would strand everything citing it.

**Conjugations are materialised, not computed.** A learner searching 食べなかった
must find 食べる. Reverse lookup of an inflected form is an indexing problem,
and an index needs rows. An integration test proves that join works.

**`pg_trgm` is created by the migration.** The audit flagged this as
UNVERIFIED: the dictionary service called `similarity()` while nothing
guaranteed the extension existed. drizzle-kit does not emit `CREATE EXTENSION`,
so it was added to `0003` alongside the six trigram indexes that depend on it.
The gate asserts both the extension and the indexes exist, and that
`similarity()` is callable.

**Glosses and translations are language-keyed objects**, not arrays. Adding
French is data, not a migration — one test inserts `{"en":…,"fr":…}` and reads
both back. A check constraint rejects array-shaped translations, which is the
shape Repository B used.

---

## Scope

Twelve tables were requested and twelve were delivered. Sentence-to-entity
link tables (`sentence ↔ vocabulary`, `sentence ↔ grammar`) were **not** added:
they were not in the list, they have no consumer until the ETL phase populates
them, and speculative tables are the failure mode Repository B's schema
demonstrates. They belong with the pipeline that fills them.

---

## Verification

| Layer | Tests | Result |
|---|---|---|
| Unit | 89 | pass |
| Integration | 35 (+15 knowledge) | pass |
| API + smoke | 60 | pass |
| Migration gate | 39 checks × 2 databases | pass |
| **Total** | **184** | **pass** |

Applied to the dev database with **158 user accounts preserved** and zero
destructive DDL. `npm run verify` passes end to end.

---

## Gate approval

- [x] All twelve canonical tables implemented in Drizzle
- [x] Migration applies cleanly to empty and test databases
- [x] **Rollback scripts written for every migration**
- [x] **Rollback executed and verified** — tables, enums and indexes removed
- [x] **Re-apply produces a byte-identical schema fingerprint**
- [x] Irreversible migration correctly refused with a stated reason
- [x] Rollback requires explicit confirmation and reports rows at risk
- [x] Existing data preserved
- [x] **APPROVED**
