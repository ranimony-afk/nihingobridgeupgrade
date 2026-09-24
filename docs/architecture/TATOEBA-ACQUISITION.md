# Tatoeba Acquisition Architecture

**Status**: SPECIFICATION ONLY — no artifact acquired
**Phase**: 14.5A-R2 (Real-Artifact Rebase, Provenance & Acquisition Foundation)
**Predecessor**: Phase 14.4F — **not present in this repository** (latest verified: 14.4E)
**Last updated**: 2026-09-24
**Blocking gate**: Artifact availability — see `reports/gates/PHASE-14.5A-R2-ARTIFACT-AUDIT.md`

> This document specifies the Tatoeba acquisition foundation **and records its current
> blocked state**. It is written before implementation so the design is reviewable
> independently of any artifact. Per the phase's §4, **no format assumption may be encoded
> until the real artifact is inspected.**

---

## 1. Purpose and Lifecycle Boundary

Establish an immutable raw/provenance boundary for Tatoeba data. Acquisition and
normalization are **separate lifecycle stages** (accepted finding **E**):

```
Tatoeba raw artifact
        ↓
Acquisition validation          ← THIS PHASE (14.5A-R2)
        ↓
Immutable source representation ← THIS PHASE
        ↓
Provenance manifest             ← THIS PHASE
        ↓
14.5B normalization             ← NOT THIS PHASE
        ↓
14.5B canonical linkage         ← NOT THIS PHASE
```

The raw artifact is **never normalized in place**; raw text is preserved exactly. This
phase does not implement Phase 14.5B functionality.

---

## 2. Source Identity (`upstream:tatoeba:2024-07`)

Already registered in `src/services/knowledge/provenance/registry.ts:125`. **Reused, not
duplicated** (no second source identity was created). Retained unchanged.

| Field | Value | Verification status |
| :--- | :--- | :--- |
| Source ID | `upstream:tatoeba:2024-07` | **REGISTERED** |
| Type / Name | `upstream` / Tatoeba Multilingual Example Sentences | REGISTERED |
| Version | `2024-07` | **ASSERTED — UNVERIFIED** |
| Release date | `2024-07-01` | **ASSERTED — UNVERIFIED** |
| URI | `https://tatoeba.org` | **UNREACHABLE** in this environment |
| License | `CC-BY-2.0-FR` | REGISTERED |
| Attribution | "Tatoeba Project (tatoeba.org) contributors under Creative Commons BY 2.0 FR" | REGISTERED |
| Domain | `sentence` | REGISTERED |
| Target table | `example_sentences` | REGISTERED |
| Alias | `tatoeba:corpus:2024-07` → `upstream:tatoeba:2024-07` | REGISTERED |

### Critical distinction: registration ≠ acquisition

The registry entry provides a **source identity, licence, and attribution obligation**. It
contains **no checksum, byte size, or record count**, and therefore provides **no evidence
that an artifact was ever acquired**. `version` and `releaseDate` are assertions pending
verification against a real artifact. Per the phase's §3, the expected historical SHA-256 is
**not assumed**; the actual identity will be computed from the artifact if one becomes
available.

---

## 3. Acquisition — Current State

| Step | Status |
| :--- | :--- |
| Working-tree artifact (`data/tatoeba/sentences.tsv`) | **ABSENT** — `data/` does not exist; 0 `.tsv` on the filesystem |
| Historical existence (authoritative full-history API) | **ABSENT** — 0 commits ever touched `data/tatoeba` |
| Official endpoint reachable | **NO** — `downloads.tatoeba.org` → HTTP 000 |
| Approved repository-hosted artifact | **DOES NOT EXIST** — Tatoeba's GitHub org hosts software only, 0 release assets |
| Artifact acquired | **NO** |
| SHA-256 / size / record count | **NOT MEASURED** |
| Manifest generated | **NOT GENERATED** — measured fields must not be placeholders |

```
ACQUISITION_STATUS: BLOCKED — OFFICIAL SOURCE UNREACHABLE
```

Permitted channel is the official/approved Tatoeba distribution only. Explicitly
**not** used: GitHub mirrors · Kaggle · Hugging Face · npm · PyPI · third-party datasets ·
scraped copies · community archives · synthetic or fake artifacts. Per the phase's §2D, an
unreachable official source means **STOP**, and no substitution is allowed.

---

## 4. Artifact Integrity Requirements

Once an artifact is available:

1. The acquired file is **immutable** — never overwritten, rewritten, or re-encoded.
2. `sha256sum` is recorded verbatim.
3. If decompression/extraction was required, record original artifact, original SHA-256,
   derived TSV SHA-256, extraction method, tool, and version.
4. File size, record count, header structure, language distribution, and Japanese record
   count are all derived from the artifact — never assumed.

