# Phase 14.5A — Next-Session Handoff Brief

**Purpose**: Enable a fresh Arena session to verify a real Tatoeba artifact and promote
Phase 14.5A from BLOCKED to GO, without repeating the audit work already completed.
**Frozen at**: commit `8ab467b49686e505631df94e85920f36568667b6`
**Date**: 2026-09-24

---

## 1. Frozen State (verified)

```text
LATEST_VERIFIABLE_PHASE = 14.4E      (14.4F does not exist)
14.5A                   = BLOCKED
14.5B                   = NOT AUTHORIZED

database writes        = 0
schema migrations      = 0
production access      = 0
canonical mutations    = 0   (no connection opened)
application files      = unchanged  (src/, drizzle/, tests/, scripts/ all clean)
drizzle migrations     = 4   (0000–0003, unchanged)
```

Verified: `git diff --stat HEAD -- src/ drizzle/ tests/ scripts/ package.json` → 0 lines;
`src/db/schema.ts` → 0 diff lines; 4 migrations present and unmodified.

**Protected tables** — none was read or written: `dictionary_entries`, `kanji_entries`,
`kanji_radicals`, `kanji_composition`, `example_sentences`, CMS, learner/SRS/XP.

---

## 2. What to Obtain Outside Arena

### 2.1 Tatoeba artifact — required

