# PHASE 04.6 — Production ETL — GATE CHECKLIST

**Prompt:** Add resumability, batching, checksums, retry, dead-letter/error records, import reports, validation reports.
**Deployment gate:** Interrupted ETL can resume safely.
**Status:** ✅ **GATE PASSED**

---

## Gate proof

| Requirement | File / symbol | Evidence | Result |
|---|---|---|---|
| Interrupted ETL resumes safely | `etl/tests/jmdict-resume.integration.test.ts` | 500-record source, forced failure after two committed 100-row batches; checkpoint cursor 200; resumed same run to cursor 500 | ✅ |
| No duplicate knowledge writes on replay | `etl/loaders/jmdict-loader.ts::upsertBatch` | resumed run: `inserted=0`, `updated=0`, `unchanged=500`; source count before/after equal | ✅ |
| Checkpoint durable | `etl/runtime/operations.ts::advanceCheckpoint` | test asserted persisted `failed` → `complete`, cursor `200` → `500`, batches `2`, resume count `1` | ✅ |

Command:

```bash
npx tsx --test etl/tests/jmdict-resume.integration.test.ts
# tests 1 / pass 1 / fail 0
```

---

## Implementation evidence

| Feature | File / symbol | Short evidence |
|---|---|---|
| Resumability | `etl/runtime/operations.ts::beginResumableRun` | resumes only matching `(pipeline, source, checksum)` incomplete run |
| Checkpoint safety | `operations.ts::advanceCheckpoint` | writes after upsert + dead letters; cursor is committed-work cursor |
| Batching | `jmdict/kanjidic/tatoeba/kradfile-pipeline.ts::flush` | each source runs bounded batch writes and then checkpoint advance |
| Checksums | `etl/sources/jmdict-source.ts::hashFile/resolveSource` | streaming SHA-256, mismatch aborts before pipeline run |
| Retry | `etl/runtime/retry.ts::withRetry` | bounded exponential backoff; only transient HTTP statuses retry |
| Atomic download | `jmdict-source.ts::download` | `.part` file then rename; cleanup each failed attempt |
| Dead letters | `operations.ts::writeDeadLetters` → `etl_dead_letters` | durable, bounded payload; unique key makes replay idempotent |
| Pipeline errors | `operations.ts::failResumableRun` | stores `PIPELINE_FAILURE`, checkpoint failure, import/validation report |
| Import reports | `operations.ts::upsertImportReport` → `etl_import_reports` | one final report per logical run including resume metadata |
| Validation reports | `operations.ts::completeResumableRun/failResumableRun` | parsed/valid/invalid/duplicate totals plus sampled errors |
| Fixture provenance | `etl_import_runs.is_fixture`; `reliability.ts` | fixtures cannot be silently trusted as production sources |

### New additive schema

- `etl_checkpoints`
- `etl_dead_letters`
- `etl_import_reports`
- `etl_validation_reports`
- `etl_import_runs.is_fixture` (additive column)

`drizzle-kit push --verbose` destructive DDL scan (`drop table|drop column|truncate`) → **0 matches**.

---

## Test evidence

| Command | Result |
|---|---|
| `npx tsx --test etl/tests/*.test.ts` | ✅ **69/69** pass (including DB resume integration) |
| `npm run lint` | ✅ clean (0 errors, 0 warnings) |
| `npx next typegen` | ✅ types generated successfully |
| `npm exec tsc -- --noEmit --pretty false` | ✅ 0 errors |
| `npm run build` | ✅ production build passed (9 routes) |
| `build_and_start` healthcheck | ✅ passed |

---

## Regression check (Rule 13)

Validated before final documentation / validation pass:

1. **JMdict:** full fixture checkpoint/report/dead-letter run: 505 parsed / 501 valid / 2 invalid / 2 duplicates / 4 dead letters.
2. **KANJIDIC2:** fixture run succeeds under shared runtime: 306 parsed / 300 valid / 4 invalid / 2 duplicates.
3. **Tatoeba:** fixture run succeeds under shared runtime; provenance verification stays green; 500 links resolve/replay safely.
4. **KRADFILE:** shared runtime batches relationships; same-content re-import is now `0 inserted / 0 updated / 20 unchanged`.
5. **Existing app data:** prior baseline remained 5 decks / 128 cards; no existing knowledge table was dropped or truncated.

---

## Deployability and exact commands

This application is buildable and locally health-checked. **No cloud deployment was performed or claimed.**

```bash
# Schema (additive)
npx drizzle-kit push --config=drizzle.config.json

# Validate
npm run lint
npx tsx --test etl/tests/*.test.ts
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build

# Production ETL job (dedicated worker / CI, never Vercel request path)
ETL_ALLOW_NETWORK=true REQUIRE_SOURCE_CHECKSUM=true \
JMDICT_SHA256=<trusted-edrdg-sha256> ETL_MAX_ENTRIES=250000 \
npx tsx scripts/etl-jmdict.ts
```

## Remaining constraints

- Repo A (`Arena-test`) remains inaccessible from this environment; this work cannot be asserted as applied there.
- Production source runs require a trusted SHA-256, and never accept fixture provenance without explicit test-only opt-in.
- KRADFILE network source is intentionally blocked until verified ZIP extraction is implemented.
- JLPT and pitch supplemental source allow-list remains empty (fail-closed) pending licence and source review.
- No cloud deployment performed.
