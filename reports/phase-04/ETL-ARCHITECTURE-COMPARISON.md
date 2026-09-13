# Phase 04.1 — ETL Architecture Comparison

**Status:** ⛔ **BLOCKED — Rule 14 STOP condition invoked**
**Date:** Phase 04.1 execution
**Scope:** Compare Repository B ETL against Repository A `etl/`; keep the better architecture; do not create two ETL frameworks.

---

## 1. Executive summary

Phase 04.1 requires a **two-sided comparison**. Only **one side is readable**.

| Side | Repository | Status | Evidence |
|---|---|---|---|
| B (source) | `Knowledge-base-NihongoBridge` | ✅ Readable, audited, tests run | GitHub API `200`; cloned 108 MB |
| A (canonical target) | `Arena-test` | ❌ **Unreadable** | GitHub API `404`; `git clone` → `could not read Username` |

Because Repository A's `etl/` cannot be inspected, the instruction *"keep the better architecture"* **cannot be decided on evidence**. Guessing here would risk the single most damaging outcome the master prompt forbids: **two competing ETL frameworks**.

**The 04.1 deployment gate ("ETL test suite passes") has been independently VERIFIED against Repository B — 25 passed, ruff clean.**

---

## 2. Access evidence

```
$ curl -s -o /dev/null -w "%{http_code}" .../repos/ranimony-afk/Arena-test
404
$ curl -s -o /dev/null -w "%{http_code}" .../repos/ranimony-afk/Knowledge-base-NihongoBridge
200
$ git clone --depth 1 https://github.com/ranimony-afk/Arena-test
fatal: could not read Username for 'https://github.com': No such device or address
$ env | grep -iE 'GITHUB|GH_TOKEN'
(no output — no credential available)
```

`Arena-test` is private (or renamed/deleted). No GitHub token is present in the environment.

### 2.1 The local workspace is NOT Repository A

| Check | Result |
|---|---|
| `git remote -v` | `fatal: not a git repository` |
| `etl/` | does not exist |
| `reports/gates/` (Phases 00–03) | do not exist |
| Actual contents | Next.js flashcard app (`decks`/`cards`/`progress`/`sessions`, 128 seeded cards) |

The sandbox contains the small Nihongo Bridge flashcard app built in the previous turn. It is **not** a checkout of Arena-test and shows **no trace of Phases 00–03**. Treating it as the canonical target would violate *"Repository A is canonical"* and *"never replace Repository A."*

---

## 3. Repository B ETL — audit (read-only)

`nihongobridge-etl` — Python 3.11+, 51 modules, 13 test files.

### 3.1 Stack

| Concern | Implementation |
|---|---|
| Language | Python 3.11+ (`requires-python = ">=3.11"`) |
| Config | `pydantic-settings` `BaseSettings` + field/model validators |
| DB | SQLAlchemy 2.0 **async** + `asyncpg` |
| Parsing | `lxml.iterparse` (memory-bounded streaming) |
| NLP | `fugashi` + `unidic-lite` (furigana) |
| Audio | `edge-tts` (+`pydub`) |
| Storage | MinIO / S3-compatible |
| Lint/Types | `ruff` (E,F,I,UP,B,ASYNC,RUF) + `mypy --strict` w/ pydantic plugin |
| Tests | `pytest` + `pytest-asyncio` |

### 3.2 Mapping to master-prompt target `etl/` architecture

| Target dir | Repo B equivalent | Present |
|---|---|---|
| `sources/` | `utils/downloader.py`, `config.py` source URLs | ✅ |
| `parsers/` | `parsers/jmdict_parser.py`, `tatoeba_stager.py` | ✅ |
| `transforms/` | `transformers/jmdict_transformer.py` | ✅ |
| `enrichment/` | `enrichers/` (frequency, furigana, JLPT ×2) | ✅ |
| `validators/` | `quality_checker.py`, `ValidationReport`, `TatoebaReport`, `TTSReport` | ✅ |
| `provenance/` | `generators/helpers.py::provenance()`, `*_source_attribution` | ✅ (distributed, not a dedicated pkg) |
| `matching/` | `enrichers/content_matcher.py` (`ContentMatcher`, `MatchResult`) | ✅ |
| `exports/` | `loaders/`, `SENTENCE_SEED_DIR` seed export | ✅ |