Expected official location (Tatoeba's own distribution infrastructure):

```
https://downloads.tatoeba.org/exports/
https://downloads.tatoeba.org/exports/per_language/jpn/
```

**Verify these paths from the actual site — they cannot be confirmed from this sandbox**
(all `tatoeba.org` hosts are blocked; only GitHub and package registries are reachable).

**Strongly prefer the per-language Japanese export over the full corpus.** The full
`sentences` export covers millions of sentences across hundreds of languages and is on the
order of a gigabyte uncompressed; a Japanese-only export is roughly two orders of magnitude
smaller. This matters because of the transfer constraint in §3 below.

Files to aim for:

```
jpn_sentences.tsv      (or jpn_sentences.tsv.bz2)   — Japanese sentence records
jpn_links.tsv          (or jpn_links.tsv.bz2)       — translation relationships
```

Also collect, if offered by the chosen release: any release metadata, README, or licence /
attribution statement published alongside the export. Tatoeba sentence data is
`CC-BY-2.0-FR`. The attribution string already registered in the repository
(`registry.ts:125`) is:

```
Tatoeba Project (tatoeba.org) contributors under Creative Commons BY 2.0 FR
```

Confirm the attribution actually published with the chosen release matches this before
reusing it verbatim.

**Do not** use npm / PyPI / Kaggle / Hugging Face / mirrors / scraped copies as substitutes.
The R3 audit deliberately declined these even though npm and PyPI are reachable from the
sandbox, because using them would circumvent the blocked official source.

### 2.2 ETL source corpora — also required, for a different reason

Phase 14.5B is **canonical linkage** — it links sentences to `dictionary_entries` and
`kanji_entries`. Those tables hold 206,747 dictionary rows and 13,108 kanji rows, and they
are populated by ingesting source corpora that are **absent from this workspace**:

```
data/JMdict.xml        ABSENT   →  upstream:jmdict:2023-08      (206,717 entries)
data/kanjidic2.xml     ABSENT   →  upstream:kanjidic2:2023-08   (13,108 entries)
data/kanjivg/          ABSENT   →  upstream:kanjivg:2024-04
```

Consequences if these remain absent:

1. **14.5B stays blocked** even after 14.5A reaches GO — no canonical corpus to link against.
2. **The regression suite stays red.** 62 of 715 tests currently fail for exactly this
   reason (plus a missing `DATABASE_URL`). No future phase can pass a "full regression
   green" gate until this is resolved.

Their expected SHA-256 values are recorded in the repository at
`reports/gates/PHASE-14.4B-KANJIDIC2-ACQUISITION-MANIFEST.json` and
`PHASE-14.4D-KANJIVG-ACQUISITION-MANIFEST.json`, so retrieved files can be checked against
known-good hashes. Similar volumes to the Tatoeba artifact: JMdict is the largest.

If fetching these is out of scope for the same trip, record that decision explicitly — it
determines whether 14.5B is reachable.

---

## 3. CRITICAL — Artifact Transfer Constraint

**A fresh Arena session clones the repository from Git. Gitignored files are not in Git.**

`data/` is gitignored (`.gitignore:36` → `/data/`), which is correct policy for large
corpora — but it means an artifact placed at `data/tatoeba/` **will not appear** in a new
session that starts from a clean clone.

Choose one deliberately:

| Option | How | Trade-off |
| :--- | :--- | :--- |
| **A. Same persisted workspace** | Continue in this workspace / a session that keeps this sandbox | Simplest; no repo change. Confirm the next session actually inherits `data/`. |
| **B. Commit the artifact** | `git add -f data/tatoeba/...` | Guarantees availability; adds large binaries to Git history. Acceptable only for a **per-language JP export**, not for a full-corpus export. |
| **C. External storage + re-fetch** | Host the artifact, fetch in the next session | Adds a network dependency; the fetch must go to an approved location. |

Do **not** assume option A without confirming it. If the artifact is absent when the next
session starts, that session can only repeat the R3 BLOCKED verdict — which is exactly the
loop the last four sessions have been stuck in.

---

## 4. Pending Decisions Before the Next Session

### 4.1 Source identity must change — the 2024-07 label will be wrong

The registry entry asserts `version: "2024-07"` and `releaseDate: "2024-07-01"`. Tatoeba
exports are published as **rolling snapshots**, not as versioned dataset releases like
JMdict's `2023-08`. An artifact obtained today (2026-09-24) will be a **current** snapshot,
**not** the 2024-07 release.

Therefore:

- The existing `upstream:tatoeba:2024-07` identity will **not** correctly describe the new
  artifact.
- A new identity reflecting the actual snapshot date will be required, e.g.
  `upstream:tatoeba:2026-09-24` (exact format to be decided from the artifact's own
  evidence).
- Updating the registry with a **new** identity is not "silently substituting another
  release" — it is the explicit authorization the prior prompts required, and it should be
  recorded as such.
- The existing `2024-07` entry should be **retained**, not deleted, and marked superseded.

**Do not invent a version.** Derive it from the artifact's filename, any accompanying
release metadata, or the retrieval date — and state the basis.

### 4.2 Schema authorization — still open

`PHASE-14.5A-SCHEMA-NECESSITY.md` establishes that `example_sentences` **cannot** store
Tatoeba records: `reading`, `english`, and `jlpt_level` are all `NOT NULL`, and there is no
upstream-ID column, no relationship model, no raw-text field, and no artifact binding.

Two options remain open, and neither is authorized:

1. **Additive `tatoeba_sentences` + `tatoeba_sentence_links` tables** (proposed in that
   report, with alternatives considered, migration implications, and rollback strategy).
2. **File-backed acquisition only**, deferring persistence further.

14.5A verification (§5 below) needs **neither** — it is read-only. But 14.5B cannot persist
linkage results without a decision.

### 4.3 Canonical database — still absent

No `DATABASE_URL`, port 5432 closed, `psql` unavailable. Canonical invariant checks report
`BLOCKED — DATABASE UNAVAILABLE`, not verified. `scripts/run-disposable-pg.ts` (PGlite) can
stand one up on `127.0.0.1:5432` — but only *after* §2.2's source corpora exist, otherwise
it yields an empty schema that verifies nothing.

---

## 5. Ready-to-Use 14.5A Verification Prompt (skeleton)

For the next session. It verifies only — no normalization, no persistence, no downloads.

```text
PHASE 14.5A-V — TATOEBA ARTIFACT VERIFICATION (VERIFY ONLY)

The approved Tatoeba artifact has been supplied at data/tatoeba/.
Do NOT download, substitute, normalize, transform, persist, or modify it.
Verify exactly what was supplied. Read-only throughout.

Required:
1.  Enumerate every file supplied under data/tatoeba/ with byte size and mtime.
2.  Compute SHA-256 of each file TWICE, independently. PASS1 == PASS2 must hold,
    or report BLOCKED — ARTIFACT INTEGRITY FAILURE.
3.  Detect encoding, delimiter, BOM, newline convention, column count.
4.  Count: total records; per-language distribution; Japanese records.
5.  Extract and validate Tatoeba sentence IDs; report duplicate and missing IDs.
6.  Report malformed rows, empty fields, control characters, invalid UTF-8.
7.  Parse link/relationship records: counts by relationship type,
    one-to-many, many-to-one, untranslated Japanese sentences.
8.  Verify each referenced sentence ID in the links file resolves to a record.
9.  Derive the source identity (version / snapshot date) FROM THE ARTIFACT.
    State the basis. Do not assume 2024-07.
10. Confirm licence + attribution from supplied release metadata.
11. Compute the deterministic raw-record digest twice. PASS1 == PASS2 required.
12. Emit reports/gates/PHASE-14.5A-TATOEBA-ACQUISITION-MANIFEST.json using ONLY
    measured values. No TBD, no UNKNOWN, no placeholders, no assumed counts.
13. Reconcile against the historical claims in
    reports/gates/PHASE-14.5A-HISTORICAL-RECONCILIATION.md and report
    match / mismatch per row. Never adjust a measurement to resemble a claim.

Prohibited: any database write; any migration; any production contact;
any canonical-table access; any normalization; any sentence persistence;
creating src/etl/tatoeba/** before the artifact is verified.

Report:
  ARTIFACT / SHA / RAW RECORDS / JAPANESE RECORDS / LINKS / DUPLICATE IDS /
  MALFORMED ROWS / DIGEST PASS1 / DIGEST PASS2 / DATABASE WRITES / SCHEMA
  MIGRATIONS / PRODUCTION ACCESS / FOCUSED TESTS / REGRESSION / TYPECHECK /
  LINT / BUILD / DRIZZLE / VERDICT
```

### Note on measurement semantics

If a **per-language** Japanese export is supplied, two of the §8 characterization metrics
degenerate: the "language distribution" is Japanese-only by construction, and "raw records"
equals "Japanese records". That is not a defect in the data — it is a property of the export
chosen. The verification prompt should be read accordingly, and the manifest should say
which export form was supplied so no future reader misreads a whole-corpus metric from a
single-language file.

---

## 6. 14.5B Design Notes (informational — do NOT implement)

### 6.1 Lossless normalization, replacing the Phase 4 transformer

The existing transformer is unusable for Tatoeba. It fabricates readings
(`reading = cleanText(raw.reading) || japanese`, `transformer.ts:52`), auto-assigns JLPT
levels (`:54, :71-72`), and **rejects** any sentence lacking English (`:48-50`).

Required treatment:

| Tatoeba datum | Treatment |
| :--- | :--- |
| Sentence ID | Preserve permanently; never replaced by a local ID |
| Japanese text | Preserve **exactly**, plus a separate normalized form |
| Translations | Preserve separately; no arbitrary "canonical" selection |
| Missing translation | Preserve — do **not** reject |
| Missing reading | `NULL` — never fabricate |
| JLPT level | `NULL` unless independently evidenced |
| Links | Preserve many-to-many |
| Source / licence | Preserve provenance chain |
| Duplicate sentences | Detect deterministically; never collapse upstream identities |

```
original_text → normalized_text → validated canonical representation
```

Never `original_text → overwrite original`.

### 6.2 Matching architecture

The current matcher is not acceptable:

```ts
for each sentence
  for each dictionary entry          // ~206,747
    japanese.includes(headword)      // and it swallows DB errors
```

That is O(sentences × dictionary_entries), with no positions and no longest-match.

**Recommended deterministic replacement — dictionary-driven longest-match.** Build a trie
(or Aho–Corasick automaton) over canonical headwords and readings, then scan each sentence
once, emitting matches with character positions and taking longest-match at each offset.

Two design notes worth capturing before implementation:

- **Segmentation need not precede matching.** Japanese has no spaces, so a tokenizer is the
  usual instinct — but dictionary-driven matching *is* the segmentation strategy here, and it
  avoids pulling in a morphological analyzer (MeCab/IPADIC) plus its dictionary licence and
  runtime cost. Position-aware longest-match over the raw string yields exact dictionary
  identity, kana/kanji boundaries, and overlapping matches, which is what §13 requires.
- **Decide the offset unit first.** Whether positions are Unicode code points or UTF-16 code
  units must be fixed and documented before any position is exposed externally. For BMP
  Japanese text (kanji, kana, full-width punctuation) the two coincide, but the rule must be
  stated so it cannot silently break on supplementary-plane characters.

Existing helpers to reuse rather than duplicate: `KANJI_REGEX`, `extractKanjiCharacters`,
`katakanaToHiragana` (`src/services/knowledge/kanjiLexicalGraphService.ts:37,64,113`).

### 6.3 Unresolved

- Whether `jpn_links.tsv` alone is sufficient for **many-to-one** relationships (Japanese
  sentence as translation *target*), or whether the full/reverse links file is needed. This
  must be determined from the supplied artifact, not assumed.
- Whether canonical sentence persistence should ever merge into `example_sentences`, or
  remain in dedicated tables. Not decided; not proposed here.

---

## 7. Expected Outcome

Once a real artifact is supplied and §5 executes cleanly:

```text
PHASE 14.5A STATUS: GO
ARTIFACT:          VERIFIED
SHA:               VERIFIED (measured, not assumed)
RAW RECORDS:       MEASURED
JAPANESE RECORDS:  MEASURED
LINKS:             MEASURED
DIGEST:            VERIFIED (PASS1 == PASS2)
DATABASE WRITES:   0
SCHEMA MIGRATIONS: 0
PRODUCTION ACCESS: 0
14.5B:             AUTHORIZED BY GATE
```

All numbers must come from the artifact — never from a prior report.
