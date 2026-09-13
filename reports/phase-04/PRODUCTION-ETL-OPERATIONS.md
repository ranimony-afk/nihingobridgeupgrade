# Phase 04.6 — Production ETL Operations

**Prompt:** Add resumability, batching, checksums, retry, dead-letter/error records, import reports, and validation reports.

**Status:** ✅ Deployment gate passed — interrupted JMdict fixture import resumed safely.

---

## 1. Operational architecture

All source pipelines now share the Phase 04.6 production runtime:

| Capability | Canonical implementation | Used by |
|---|---|---|
| Bounded retry | `etl/runtime/retry.ts::withRetry` | Shared source downloader |
| Checksums | `etl/sources/jmdict-source.ts::hashFile/resolveSource` | JMdict, KANJIDIC2, Tatoeba, KRADFILE fixture |
| Resumability | `etl/runtime/operations.ts::beginResumableRun/advanceCheckpoint` | JMdict, KANJIDIC2, Tatoeba, KRADFILE |
| Batch commit | Each pipeline `flush()` + domain loader | Same four pipelines |
| Dead letters | `operations.ts::writeDeadLetters` → `etl_dead_letters` | Same four pipelines |
| Import reports | `operations.ts::completeResumableRun/failResumableRun` → `etl_import_reports` | Same four pipelines |
| Validation reports | same → `etl_validation_reports` | Same four pipelines |

There is **one** operational framework, not per-source frameworks.

### 1.1 Safe-resume invariant

A checkpoint stores the **last committed source cursor**, not an optimistic parse cursor.

For each batch the ordering is:

1. domain upsert completes transactionally;
2. validation dead letters are durable;
3. checkpoint cursor advances.

If a process dies at any point before (3), it replays the batch. Domain loaders use natural-key upserts and dead letters use a unique `(run, pipeline, stage, sourceRecordKey, errorCode)` key, so replay is safe. It may perform a harmless no-op upsert, but cannot silently skip source work.

A resume is accepted only for the same `(pipeline, source, SHA-256)` identity. Changed source content always starts a fresh logical run.

### 1.2 Retry policy

Source downloads are atomic (`.part` then rename) and retry with bounded exponential backoff:

- defaults: **3 attempts**, **500 ms** initial delay, **30 s** max delay;
- retries: transport errors plus HTTP `408`, `429`, and `5xx`;
- does **not** retry HTTP `401`, `403`, `404`, or other permanent `4xx` failures;
- cleans `.part` before every attempt and on final failure.

### 1.3 Provenance and test safety

`etl_import_runs.is_fixture` distinguishes generated/local fixtures from source material. Fixture provenance is denied in normal production enrichment paths; it can only be used when a command/test explicitly opts in. This prevents synthetic fixtures from being presented as a production-approved source.

---

## 2. Additive schema

| Table | Purpose |
|---|---|
| `etl_checkpoints` | durable source identity, cursor, batch count, resume count, state, cumulative counters |
| `etl_dead_letters` | durable rejected source records and pipeline failures; bounded payload; replay-safe unique key |
| `etl_import_reports` | one final operational report per logical import run |
| `etl_validation_reports` | stage acceptance/invalid/duplicate totals plus sampled errors |

Added `etl_import_runs.is_fixture` to the existing provenance ledger. All DDL was additive: `CREATE`, `ADD`, indexes, and constraints only. No `DROP TABLE`, `DROP COLUMN`, or `TRUNCATE`.

---

## 3. Deployment gate evidence

Command:

```bash
npx tsx --test etl/tests/jmdict-resume.integration.test.ts
```

Result:

```text
# tests 1
# pass 1
# fail 0
```

Test: `etl/tests/jmdict-resume.integration.test.ts`