**Coverage of the target architecture is effectively complete.**

### 3.3 Production-grade qualities observed

- **Integrity:** SHA-256 computed during transfer; `REQUIRE_SOURCE_CHECKSUM`; gzip CRC/truncation validation; 64-char hex digest validator.
- **Resumability:** committed checkpoints (`jmdict.json`, `tatoeba.json`, `tts.json`), `CHECKPOINT_EVERY_BATCHES`.
- **Idempotency:** existing `(source, source_id)` lookup + transactional batch upsert (no destructive ops observed — consistent with Rule 3).
- **License awareness (Rule 9):** explicit attribution constants — JMdict/EDRDG **CC BY-SA 3.0**, Tatoeba **CC BY 2.0 FR**. Sources are openly licensed; no proprietary scraping observed.
- **Safety rails:** statement timeouts, pool tuning, bounded batch sizes, retry/backoff, TTS rate-limiting.

### 3.4 Architectural coupling (integration risk)

- `.env.example` targets DB `nihongobridge_dev` with a **`postgresql+asyncpg://`** URL scheme; `normalize_database_url` **rejects** any non-PostgreSQL URL.
- README states the **`nihongobridge-knowledge` Phase 1 migration must be applied first** — the loaders write into that schema.
- Requires **MinIO** and external enrichment datasets (OpenJLPT, Innocent Corpus).

→ This ETL is bound to the `nihongobridge-knowledge` schema, **not** to whatever schema Phase 03 established in Repo A. That binding is the core unresolved question.

---

## 4. Verified gate result

**Gate: "ETL test suite passes."**

```
$ pip3 install --user -r requirements.txt -r requirements-dev.txt   # PIPEXIT=0
$ python3 -m pytest
.........................                                    [100%]
25 passed in 0.64s

$ python3 -m ruff check .
All checks passed!
```

✅ **Gate PASSED against Repository B's ETL**, on Python 3.11.2, with zero source modifications.

Caveat: these are unit/dry-run tests (`test_pipeline_dry_run`, `test_tatoeba_pipeline_dry_run`). They do **not** exercise a live PostgreSQL load, MinIO, or real network downloads. Passing tests ≠ verified end-to-end ingestion.

---

## 5. The unresolvable question

> *"Compare Repository B ETL against Repository A `etl/`. Keep the better architecture."*

Two mutually exclusive states, indistinguishable without Repo A:

- **State 1 — Repo A has no `etl/`.** Then adopt Repo B's Python ETL as the single framework. No conflict.
- **State 2 — Phase 03 created a TypeScript `etl/` in Repo A.** Then adopting Repo B's Python ETL **creates exactly the two-framework outcome 04.1 forbids**, and a language/runtime split (Vercel Node vs. Python 3.11 + MinIO + FFmpeg).

Choosing blindly is a coin-flip on the phase's primary constraint.

---

## 6. Recommendation

**Recommended: Option 1 — grant read access to Repository A, then resume.**
Unblocks the comparison immediately; all other work is already staged. Provide a read-scoped `GITHUB_TOKEN`, make the repo public, or paste `Arena-test`'s `etl/` tree + `package.json`.

**Fallback if Repo A has no `etl/`: adopt Repo B's Python ETL as canonical.** It is demonstrably production-grade (checksums, checkpoints, provenance, licensing, 25 green tests) and already covers the full target architecture. Do **not** rewrite it in TypeScript — that would discard verified, tested logic for no functional gain.

**Deployment note:** this ETL must run as an **out-of-band job** (CI runner / worker container), *not* on Vercel serverless — it needs long-running streaming parses, FFmpeg, MinIO and 100k+ row batch upserts. The Next.js app should trigger and monitor it via the admin ETL control surface, never execute it in-process.

**Rejected:** porting Repo B's ETL to TypeScript (high cost, loses tested logic); running both frameworks (explicitly forbidden).

---

## 7. What was NOT done, and why

| Not done | Reason |
|---|---|
| Copied `nihongobridge-etl` into the workspace | Workspace is not Repo A; would misplace production code |
| Scaffolded a TypeScript `etl/` | Would risk a second ETL framework (forbidden by 04.1) |
| Modified any production code | No evidence base for the decision |
| Claimed deployment | Rule 15 — no deployment was performed |
| Marked Phase 04 complete | Gate criteria not fully satisfiable |
