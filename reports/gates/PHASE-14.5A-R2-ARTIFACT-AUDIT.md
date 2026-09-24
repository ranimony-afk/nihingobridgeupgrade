# Phase 14.5A-R2 Gate Report: Tatoeba Artifact Audit

**Gate**: Phase 14.5A-R2 — Tatoeba Real-Artifact Rebase, Provenance & Acquisition Foundation
**Deliverable**: §2 Critical Input Availability Gate (search order 2A → 2B → 2C → 2D)
**Date**: 2026-09-24
**Branch**: `arena/01a0d136-nihingobridgeupgrade`
**Commit**: `318289da2e816fa3a77b7e061b793cf3f6d0a219`
**Mode**: READ-ONLY AUDIT
**Files modified**: 0

---

## Verdict

```
ACQUISITION_STATUS:
BLOCKED — OFFICIAL SOURCE UNREACHABLE

ARTIFACT_HISTORY:
ABSENT

CANONICAL MUTATION VERIFICATION:
BLOCKED — DATABASE NOT AVAILABLE

DATABASE WRITES BY PHASE 14.5A-R2:
0
```

Per §2D, reporting this and stopping is the required outcome. Per §0/§1, a
BLOCKED/NO-GO/HARD STOP is "a valid successful outcome for this phase."

---

## 2A — Working Tree Search

§2A's globs were executed, plus an exhaustive filesystem sweep.

| Pattern | Result |
| :--- | :--- |
| `data/tatoeba/sentences.tsv` | **NOT FOUND** — `data/` does not exist |
| `data/tatoeba/sentences_detailed.tsv` | **NOT FOUND** |
| `**/*tatoeba*` | **2 matches — both are documents created by this session** |
| `**/*sentences*.tsv` | **0 matches** |
| `**/*sentences*` | **0 matches** |
| any `*.tsv` on the filesystem | **0 matches** |

```
./docs/architecture/TATOEBA-ACQUISITION.md          ← created by this session (spec, no data)
./docs/architecture/TATOEBA-PROVENANCE-MODEL.md     ← created by this session (spec, no data)
```

No path, size, mtime, Git status, tracked/untracked flag, or SHA-256 can be recorded,
because no candidate file exists. Per §25, these are reported as **NOT MEASURED** — not
zero, which would imply a measured-empty file.

A filesystem-wide search (`find / -iname "*tatoeba*"`, excluding `node_modules` and `/proc`)
returns only the two documents above. No `.tsv` exists anywhere on the sandbox.
`git status --porcelain` shows no untracked data file.

**2A result: ABSENT.**

---

## 2B — Git History

§2B requires explicitly checking for a shallow clone before concluding historical absence.

```console
$ git rev-parse --is-shallow-repository
true
$ git rev-list --count HEAD
1
```

