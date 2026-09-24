# TATOEBA ARTIFACT REQUIREMENT SPECIFICATION

**Phase**: 14.5A (BLOCKED) — supporting reconnaissance
**Date**: 2026-09-24
**Trigger**: user-directed inspection of `ranimony-afk/Knowledge-base-NihongoBridge` and `LBeaudoux/tatoebatools`
**Mode**: READ-ONLY. Nothing downloaded, ingested, extracted, or persisted.
**Status**: 14.5A remains **BLOCKED**. 14.5B/14.5C/14.5D remain **NOT AUTHORIZED**.

---

## 1. Answer in one line

**Neither repository contains the Tatoeba corpus. The knowledge-base repo contains *code
that specifies* the required files; `tatoebatools` is a *downloader library* with no data.
The artifact must still be supplied from outside this environment.**

However, this inspection produced the **exact artifact specification** — which is the
genuinely useful result and is recorded in §3 below.

---

## 2. What the two repositories actually contain

### 2.1 `ranimony-afk/Knowledge-base-NihongoBridge`

| Property | Value |
| :--- | :--- |
| Exists | yes |
| Visibility | **public** |
| Size | 23,123 KB (largest files are Dart analysis caches, not data) |
| Branches | `main`, `arena/01a0a335-knowledge-base-nihongobridge` |
| Releases / tags | **0 / 0** |
| Git LFS | no (`.gitattributes` is a plain `* text=auto`) |
| Tree entries | 5,156 (not truncated) |
| Last push | 2026-09-15 |

**Tatoeba content found — CODE ONLY:**

| Path | Bytes | Classification |
| :--- | :--- | :--- |
| `nihongobridge-etl/data/tatoeba/.gitkeep` | **0** | **PLACEHOLDER — the data directory is EMPTY** |
| `nihongobridge-etl/etl/parsers/tatoeba_stager.py` | 15,574 | **CODE** |
| `nihongobridge-etl/etl/pipelines/tatoeba_pipeline.py` | 20,309 | **CODE** |
| `nihongobridge-etl/etl/config.py` | 6,681 | **CODE** (declares the required artifacts) |
| `nihongobridge-etl/tests/test_tatoeba_stager.py` | 2,038 | **TEST** |
| `nihongobridge-etl/tests/test_tatoeba_pipeline_dry_run.py` | 2,387 | **TEST** |
| `nihongobridge-knowledge/schema/sentences.ts` | 2,533 | **CODE** |
| `nihongobridge-knowledge/lib/sentences.{js,d.ts}` | 2,464 / 10,910 | **CODE** (built output) |

**Corpus artifact: NONE.** Verified three ways:

1. `data/tatoeba/` contains a single 0-byte `.gitkeep` on **both** branches.
2. All sibling `data/` directories (`raw`, `enrichment`, `seeds/sentences`, `tts-temp`) are likewise `.gitkeep`-only.
3. **Commit history: exactly one commit ever touched `nihongobridge-etl/data/tatoeba`** — `0fa43c07` (2026-08-19, "knowledge base"), which created the directory. No artifact was ever committed.

No `.tsv`, `.csv`, `.bz2`, `.gz`, or `.zip` data files exist anywhere in the tree.

### 2.2 `LBeaudoux/tatoebatools`

| Property | Value |
| :--- | :--- |
| Description (upstream) | *"A library for fetching and reading Tatoeba's weekly exports"* |
| Language / licence | Python / MIT |
| Size | **240 KB** |
| Data files | **NONE — verified: zero `.tsv`/`.csv`/`.bz2`/`.gz`/`.zip`** |
| Modules | `download.py`, `datafile.py`, `table.py`, `models.py`, `config.py`, `jpn_indices.py`, `sentences_*.py`, `links.py`, `tags.py` |

**This is a client library, not a data source.** It downloads from Tatoeba on demand. It
therefore cannot supply the artifact in this environment for two independent reasons:

1. **Network**: its upstream host is unreachable (see §4).
2. **Policy**: running it would be *network acquisition of Tatoeba from inside Arena*,
   which is explicitly forbidden. A downloader library is not the artifact.

**Genuinely useful, though**: it is a well-maintained reference implementation for
Tatoeba's export schema, and `jpn_indices.py` documents the Japanese/English sentence-pair
concept (the "B lines" of the Tanaka Corpus). This is legitimate **design reference** for
Phase 14.5B's staging model and for §49/§50 of the Takoboto prompt — as documentation, not
as data.

