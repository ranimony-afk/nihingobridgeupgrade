# PHASE 04.4 — Tatoeba Sentence Ingestion — GATE CHECKLIST

**Prompt:** 04.4 — *"Implement sentence ingestion only after verifying licensing and schema compatibility."*
**Gate:** Fixture import + provenance verification
**Status:** ✅ **GATE PASSED**

---

## 1. Precondition satisfied BEFORE implementation

Licensing and schema compatibility were verified against primary sources first:
**`reports/phase-04/TATOEBA-LICENSING-AND-SCHEMA-VERIFICATION.md`**

Sources: `tatoeba.org/en/downloads`, Terms of Use § 6.2–6.5, Tatoeba wiki, FAQ.

### The finding that changed the design

CC BY 2.0 FR requires **citing the author of each sentence**. The commonly-used
`sentences.csv` export carries only `id, lang, text` — **no author** — so
ingesting it would leave us structurally unable to comply with the licence we
rely on.

➡ **We ingest `sentences_detailed` instead** (adds `username`), and attribution
is a **NOT NULL** column computed in the transform, so no code path can produce
an unattributed sentence.

Other binding constraints carried through:

| # | Constraint | Enforcement |
|---|---|---|
| C1 | Per-sentence author attribution | `owner_username` + NOT NULL `attribution`; validator rejects empty |
| C2 | Per-sentence licence stored, not assumed | `sentences.license` column |
| C3 | **No audio** (wider/unclear licences; empty licence ⇒ no off-site reuse) | no audio field, table or download |
| C4 | Quality filtering | length bounds, script check, control-char rejection |

---

## 2. Gate result

```
$ npx tsx scripts/etl-tatoeba.ts --limit 600

parsed: 508  filtered(lang): 6  valid: 501  invalid: 4  duplicates: 2
inserted: 501  attr→contributor: 500  attr→project: 1
links linked: 500  links dangling: 2

=== Provenance verification ===
  PASS  import run exists                      #11
  PASS  run status is success                  success
  PASS  source recorded                        tatoeba
  PASS  license recorded                       CC BY 2.0 FR
  PASS  attribution recorded                   Example sentences from Tatoeba…
  PASS  checksum recorded (64 hex)             ebdcb5ad39ad454d…
  PASS  source url recorded                    file://etl/fixtures/…
  PASS  run finished                           <timestamp>
  PASS  every sentence has attribution         501/501
  PASS  every sentence has a license           501/501
  PASS  every sentence traces to an import run 501/501

provenance: VERIFIED ✅
```

**Both halves of the gate pass: fixture import ✅ + provenance verification ✅**

Independent SQL confirmation — zero compliance gaps:

| no_attribution | no_license | no_import_run | orphans | total |
|---|---|---|---|---|
| 0 | 0 | 0 | 1 | 501 |

---

## 3. Schema compatibility — the XML core does NOT apply

Tatoeba is **TSV**, not XML. `etl/parsers/xml-stream.ts` is unusable here, so a
line-oriented reader was added: **`etl/parsers/tsv-stream.ts`**.

This is not a second framework — the stage contract, `resolveSource`
(download+checksum), `Deduplicator`, `etl_import_runs` and the report/loader
shapes are all reused unchanged.

A CSV parser would have been **wrong**: Tatoeba TSV has no quoting, so a raw
tab is always a delimiter and quote characters are ordinary text.

---

## 4. A real defect found and fixed during the gate

The first gate run passed provenance but reported:

```
links linked: 0   links dangling: 502
```

Filtering to `jpn` only discarded every English row, so **all translation pairs
dangled**. A Japanese sentence with no translation is largely useless for
learning — the gate would have "passed" while shipping a broken corpus.

**Fix:** `TATOEBA_FILTER_LANG` now accepts a language *set*, defaulting to
`jpn,eng`. Re-run:

```
links linked: 500   links dangling: 2   (only the 2 deliberate danglers)
```

Verified end-to-end:

