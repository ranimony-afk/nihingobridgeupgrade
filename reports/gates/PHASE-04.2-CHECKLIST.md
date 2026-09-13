# PHASE 04.2 — JMdict Ingestion — GATE CHECKLIST

**Prompt:** 04.2 — Implement a safe JMdict ingestion pipeline
**Gate:** 100–1000 record test import succeeds
**Status:** ✅ **GATE PASSED** — with one carried-forward caveat (see § 6)

---

## 1. Gate result

```
$ npx tsx scripts/etl-jmdict.ts --limit 500

[etl] source: fixture etl/fixtures/jmdict-sample.xml (182549 bytes)
      sha256=c5ccfb73d9363352… verified=false
[etl] provenance: import run #1 opened
[etl] progress: parsed=200 valid=200 written=200
[etl] progress: parsed=400 valid=400 written=400

parsed : 500   valid : 500   invalid : 0   duplicates : 0
inserted : 500 updated : 0   unchanged : 0   duration : 468 ms
```

**500 records imported — inside the required 100–1000 band. ✅**

DB verification:

| entries | kanji | readings | senses | common |
|---|---|---|---|---|
| 501 | 500 | 501 | 501 | 501 |

(501 = 500 kanji-bearing + 1 kana-only entry, which correctly has no `k_ele` row.)

---

## 2. All eight required stages implemented

| Stage | Module | Evidence |
|---|---|---|
| download | `etl/sources/jmdict-source.ts` → `resolveSource()` | atomic `.part` + rename; fixture-first, network off by default |
| checksum | same → `hashFile()` | streaming SHA-256; mismatch aborts **before** any write |
| parse | `etl/parsers/jmdict-parser.ts` → `streamEntriesFrom()` | memory-bounded `<entry>` streaming, gzip-aware, 8 MB buffer guard |
| normalize | `etl/transforms/jmdict-transform.ts` → `normalizeEntry()` | whitespace collapse, tag/gloss dedupe, `isCommonPriority` |
| validate | `etl/validators/jmdict-validator.ts` → `validateEntry()` | rejects no-reading / no-gloss / no-headword, sampled |
| deduplicate | same → `Deduplicator` | in-run `ent_seq` dedupe + DB unique index |
| provenance | `etl/provenance/import-run.ts` | run opened *before* writes, closed with status + stats |
| upsert | `etl/loaders/jmdict-loader.ts` → `upsertBatch()` | transactional, `onConflictDoUpdate` on `(source, source_id)` |

Orchestrated by `etl/pipelines/jmdict-pipeline.ts`; CLI `scripts/etl-jmdict.ts`.

---

## 3. Safety properties — each independently proven

### 3.1 Idempotency (re-run is a no-op)
```
parsed : 500  inserted : 0  updated : 0  unchanged : 500
```
Content-hash comparison means re-importing rewrites nothing.

### 3.2 Validation + dedup (full fixture, limit 505)
```
parsed : 505  valid : 501  invalid : 2  duplicates : 2  inserted : 1
rejected sample (2):
  - 1000501: entry has no sense with a gloss
  - 1000502: entry has no reading (r_ele)
```
Both malformed entries rejected with reasons; both duplicate `ent_seq` caught; the kana-only entry correctly **accepted** (1 inserted).

### 3.3 Checksum enforcement — all three paths
| Case | Result |
|---|---|
| Wrong digest | `FAILED: Checksum mismatch … expected aaaa… got c5ccfb73…` — aborted, 0 rows |
| Correct digest | `verified=true`, import proceeds |
| `REQUIRE_SOURCE_CHECKSUM=true`, no digest | `FAILED: … no trusted JMDICT_SHA256 digest was provided` |

### 3.4 Rule 3 — no destructive DDL
`drizzle-kit push` emitted **only** `CREATE TABLE` / `CREATE INDEX` / `ADD CONSTRAINT`. No `DROP`/`TRUNCATE` anywhere in the diff or in `etl/`.

### 3.5 Rule 9 — licensing
Source/version/license/attribution/checksum persisted per run in `etl_import_runs`. Fixture is **synthetic**, not redistributed upstream data.

---

## 4. Tests

```
$ npx tsx --test etl/tests/jmdict.test.ts
# tests 15   # pass 15   # fail 0
```
Covers entity decoding (incl. `&adj-na;` and numeric refs), chunk-boundary streaming, limits, normalization, content hashing, all validator branches, dedup, and a 505-entry end-to-end pass.

---

## 5. Validation & regression (Rule 11 / 13)

| Check | Command | Result |
|---|---|---|
| Typegen | `npx next typegen` | ✅ |
| Types | `tsc --noEmit` | ✅ (covers `etl/`, `scripts/`) |
| Build | `npm run build` | ✅ 9 routes |
| ETL tests | `npx tsx --test etl/tests/jmdict.test.ts` | ✅ 15/15 |
| Health + DB | `build_and_start` → `/api/health` | ✅ |
| **Regression:** decks/cards/progress/sessions | `psql` counts | ✅ 5 / 128 / 0 / 0 — unchanged |

Pre-existing tables were neither altered nor read by the ETL.

---

## 6. Carried-forward caveat (honest scope)

- **Repo A still inaccessible** (`Arena-test` → HTTP 404). This pipeline was built in the only executable workspace available. The 04.1 framework decision (Python vs TypeScript) remains **open**; stages here are pure, dependency-free functions specifically so they port cheaply either way.
- **Fixture only.** Real JMdict (~210k entries) has not been ingested. Network is off by default. Expect to tune `BATCH_SIZE` and set a trusted `JMDICT_SHA256` before a full load.
- **Not deployed.** No deployment was performed, so none is claimed (Rule 15).
- Enrichment (JLPT levels, frequency ranks) — columns exist but are unpopulated; that is Phase 04.3+.

---

## 7. Commands

```bash
npx tsx etl/fixtures/generate-fixture.ts 500     # regenerate fixture
npx tsx --test etl/tests/jmdict.test.ts          # unit tests
npx drizzle-kit push --config=drizzle.config.json
npx tsx scripts/etl-jmdict.ts --limit 500        # gate import
npx tsx scripts/etl-jmdict.ts --dry-run --limit 100
```

Full production load (deliberate, out-of-band worker — never serverless):
```bash
ETL_ALLOW_NETWORK=true JMDICT_SHA256=<trusted> ETL_MAX_ENTRIES=250000 \
  npx tsx scripts/etl-jmdict.ts
```
