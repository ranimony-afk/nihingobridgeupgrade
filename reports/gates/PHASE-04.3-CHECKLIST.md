# PHASE 04.3 — KANJIDIC2 Ingestion — GATE CHECKLIST

**Prompt:** 04.3 — KANJIDIC2, same methodology
**Gate:** Kanji fixture import succeeds
**Status:** ✅ **GATE PASSED** — caveats carried forward (§ 7)

---

## 1. Gate result

```
$ npx tsx scripts/etl-kanjidic.ts --limit 300

[etl] source: fixture etl/fixtures/kanjidic2-sample.xml (144292 bytes)
      sha256=d13471e5e4443f7e… verified=false
[etl] provenance: import run #5 opened
[etl] progress: parsed=200 valid=200 written=200

parsed : 300   valid : 300   invalid : 0   duplicates : 0
inserted : 300 updated : 0   unchanged : 0   duration : 318 ms
```

**300 kanji imported. ✅**

| kanji_characters | kanji_readings | kanji_meanings |
|---|---|---|
| 300 | 666 | 355 |

---

## 2. "Same methodology" — one framework, not two

Rather than clone the 04.2 pipeline, the XML streaming core was **extracted and shared**:

- **New:** `etl/parsers/xml-stream.ts` — `streamBlocksFrom`, `tagNodes` (attribute-aware), `tagValues`, `tagBlocks`, `hasTag`, `decodeXmlEntities`.
- **Refactored:** `etl/parsers/jmdict-parser.ts` now builds on it; public API unchanged.
- **Reused as-is:** `resolveSource` (download+checksum), `Deduplicator`, `ValidationIssue`, `etl_import_runs` provenance, `LoadResult`.

JMdict tests were re-run **immediately after the refactor** — 15/15 still passing — before any new code was added.

| Stage | KANJIDIC2 module |
|---|---|
| download | `etl/sources/jmdict-source.ts` (shared) |
| checksum | same — streaming SHA-256 |
| parse | `etl/parsers/kanjidic-parser.ts` |
| normalize | `etl/transforms/kanjidic-transform.ts` |
| validate | `etl/validators/kanjidic-validator.ts` |
| deduplicate | shared `Deduplicator`, keyed on `literal` |
| provenance | `etl/provenance/import-run.ts` (shared table) |
| upsert | `etl/loaders/kanjidic-loader.ts` — `(source, literal)` |

Orchestrator: `etl/pipelines/kanjidic-pipeline.ts`; CLI: `scripts/etl-kanjidic.ts`.

---

## 3. KANJIDIC2-specific handling

KANJIDIC2 differs structurally from JMdict — its meaning lives in **attributes**, which required real parser work rather than a copy-paste:

| Concern | Handling |
|---|---|
| `r_type` on `<reading>` | Typed readings: `ja_on`, `ja_kun`, `pinyin`, `korean_r/h`, `vietnam`; unknown types dropped |
| `m_lang` on `<meaning>` | Multilingual; **absent attribute ⇒ English** (verified: 335 `en`, 20 `fr`) |
| `rad_type` | `classical` and `nelson_c` stored separately |
| Multiple `<stroke_count>` | First is canonical; remainder kept as `stroke_miscounts` (verified `日` → `4`, miscounts `[5]`) |
| `<nanori>` | Sits **outside** `<rmgroup>` — read from `reading_meaning` scope (verified `["あ","あき"]`) |
| `cp_type`, `dr_type`, `qc_type` | Codepoints, dictionary refs, query codes (SKIP) captured |
| Missing `<cp_value ucs>` | Codepoint derived from the literal |

**Legacy JLPT trap, handled explicitly:** KANJIDIC2 ships the *old 4-level* JLPT scale, **not** modern N5–N1. Stored as `jlpt_old` (validated 1–4) with a separate, deliberately empty `jlpt_level` column for modern levels. Conflating these would have silently corrupted every JLPT feature downstream.

---

## 4. Safety properties — each proven