| japanese | english | attribution |
|---|---|---|
| 水を飲みます。 | I drink water. | tanaka — Tatoeba sentence #200000 (CC BY 2.0 FR) |
| りんごを食べる。 | I eat an apple. | ck — Tatoeba sentence #200002 (CC BY 2.0 FR) |

TypeScript caught all 7 call sites of the `requireLang → requireLangs` change.

---

## 5. Safety properties

| Property | Evidence |
|---|---|
| **Idempotent** | Re-run → `inserted: 0, unchanged: 501, linked: 500` |
| **Validation** | 4 malformed rows rejected with reasons: no Japanese script / control characters / length 400 / empty text |
| **Dedup** | 2 duplicate ids caught |
| **Dangling links** | 2 skipped, counted and reported — never a FK failure |
| **Self-links** | dropped at parse |
| **Orphaned owner** | **accepted**, attributed to "Tatoeba", flagged `owner_unknown` — attribution never silently lost |
| **Checksum** | mismatch → `Checksum mismatch`, aborted; table still 501 rows |
| **Rule 3** | `drop table\|drop column\|truncate` grep on push → **0 matches** |

---

## 6. Tests

```
$ npx tsx --test etl/tests/*.test.ts
# tests 51   # pass 51   # fail 0
```
(15 JMdict + 15 KANJIDIC2 + 21 Tatoeba.)

**Note on honesty:** the first end-to-end test run **failed**. Rather than
adjust the expectation to match output, the fixture was instrumented: parsed
was 508 (my arithmetic was wrong) and the `lang=japanese` row is *filtered*,
not *rejected*, because language filtering precedes validation. The test now
asserts the true behaviour with that ordering documented.

---

## 7. Validation & regression (Rule 11 / 13)

| # | Check | Result |
|---|---|---|
| 1 | `npx next typegen` | ✅ |
| 2 | `tsc --noEmit` | ✅ |
| 3 | `npm run build` | ✅ 9 routes |
| 4 | All ETL tests | ✅ 51/51 |
| 5 | `build_and_start` → `/api/health` | ✅ |
| **Regression** | | |
| 6 | JMdict pipeline idempotent | ✅ 0 inserted / 500 unchanged |
| 7 | KANJIDIC2 pipeline idempotent | ✅ 0 inserted / 300 unchanged |
| 8 | Knowledge tables | ✅ dict 501 / kanji 300 / sentences 501 / links 500 |
| 9 | App tables untouched | ✅ 5 decks / 128 cards |
| 10 | Provenance ledger shared | ✅ jmdict, kanjidic2, tatoeba all `success` |

---

## 8. Carried-forward caveats

- **Repo A still inaccessible** (`Arena-test` → 404); 04.1 framework decision remains open.
- **Fixture only** (synthetic, not redistributed Tatoeba data); network off by default.
- **Audio excluded by licence** (C3) — a deliberate scope exclusion, not an omission.
- **Sentence ↔ dictionary/kanji linking deferred** to a knowledge-linking phase.
- **Furigana / JLPT tagging deferred** (needs a morphological analyser + vocab mapping).
- **UI attribution surface still required**: the CC BY notice is stored but is not
  yet rendered anywhere. **It must appear wherever sentences are displayed** before
  any public release.
- **Not deployed** — none claimed (Rule 15).

---

## 9. Commands

```bash
npx tsx etl/fixtures/generate-tatoeba-fixture.ts 250
npx tsx --test etl/tests/*.test.ts
npx drizzle-kit push --config=drizzle.config.json
npx tsx scripts/etl-tatoeba.ts --limit 600      # gate: import + provenance
```

Full production load (out-of-band worker, never serverless):
```bash
ETL_ALLOW_NETWORK=true TATOEBA_SENTENCES_SHA256=<trusted> \
TATOEBA_FILTER_LANG=jpn,eng ETL_MAX_ENTRIES=400000 \
  npx tsx scripts/etl-tatoeba.ts
```