| Step | Assertion |
|---|---|
| 1 | Run 500-record JMdict fixture, batch size 100, force an interruption after 2 committed batches. |
| 2 | Durable failed checkpoint exists at **cursor 200**, **2 batches**. |
| 3 | Pipeline failure dead letter and failed validation report exist. |
| 4 | Rerun with resume enabled. It reopens the **same import run ID**, starts at cursor 200, and finishes at **cursor 500**. |
| 5 | Complete report marks `resumed=true`, `resume_count=1`; success validation report exists. |
| 6 | `inserted=0`, `updated=0`, `unchanged=500`; JMdict record count is unchanged before/after. |

This is a database-backed test, not a mocked checkpoint assertion.

---

## 4. Observed operational evidence

A full 505-record JMdict fixture execution produced:

```text
parsed=505 valid=501 invalid=2 duplicates=2
inserted=0 updated=0 unchanged=501
dead letters=4 checkpoint=505 resumed=false
```

Latest checkpoint persisted:

```json
{
  "valid": 501,
  "parsed": 505,
  "invalid": 2,
  "updated": 0,
  "inserted": 0,
  "unchanged": 501,
  "duplicates": 2,
  "deadLetters": 4
}
```

Durable JMdict error records: 2 validation failures + 2 duplicate-source-ID records. Pipeline failures are independently recorded as `PIPELINE_FAILURE` dead letters.

Post-runtime fixture executions also succeeded for:

- **KANJIDIC2:** 306 parsed / 300 valid / 4 invalid / 2 duplicates; resumable checkpoint run `#23`.
- **Tatoeba:** 508 parsed / 501 valid / 4 invalid / 2 duplicates; provenance verification passed; 500 translation links replay safely through their unique key.
- **KRADFILE:** 24 parsed / 21 valid / 2 invalid / 1 duplicate / 1 unmatched; malformed and unmatched component records appear as durable dead letters.

A same-content KRADFILE re-import was explicitly proven idempotent after a hash correction:

```text
run #26: updated=20  (one-time migration to semantic hash)
run #27: inserted=0 updated=0 unchanged=20
```

---

## 5. Configuration and production operation

`.env.example` documents:

```dotenv
ETL_RESUME=true
ETL_DOWNLOAD_RETRIES=3
ETL_DOWNLOAD_BACKOFF_MS=500
BATCH_SIZE=200
ETL_MAX_ENTRIES=1000
VALIDATION_ERROR_SAMPLE_LIMIT=100
```

### Exact commands

```bash
# Required validation
npm run lint
npx tsx --test etl/tests/*.test.ts
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build

# Fixture gate / operational proof
npx tsx --test etl/tests/jmdict-resume.integration.test.ts
npx tsx scripts/etl-jmdict.ts --limit 505
npx tsx scripts/etl-kanjidic.ts --limit 306
npx tsx scripts/etl-tatoeba.ts --limit 600
npx tsx scripts/etl-kradfile.ts --allow-fixture-provenance

# Deliberate full JMdict production load — out-of-band worker only
ETL_ALLOW_NETWORK=true REQUIRE_SOURCE_CHECKSUM=true \
JMDICT_SHA256=<trusted-edrdg-sha256> ETL_MAX_ENTRIES=250000 \
npx tsx scripts/etl-jmdict.ts
```

Do **not** run imports inside a Vercel/Next.js request. Run them in a CI job or dedicated worker with PostgreSQL access; the web admin surface should monitor/import-report state, not parse 200k-record source documents.

---

## 6. Bounded scope and follow-ups

1. **Real source loading is not claimed.** The Phase 04 data loads remain synthetic fixtures. Production downloads require a trusted source checksum.
2. **KRADFILE network mode remains deliberately blocked.** EDRDG distributes its source as a ZIP archive; a verified extraction stage has not been implemented, and passing ZIP bytes to a text parser would be unsafe. The fixture path is fully operational.
3. **No external JLPT or pitch source is enabled.** Their supplemental adapter is fail-closed until licence, checksum, attribution, and human approval are recorded (04.5 policy).
4. **Repository A access remains unresolved.** The local workspace remains the executable integration environment, while `Arena-test` was inaccessible at prior audit time. No claim is made that this has been applied to the canonical private repository.
5. **No deployment was performed.** Build/start validation passed locally; production deployment success is not claimed.