Streaming SHA-256 via `crypto.createHash("sha256")` is the established repository convention
(`scripts/dry-run-kanjidic2.ts:69`, `scripts/dry-run-kanjivg.ts:61`,
`scripts/ingest-full-jmdict.ts:221`, `scripts/build-kanji-lexical-graph.ts:99`).

---

## 5. Format Audit Requirement (Pre-Parser)

Before any parser is written, the actual artifact must be inspected for: delimiter ·
encoding · BOM presence · column count · language-code representation · sentence ID field ·
sentence text field · malformed rows · duplicate IDs · duplicate sentence text · newline
conventions · Unicode normalization · empty fields · control characters · invalid UTF-8 ·
unexpected languages.

**The observed schema must be documented from evidence.** The pre-existing
`TATOEBA_PILOT_FIXTURE` (`src/etl/sentence/pilotData.ts`, 25 hardcoded records with
hand-authored `reading`/`english`/`jlptLevel`) is **not** representative of the real corpus
and must not drive format assumptions.

**Current status: BLOCKED** — nothing to inspect.

---

## 6. Sentence Identity Contract

Every Tatoeba sentence retains its upstream identity:

```
source_id  ·  tatoeba_sentence_id  ·  language  ·  raw_text
```

| Rule | Requirement |
| :--- | :--- |
| Upstream sentence ID replaced by a generated local ID | **PROHIBITED** |
| Local deterministic ID alongside upstream identity | Permitted, but must not replace source identity |
| Identity stability across runs | Required |

---

## 7. Language Policy

Japanese is identified **only** from the source's authoritative language field
(`language = jpn`). It is **never** inferred from Unicode character detection, nor from the
presence of kana, kanji, or the literal string `日本語`. Report
`raw_total` / `japanese_total` / `non_japanese_total` from the actual artifact.

---

## 8. Translation Relationship Policy

Tatoeba relationships must **not** be flattened into `japanese` / `english` columns
(accepted finding **D**). The graph is preserved:

```
sentence ── sentence_translation_relationship
                ├── source_sentence_id
                ├── target_sentence_id
                ├── relationship_type
                ├── source_language
                └── target_language
```

Supported shapes: one-to-one · one-to-many · many-to-one · untranslated · multiple-language.

| Rule | Requirement |
| :--- | :--- |
| Assume English is the only translation language | **PROHIBITED** |
| Discard untranslated Japanese sentences | **PROHIBITED** — retained explicitly as untranslated |
| Fabricate missing translations | **PROHIBITED** |

---

## 9. Reading Policy

```
reading = japanese      ← PROHIBITED, MUST NEVER BE REUSED FOR TATOEBA
```

Kanji-containing Japanese text **is not** its own reading. Tatoeba acquisition does not
provide a complete sentence reading. Where no verified reading exists: `reading = NULL`, or
keep reading outside the sentence record entirely.

The existing Phase 4 behavior — `src/etl/sentence/transformer.ts:52`,
`const reading = cleanText(raw.reading) || japanese;` — is a **known architectural defect**
(accepted finding **B**) and must not be propagated.

---

## 10. JLPT Policy

No JLPT levels are assigned during Tatoeba acquisition. Levels (`N5`–`N1`) must not be
inferred from sentence content, vocabulary frequency, kanji level, sentence length, or
heuristics. Sentence-level JLPT classification belongs to a future controlled enrichment
phase.

---

## 11. Deduplication Policy

Upstream records are **never deleted** to deduplicate. Tatoeba sentence IDs are
authoritative. Two source records with identical text
(`same_text`, `different_source_ids`) **remain separate source records**. A deterministic
content fingerprint may be computed **for grouping only**. Upstream identities are never
collapsed.

---

## 12. Normalization Preparation (Defined, Not Executed)

Deterministic normalization rules for Phase 14.5B are **defined but not executed** in this
phase. Dimensions to be addressed there:

```
Unicode normalization        whitespace normalization
newline normalization        control-character handling
duplicate detection          sentence text canonicalization
language validation          ID validation
relationship validation
```

Every transformation must preserve **both** `raw_text` and `normalized_text`. This phase
establishes the immutable raw boundary only.

---

## 13. Validation and Security

Every record resolves to exactly one deterministic category.

**ACCEPT** — satisfies all structural requirements.

**WARNING** — structurally usable but flagged (unusual Unicode, duplicate text, missing
optional relationship, untranslated sentence, unusual punctuation, relationship ambiguity).

**REJECT / quarantine** — malformed TSV · unexpected column count · invalid UTF-8 · control
characters · oversized fields · malformed IDs · invalid language codes · broken
relationships.