---

## 3. THE REQUIRED ARTIFACTS — extracted from the specification code

This is the answer to "the required Tatoeba files". Derived from
`nihongobridge-etl/etl/config.py` and `etl/pipelines/tatoeba_pipeline.py` +
`etl/parsers/tatoeba_stager.py`.

### 3.1 Required files

| # | Archive | Source URL | Member extracted | Format | Required? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `sentences.tar.bz2` | `https://downloads.tatoeba.org/exports/sentences.tar.bz2` | `sentences.csv` | `id\tlang\ttext` (**tab-separated**) | **YES** |
| 2 | `links.tar.bz2` | `https://downloads.tatoeba.org/exports/links.tar.bz2` | `links.csv` | `id\tid` (tab-separated) | **YES** |
| 3 | `tags.tar.bz2` | `https://downloads.tatoeba.org/exports/tags.tar.bz2` | `tags.csv` | `id\tlang\ttag` | optional |

The base URL is declared as `tatoeba_base_url = "https://downloads.tatoeba.org/exports"`.
Members are named `.csv` but the stager parses them as **tab-separated**
(`_parse_sentence_line` splits on `\t` and returns `tuple[int, str, str]`), matching
Tatoeba's actual export format.

### 3.2 Record shapes

```
sentences.csv   1234567<TAB>jpn<TAB>日本語の文です
links.csv       1234567<TAB>7654321
tags.csv        1234567<TAB>jpn<TAB>colloquial
```

Language filtering is **`language == "jpn"`** — Japanese is selected by the artifact's own
language field, never inferred from the presence of kana/kanji.

The reference language map is `{"eng": "en", "tam": "ta", "hin": "hi", "mal": "ml"}`.
Note it includes **Hindi (`hin`)** — broader than the TypeScript repo's
`SUPPORTED_LANGUAGES = ["en","ta","ml"]`. Worth reconciling in 14.5B, not now.

### 3.3 Checksums — DECLARED BUT UNSET

```python
tatoeba_sentences_sha256: str | None = None
tatoeba_links_sha256:     str | None = None
tatoeba_tags_sha256:      str | None = None
tatoeba_require_checksums: bool = False
```

**No expected checksums are recorded anywhere.** The fields exist and the downloader
supports `expected_sha256` / `require_checksum`, but every value is `None` and enforcement
is off.

**Consequence for 14.5A**: the artifact cannot be validated against a *pre-declared*
checksum. Verification must therefore follow the established procedure — **measure**
`compressedSHA256` and `extractedSHA256` from the supplied bytes and record them, rather
than comparing against an expected value. This is consistent with the standing rule that a
digest must be measured from the bytes actually present and never inherited from a report.

### 3.4 Scale expectations

```python
tatoeba_estimated_japanese_sentences: int = 250_000   # ≥ 1
tatoeba_seed_limit_per_level:         int = 1_000     # 1..1000
tatoeba_batch_size:                   int = 250       # 1..500
tatoeba_stage_filename:  "tatoeba-stage.sqlite3"
```

`250,000` is a **declared estimate**, not a measurement. Per the standing rule, historical
and estimated counts are verification targets only — never hardcoded and never tuned toward.

### 3.5 Staging shape (design reference for 14.5B)

The stager uses a **SQLite staging file** (`tatoeba-stage.sqlite3`) separate from
PostgreSQL, with:

```sql
CREATE TABLE links (japanese_id, target_id);
CREATE INDEX links_target_idx ON links(target_id);
```

and a `sentences-{level}.json` seed export. This is a concrete, independent precedent for
the 14.5B "staging model before schema decision" sequencing — and it confirms the ordering
the project already mandates: **artifact → validation → provenance → staging → canonical
persistence**, never straight to canonical tables.

---

## 4. Current reachability (re-probed)

| Host | Result |
| :--- | :--- |
| `downloads.tatoeba.org/exports/sentences.tar.bz2` | **HTTP 000** |
| `downloads.tatoeba.org/exports/links.tar.bz2` | **HTTP 000** |
| `downloads.tatoeba.org/exports/tags.tar.bz2` | **HTTP 000** |
| `downloads.tatoeba.org/exports/` | **HTTP 000** |
| `tatoeba.org/en/downloads` | **HTTP 000** |
| `github.com` (control) | HTTP 200 |
| `registry.npmjs.org` (control) | HTTP 200 |
| `pypi.org` (control) | HTTP 200 |

