# Phase 14.4C: Pre-Ingestion Audit Report

**Date:** 2026-09-23T10:53:46.588Z  
**Target Host:** `127.0.0.1:5432` (Authorized Local Disposable Loopback)  
**Database Name:** `app_db`  
**Verdict:** `PASS — PRE-INGESTION AUDIT AUTHORIZED`

---

## 1. Safety & Host Verification
- **Host:** `127.0.0.1`
- **Port:** `5432`
- **Is Loopback:** `true`
- **Forbidden Host Check:** `CLEAN` (Supabase, Neon, Vercel, Remote AWS completely excluded)
- **Target Classification:** `disposable-local-loopback`

---

## 2. Current Row Counts & Baseline State
- **`kanji_entries` count:** 45
- **`kanji_radicals` count:** 63
- **`dictionary_entries` count:** 206747 (JMdict canonical 206,717 + 30 pilot)
- **First-party records count:** 45
- **First-party source distribution:**
  - `first-party:kanji-mindtree:v1`: 33 records
  - `first-party:kanji-corpus:v1`: 12 records

---

## 3. Schema & Constraint Inspection
### Primary & Unique Constraints:
- `kanji_entries_pkey: PRIMARY KEY (id)`
- `kanji_entries_character_unique: UNIQUE ("character")`

### Foreign Keys:
- Count: 0 (none on `kanji_entries`)

### Collision Risk Assessment:
- Primary key `id` is text, unique.
- `character` column has a strict UNIQUE constraint (`kanji_entries_character_unique`).
- Baseline records have IDs like `kj-mei`, `kanji-road`.
- New candidate records will receive deterministic IDs: `kanji-${character}`.
- Because `character` is unique, new records are filtered so that existing characters are never re-inserted.
- Collision probability: **0.00%**.

---

## 4. Provenance Verification
- **Registered Source:** `upstream:kanjidic2:2023-08`
- **Registry Entry:** Verified (`KANJIDIC2 Kanji Dictionary`, version `2023-08`, license `CC-BY-SA-3.0`).
- **Policy:** Ingested candidate records receive `source_ref = "upstream:kanjidic2:2023-08"`. Baseline records retain their first-party source references.

---

## 5. Candidate Corpus & Reconciliation Classification
- **Total KANJIDIC2 Candidates:** 13108
- **`INSERT` Candidates (New):** 13063
- **`KEEP_EXISTING` Matched Baseline:** 44
- **`CONFLICT` Records:** 1
- **`SKIP` (Malformed):** 0

### Conflict Specification:

- **Character:** `箸` (`kj-hashi`)
  - **Field:** `stroke_count`
  - **Baseline Value:** `14 strokes` (source: `first-party:kanji-mindtree:v1`)
  - **KANJIDIC2 Value:** `15 strokes` (source: `upstream:kanjidic2:2023-08`)
  - **Reason:** Baseline stroke convention vs classical Kangxi radical decomposition
  - **Decision:** `KEEP_EXISTING (Preserve canonical baseline record without mutation)`


---

## 6. Pre-Ingestion Verdict
**Status:** `PASS` — All invariants, safety rules, and reconciliation boundaries are strictly satisfied. Ingestion is authorized to proceed.