Sentence text is **untrusted data**: never executed, never trusted as HTML, no remote
resource loading, no HTML/script interpretation.

---

## 14. Deterministic Serialization and Digest

Canonical serialization, exactly documented before hashing:

```
<sentenceId> \x1f <language> \x1f <exactText> \x1f <sorted relationshipIds> \x1f <validationStatus>
```

| Property | Policy |
| :--- | :--- |
| Field order | fixed, as above |
| Separator | `\x1f` (unit separator; cannot occur in source text) |
| Record terminator | `\n` |
| Unicode normalization | **NONE** in acquisition — exact source text |
| Sort key | `sentenceId` ascending, stable |
| Hash algorithm | SHA-256 |

Run 1 digest must equal Run 2 digest. Nondeterministic fields — timestamps, machine paths,
random UUIDs, process IDs — are excluded from the digest. Ordering must never depend on
object iteration order, filesystem enumeration order, or database order without `ORDER BY`.

**Current status: NOT MEASURED** — no artifact, therefore no digest.

---

## 15. Performance

The parser must be streaming-capable, without loading the corpus into memory. Track
`records_processed` · `records_accepted` · `records_warned` · `records_rejected` ·
`peak_memory` · `elapsed_time` · `throughput`. Figures must come from execution; performance
targets must not be invented after the fact.

**Current status: NOT MEASURED** — no execution occurred.

---

## 16. Canonical Database Safety

```
database writes        = 0
schema migrations      = 0
canonical mutations    = 0
production access      = FORBIDDEN
```

Prohibited mutations: `dictionary_entries` · `kanji_entries` · `kanji_radicals` ·
`kanji_composition`.

**Canonical mutation verification status:**

```
BLOCKED — DATABASE NOT AVAILABLE

DATABASE WRITES BY PHASE 14.5A-R2:
0
```

No database is reachable (`DATABASE_URL` unset, port 5432 closed, `psql` absent), and the
corpus is unprovisionable (`data/JMdict.xml`, `data/kanjidic2.xml`, `data/kanjivg/` absent).
Immutability was therefore **not** empirically verified and is **not** claimed as verified.

---

## 17. Accepted Architectural Findings

Recorded as binding inputs for later phases:

| # | Finding |
| :--- | :--- |
| **A** | `example_sentences` is insufficient as a raw Tatoeba store — `japanese`, `reading`, `english`, `jlpt_level` are all `NOT NULL`, and there is no column for the Tatoeba source ID or translation relationships. Raw Tatoeba data must not be forced into it without a proper provenance/translation model. |
| **B** | `reading = japanese` is prohibited and must never be reused for Tatoeba. |
| **C** | Existing `SentenceMatcher` is insufficient: `for each sentence { for each dictionary entry { japanese.includes(headword) } }` — O(sentences × dictionary_entries), no positions, no longest-match, and it swallows DB errors into an empty match set. 14.5B must replace it with a deterministic indexed strategy supporting character positions, longest-match, overlapping matches, exact dictionary identity, kana/kanji boundaries, and deterministic ordering. |
| **D** | Translation relationships require first-class representation; `Japanese → English` is not the complete model. |
| **E** | Acquisition and normalization are separate lifecycle stages; raw source data must remain auditable. |

---

## 18. Handoff Contract to Phase 14.5B

### What 14.5B may consume — once this phase reaches GO

```
✓  immutable Tatoeba artifact
✓  verified SHA-256                     ✗  deterministic digest — NOT MEASURED
✓  verified source identity             ✗  acquisition manifest — WITHHELD
✓  format audit (observed schema)       ✗  parsed sentence records
✓  provenance registry entry  ← PRESENT ✗  source sentence IDs
✗  language metadata                    ✗  validation statuses
✗  translation relationships
```

### What 14.5B must still perform

```
→  normalization (Unicode policy, whitespace, newline, control characters)
→  deduplication by content fingerprint (without collapsing upstream IDs)
→  dictionary linkage          →  kanji linkage
→  reading-aware matching      →  character positions
→  longest-match logic         →  canonical example-sentence strategy
→  translation linkage         →  canonical database integration
```

### Current handoff state: **NOT SATISFIED**

Only the provenance registry entry is present, and its `version`/`releaseDate` remain
unverified. **Phase 14.5B is NOT AUTHORIZED** until this phase reaches GO with a verified
real artifact.

### 14.5B pre-conditions surfaced by this work

1. `example_sentences` cannot store Tatoeba records as declared (finding A).
2. No sentence↔sentence translation-relationship model exists in the codebase.
3. `SentenceMatcher` must be replaced with indexed, position-aware, longest-match matching
   (finding C).
4. Offset unit (Unicode code point vs UTF-16 code unit) must be decided and documented
   before any character position is exposed.