### 4.1 Idempotency
```
re-run → parsed: 300  inserted: 0  updated: 0  unchanged: 300
```

### 4.2 Validation + dedup (full fixture, 306)
```
parsed: 306  valid: 300  invalid: 4  duplicates: 2  inserted: 0  unchanged: 300
rejected:
  - 鬱: character has no stroke_count
  - あ: literal is not a single CJK ideograph
  - 森: implausible stroke_count: 99
  - 丼: character has neither readings nor meanings
```
All four deliberately-malformed shapes rejected with precise reasons; both duplicate literals caught.

### 4.3 Checksum enforcement
| Case | Result |
|---|---|
| Wrong digest | `Checksum mismatch` → aborted; table still 300 rows |
| Correct digest | `verified: true` |

### 4.4 Rule 3 — no destructive DDL
`drizzle-kit push --verbose` grep for `drop table|drop column|truncate` → **0 matches**. Only `CREATE TABLE` / `CREATE INDEX` / `ADD CONSTRAINT`.

### 4.5 Rule 9 — licensing
KANJIDIC2 = EDRDG, **CC BY-SA 4.0**, recorded per run in `etl_import_runs`. Fixture is **synthetic**, not redistributed upstream data.

---

## 5. Tests

```
$ npx tsx --test etl/tests/*.test.ts
# tests 30   # pass 30   # fail 0
```
(15 JMdict + 15 KANJIDIC2.) Kanji tests cover attribute extraction, prefix-collision (`<characterset>` vs `<character>`), chunk-boundary streaming, limits, reading/meaning normalization, codepoint derivation, content hashing, all six validator branches, and a 306-record end-to-end pass.

---

## 6. Validation & regression (Rule 11 / 13)

| # | Check | Command | Result |
|---|---|---|---|
| 1 | Typegen | `npx next typegen` | ✅ |
| 2 | Types | `tsc --noEmit` | ✅ |
| 3 | Build | `npm run build` | ✅ 9 routes |
| 4 | All ETL tests | `npx tsx --test etl/tests/*.test.ts` | ✅ 30/30 |
| 5 | Health + DB | `build_and_start` → `/api/health` | ✅ |
| **Regression** | | | |
| 6 | JMdict tests after shared-core refactor | `--test etl/tests/jmdict.test.ts` | ✅ 15/15 |
| 7 | Phase 04.2 data intact | `psql` | ✅ 501 entries / 501 senses |
| 8 | Phase 04.2 pipeline still runs | `scripts/etl-jmdict.ts --limit 500` | ✅ 500 unchanged (idempotent) |
| 9 | App tables untouched | `psql` | ✅ 5 decks / 128 cards |

---

## 7. Carried-forward caveats

- **Repo A still inaccessible** (`Arena-test` → 404). The 04.1 framework decision remains open; this work lives in the only executable workspace.
- **Fixture only.** Real KANJIDIC2 (~13k characters) not ingested; network off by default.
- **`jlpt_level` (modern N5–N1) intentionally empty** — requires a separate mapping source, not derivable from `jlpt_old`.
- **Radical/component *relationships* not modelled yet** — only `radical_classical` / `radical_nelson` numbers. Full component decomposition (KRADFILE) is a later phase.
- **Not deployed** — no deployment performed, so none claimed (Rule 15).

---

## 8. Commands

```bash
npx tsx etl/fixtures/generate-kanji-fixture.ts 300   # regenerate fixture
npx tsx --test etl/tests/*.test.ts                   # all ETL tests
npx drizzle-kit push --config=drizzle.config.json
npx tsx scripts/etl-kanjidic.ts --limit 300          # gate import
npx tsx scripts/etl-kanjidic.ts --dry-run --limit 100
```

Full production load (out-of-band worker, never serverless):
```bash
ETL_ALLOW_NETWORK=true KANJIDIC2_SHA256=<trusted> ETL_MAX_ENTRIES=15000 \
  npx tsx scripts/etl-kanjidic.ts
```