**The local clone is depth-1 and its local history is not authoritative.** Per §2B ("Do not
conclude historical absence from shallow local history alone. If necessary, inspect
authoritative repository history through the approved repository hosting interface/API"),
the check was escalated to the GitHub API, which reads complete history:

```console
$ gh api "repos/ranimony-afk/nihingobridgeupgrade/commits?path=data/tatoeba" --jq 'length'
0                    → 0 commits EVER touched data/tatoeba

$ gh api "repos/ranimony-afk/nihingobridgeupgrade/git/trees/HEAD?recursive=1" \
    --jq '[.tree[].path | select(test("tatoeba|sentences.*\\.tsv"))] | length'
0                    → no tatoeba/ or sentences*.tsv path in the complete tree
```

Additional authoritative checks:

```console
$ git ls-remote --heads origin
arena/01a0a337-nihingobridgeupgrade
arena/01a0a394-nihingobridgeupgrade
arena/01a0a984-nihingobridgeupgrade
arena/01a0cc20-nihingobridgeupgrade
arena/01a0cc93-nihingobridgeupgrade
arena/01a0cd33-nihingobridgeupgrade
arena/gate-zero-ci-activation
main
            → 8 remote branches; none contains a Tatoeba artifact

$ gh pr list --state all --limit 50
            → 9 PRs, all MERGED, phases 13.x–14.4E; zero Tatoeba artifacts
```

A `path=data` query returns 10 commits; each was inspected and consists solely of unrelated
scaffold operations (`.dockerignore`, `.env.example`, `.github/workflows/*`, `Dockerfile`,
`README.md`). **No sentence artifact is among them.** The dedicated `path=data/tatoeba`
query returns 0.

```
ARTIFACT_HISTORY: ABSENT
```

Absence is established by authoritative full-history evidence, not by shallow local history.

---

## 2C — Provenance Registry

§2C requires verifying source ID, domain, license, attribution, version, release date,
target tables, and aliases — and **critically distinguishing provenance registration from
artifact acquisition**.

Located at `src/services/knowledge/provenance/registry.ts:125`:

| §2C field | Observed | Status |
| :--- | :--- | :--- |
| source ID | `upstream:tatoeba:2024-07` | **PRESENT** |
| domain | `sentence` | **PRESENT** |
| license | `CC-BY-2.0-FR` | **PRESENT** |
| attribution | "Tatoeba Project (tatoeba.org) contributors under Creative Commons BY 2.0 FR" | **PRESENT** |
| version | `2024-07` | **PRESENT (assertion)** |
| release date | `2024-07-01` | **PRESENT (assertion)** |
| target tables | `["example_sentences"]` | **PRESENT** |
| aliases | `"tatoeba:corpus:2024-07" → "upstream:tatoeba:2024-07"` (`registry.ts:287`) | **PRESENT** |

Also present: `type: "upstream"`, `name`, `uri: "https://tatoeba.org"`, `description`,
`status: "active"`.

### The required critical distinction

> **provenance registration ≠ artifact acquisition**

The registry entry establishes a **source identity, licence, and attribution obligation**.
It provides **no evidence whatsoever** that any artifact was acquired, and it contains no
checksum, byte size, or record count. No field in the registry derives from an inspected
file.

Consequently the `version: "2024-07"` and `releaseDate: "2024-07-01"` values are
**assertions pending verification**. Per §3 ("Do not assume the expected historical SHA")
and §5 ("Never use placeholder values ... for measured fields"), no correction was made and
no registry value was treated as artifact evidence.

**§2C compliance: the existing source identity was reused, not duplicated** ("Do NOT
duplicate an existing source identity"). No second Tatoeba identity was created. No
registry entry was modified or deleted.

---

## 2D — Approved Acquisition

§2D permits **only** an approved Tatoeba distribution channel, and explicitly prohibits
silent substitution of GitHub mirrors, Kaggle, Hugging Face, npm, PyPI, third-party
datasets, scraped copies, or community archives.

### Official endpoint test

| Approved endpoint | Result |
| :--- | :--- |
| `https://downloads.tatoeba.org/exports/` | **HTTP 000** |
| `https://downloads.tatoeba.org/exports/per_language/jpn/` | **HTTP 000** |
| `https://downloads.tatoeba.org/exports/sentences.tar.bz2` | **HTTP 000** |
| `https://tatoeba.org/en/downloads` | **HTTP 000** |

All four fail with `OpenSSL SSL_connect: SSL_ERROR_SYSCALL` — the connection is not
established. Control probes confirm the sandbox is not simply offline:

| Control host | Result |
| :--- | :--- |
| `https://github.com` | **HTTP 200** |
| `https://registry.npmjs.org` | **HTTP 200** |

The sandbox enforces a strict egress allowlist admitting GitHub and package registries
only. General web egress — including all `tatoeba.org` hosts — is closed.

### Approved repository-hosted artifact: confirmed not to exist

A prior audit established, and this one re-confirms, that Tatoeba's official GitHub
organisation (`github.com/Tatoeba`, 20 public repositories) is **reachable** but hosts
**software only** (`tatoeba2` platform server, `tatoeba-api`, `tatodb`, `horus`, `imouto`,
`nihongoparserd`, mobile apps, tooling). Release-asset check: **0 releases** across
`tatoeba2`, `tatoeba-api`, `tatodb`, and `horus`. Sentence exports are distributed
exclusively via `downloads.tatoeba.org`, which is unreachable.

There is therefore **no approved acquisition path** — neither direct official endpoint nor
official repository-hosted artifact.

### Prohibited substitutes — none attempted

| Prohibited substitute | Disposition |
| :--- | :--- |
| GitHub mirrors | **NOT attempted** (§2D) |
| Kaggle | **NOT attempted** |
| Hugging Face | **NOT attempted** |
| npm / PyPI packages | **NOT attempted** — despite these registries being reachable, using them would circumvent the blocked official source |
| Third-party datasets | **NOT attempted** |
| Scraped copies | **NOT attempted** |
| Community archives | **NOT attempted** |
| Synthetic corpus / fake `sentences.tsv` | **NOT created** (§1) |

No substitution was performed, silently or otherwise.

```
ACQUISITION_STATUS:
BLOCKED — OFFICIAL SOURCE UNREACHABLE
```

Per §2D, execution **STOPS** here.

---

## §4 Format Audit — BLOCKED

§4 requires inspecting the actual artifact before writing the parser, to determine
delimiter, encoding, BOM, column count, language-code representation, ID and text fields,
malformed rows, duplicate IDs, duplicate text, newline conventions, Unicode normalization,
empty fields, control characters, invalid UTF-8, and unexpected languages.

With no artifact, there is nothing to inspect. **No format assumption was encoded**, and
**no observed schema can be documented** — doing so would be fabrication. Per §19, no
`src/etl/tatoeba/` module was created, because that is authorized "only after the artifact
exists."

---

## §6/§7/§8/§9/§10 Contract Status

These are **contract definitions**, fully specified and recorded in
`docs/architecture/TATOEBA-ACQUISITION.md` §6, but **not exercised**, because they operate
on records that do not exist:

| § | Contract | Status |
| :--- | :--- | :--- |
| §6 | Sentence identity: `source_id`, `tatoeba_sentence_id`, `language`, `raw_text`; upstream ID never replaced | **SPECIFIED — NOT EXERCISED** |
| §7 | Japanese identified from the authoritative language field (`language = jpn`), never by Unicode inference | **SPECIFIED — NOT EXERCISED** |
| §8 | Translation graph preserved (`source_sentence_id`, `target_sentence_id`, `relationship_type`, `source_language`, `target_language`); untranslated sentences retained; no `japanese`/`english` flattening | **SPECIFIED — NOT EXERCISED** |
| §9 | `reading` is **not** populated from Japanese text; `reading = NULL` where no verified reading exists | **SPECIFIED — NOT EXERCISED** |
| §10 | No JLPT levels assigned during acquisition | **SPECIFIED — NOT EXERCISED** |

---

## §11 Canonical Database Policy

Target and observed:

```
database writes       = 0        (OBSERVED — no write path executed)
schema migrations     = 0        (OBSERVED — drizzle/ untouched, 4 migrations unchanged)
canonical mutations   = 0        (target; see below)
production access     = FORBIDDEN and OBSERVED 0
```

**Canonical mutation verification is BLOCKED, and is not claimed as verified.** Per §22:

```
CANONICAL MUTATION VERIFICATION:
BLOCKED — DATABASE NOT AVAILABLE

DATABASE WRITES BY PHASE 14.5A-R2:
0
```

No database is reachable: `DATABASE_URL` is unset, port 5432 is closed
(`ECONNREFUSED`), `psql` is not installed, and no `app_db` exists. The canonical corpus
cannot even be provisioned, because `data/JMdict.xml`, `data/kanjidic2.xml`, and
`data/kanjivg/` are absent — so a disposable PGlite instance would contain an empty schema
and would verify nothing.

Per §22: "Do not claim database immutability was empirically verified when it was not." It
was **not** empirically verified. What *is* established: no database write path was
executed, no connection was opened, and zero schema files changed.

---

## §28 Accepted Architectural Findings

Per §28, findings A–E from the previous audit are accepted as architectural inputs and
recorded in `docs/architecture/TATOEBA-ACQUISITION.md`:

| # | Finding | Status |
| :--- | :--- | :--- |
| **A** | `example_sentences` is insufficient as a raw Tatoeba store (`reading`, `english`, `jlpt_level` all `NOT NULL`) | **ACCEPTED** |
| **B** | `reading = japanese` substitution is prohibited | **ACCEPTED** |
| **C** | Existing `SentenceMatcher` is insufficient — O(sentences × dictionary_entries) via `japanese.includes(headword)`; 14.5B must use deterministic indexed matching with positions, longest-match, overlapping matches, exact identity, kana/kanji boundaries, deterministic ordering | **ACCEPTED** |
| **D** | Translation relationships require first-class representation; `Japanese → English` is not the complete model | **ACCEPTED** |
| **E** | Acquisition and normalization are separate lifecycle stages; raw source must remain auditable | **ACCEPTED** |

---

## Additional Finding — Predecessor Phase 14.4F Does Not Exist

§0 names the predecessor as "Phase 14.4F — Takoboto-Class Dictionary & Kanji API + Web UX
Foundation" and instructs: "Create a new branch from the verified Phase 14.4F state."

**No Phase 14.4F exists in this repository.** The latest phase report present is
`reports/gates/PHASE-14.4E-FINAL-GATE-REPORT.md`. The reports present are 14.4A through
14.4E only:

```
PHASE-14.4A-TAKOBOTO-DICTIONARY-ARCHITECTURE.md
PHASE-14.4B-* (kanjidic2 / kanji-jmdict manifests, reconciliation, dry-run)
PHASE-14.4C-CONTROLLED-KANJIDIC2-INGESTION.md, PHASE-14.4C-PREINGESTION-AUDIT.md
PHASE-14.4D-* (final gate, kanjivg coverage/dry-run, stroke-count reconciliation)
PHASE-14.4E-FINAL-GATE-REPORT.md, PHASE-14.4E-GRAPH-COVERAGE.md, PHASE-14.4E-READING-RECONCILIATION.md
```

The only files in the repository containing the string `14.4F` are **this session's own
audit reports**, quoting the prompt. There is no 14.4F gate report, no 14.4F branch, and no
14.4F PR (all 9 merged PRs are phases 13.x–14.4E).

This is the same defect class as the 14.5A premise: a predecessor phase referenced as
verified does not exist in the repository. It does not block the artifact audit, but it
should be reconciled before any phase claims to build on a "verified 14.4F state."

### Branch constraint

§0 instructs creating a new branch. This session is bound to
`arena/01a0d136-nihingobridgeupgrade` and must not create or switch to another branch —
session tracking depends on it. All work was therefore performed on the session branch,
which is branched from `main` at the merge commit of PR #9 (Phase 14.4E) — the latest
verified state that actually exists.

---

## Artifact Audit Verdict

```
=============================================================================
PHASE 14.5A-R2: BLOCKED
BLOCKING GATE: ARTIFACT AVAILABILITY

2A  Working tree        ABSENT          (0 .tsv on filesystem; no data/ directory)
2B  Git history         ABSENT          (authoritative full-history API: 0 commits
                                        touched data/tatoeba; shallow clone handled)
2C  Provenance registry PRESENT         (upstream:tatoeba:2024-07 — reused, not duplicated;
                                        registration ≠ acquisition, stated explicitly)
2D  Approved acquisition BLOCKED        (all official endpoints HTTP 000; approved
                                        repo-hosted artifact confirmed not to exist)

DATABASE WRITES:        0
SCHEMA MIGRATIONS:      0
PRODUCTION ACCESS:      0
CANONICAL MUTATIONS:    NOT VERIFIABLE — DATABASE NOT AVAILABLE

No artifact fabricated. No fake sentences.tsv. No synthetic substitute.
No mirror / npm / PyPI / Kaggle / HuggingFace substitution attempted.
No release metadata invented. No SHA-256 invented. No counts invented.
No parser created (§19 precondition unmet). No manifest created (§5/§18).
14.5B AUTHORIZATION: NOT GRANTED
=============================================================================
```

**HARD STOP.** Execution halts at §2D.