Egress reaches GitHub and the package registries; Tatoeba's hosts do not respond. **Installing
`tatoebatools` would not help** — `pip install` would succeed (PyPI is reachable) but every
download it attempts would fail at the same wall.

---

## 5. Why nothing was extracted

The user instruction was to "extract the required Tatoeba files". That could not be
executed, and the reasons are independent — each sufficient on its own:

| Reason | Detail |
| :--- | :--- |
| **1. The files are not in either repository** | Knowledge repo: `.gitkeep` only, 1 commit ever, 0 releases, no LFS. `tatoebatools`: library only, 0 data files. |
| **2. The upstream host is unreachable** | HTTP 000 on every Tatoeba endpoint; controls return 200. |
| **3. Acquisition inside Arena is prohibited** | Standing constraint: network acquisition of Tatoeba is forbidden here, and installing a downloader library to fetch it would be exactly that. |
| **4. Downloader ≠ artifact** | §15 of the prior archaeology task: code, manifest, fixture, report, and filename are *not* the corpus artifact. Only the corpus satisfies 14.5A. |
| **5. A public GitHub copy would still need a decision** | Had a copy existed in a public repo, retrieving it would raise the "GitHub mirror" question. It does not exist, so the point is moot — but it is flagged rather than silently resolved. |

No file was downloaded. No directory was created. No extraction was performed. Nothing was
written to `data/` (which still does not exist).

---

## 6. What the user must supply

To unblock 14.5A, place **two** files (a third is optional) from an environment with
Tatoeba access:

```
sentences.tar.bz2     ← REQUIRED   (contains sentences.csv: id\tlang\ttext)
links.tar.bz2         ← REQUIRED   (contains links.csv:     id\tid)
tags.tar.bz2          ← optional   (contains tags.csv:      id\tlang\ttag)
```

Then instruct the next session:

> *Verify this supplied artifact. Do not reacquire, substitute, normalize, transform, or
> persist it.*

Verification will proceed as established:

```
measured byte size
measured compressedSHA256   (of the .tar.bz2 as downloaded)
measured extractedSHA256    (of the extracted .tsv/.csv member)
recorded acquisition tool + version
registered source + evidenced snapshot date
provenance chain: every parsed record → those bytes
```

A record that cannot be traced through that chain is `requires_review`, however plausible
its content. Snapshot identity follows the decided convention
`upstream:tatoeba:snapshot-<YYYY-MM-DD>-<sha256-prefix>`, with the retained
`upstream:tatoeba:2024-07` entry marked **superseded**, never rewritten or deleted.

**Forbidden substitutes remain forbidden**: GitHub mirrors, Kaggle, HuggingFace, npm/PyPI
side channels, scraped/unofficial datasets, and synthetic regeneration.

---

## 7. Effect on the Takoboto dictionary programme

This inspection does **not** unblock 14.5A and does **not** authorize 14.5B. It does mean:

1. **§50 (`TatoebaProvider` boundary) now has concrete grounding.** The interface should be
   shaped around the real artifact structure confirmed here — sentence records keyed by
   upstream id with an authoritative `lang` field, plus a separate many-to-many link
   relation — rather than around a guessed Tatoeba schema.
2. **§49 (sentence design) gains a second data point.** The Python stager's
   `links(japanese_id, target_id)` table and its stage-before-canonical ordering corroborate
   the TS repo's design. Neither is implemented in 14.5A.
3. **The Hindi question is raised.** The reference stager supports `hin`; the TS repo
   supports `en`/`ta`/`ml`. This is a 14.5B scoping decision, recorded now.
4. **Gate A's finding stands unchanged**: no sentence data is available, so the dictionary
   entry page's sentence section must degrade to an empty state, and `example_sentences`
   must not be populated.

---

## 8. Integrity statement

| Invariant | Value |
| :--- | :--- |
| Files downloaded | **0** |
| Tatoeba data acquired | **0** |
| Records ingested | **0** |
| `data/` created | **no** |
| Source files modified | **0** |
| Schema changes / migrations | **0 / 0** (still 4) |
| Patch applied | **no** |
| Production access | **0** |
| Tatoeba data fabricated or substituted | **0** |

**Phase 14.5A: BLOCKED. 14.5B/14.5C/14.5D: NOT AUTHORIZED.**
