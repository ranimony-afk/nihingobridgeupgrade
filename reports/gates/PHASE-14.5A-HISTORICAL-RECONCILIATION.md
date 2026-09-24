# Phase 14.5A Historical Claim Reconciliation

**Gate**: Phase 14.5A-R3 — Tatoeba Sentence Acquisition & Provenance Foundation
**Deliverable**: §27 Historical Claim Reconciliation
**Date**: 2026-09-24
**Method**: Independent verification against the repository, its authoritative remote
history, and the actual filesystem. No prior report was trusted as evidence.

---

## Purpose

§27 requires that if actual acquisition differs from previously claimed values, the new
result must **not** be made to resemble the old report. Instead, every historical claim is
tabulated against actual evidence and marked verified or not reproducible.

**No historical claim below could be independently reproduced**, because no artifact exists
to measure. Per §3, `SHA_STATUS = NOT_VERIFIED`.

---

## 1. Claims Under Reconciliation

All values below originate from prose in earlier phase prompts and from the prior 14.5A
report. Per §0 and §3, they are treated as **unverified historical claims only**.

```
Artifact:  data/tatoeba/sentences.tsv
SHA-256:   d22978218dfee13a46021ef700aff9a968081133ca4141c0eb7ad966ad038d0b
Raw records        154
Japanese records    79
Accepted            72
Warnings             7
Rejected             0
Relationships       74   (3 one-to-many, 1 many-to-one, 5 untranslated)
Digest             1f5308f2286288adb5eadcb79afb69c176de1d5d029b820e0c21a66db29d3b09
Version            2024-07
```

---

## 2. Mandated Reconciliation Table (§27)

| Historical claim | Actual evidence | Status |
| :--- | :--- | :--- |
| **Previous artifact** — `data/tatoeba/sentences.tsv` | No such path exists. `data/` directory does not exist. Expanded search for `sentences.tsv`, `sentences_detailed.tsv`, `links.tsv`, `sentences.csv`, `sentences.tar.bz2`, `sentences_detailed.tar.bz2`, `jpn_sentences.tsv`, `tatoeba_links.tsv` → **all absent**. Zero `.tsv` files anywhere on the filesystem. | **NOT REPRODUCIBLE** |
| **Previous SHA** — `d2297821…038d0b` | Cannot be computed; no artifact to hash. The string appears nowhere in the repository except inside reports quoting the claim itself. | **NOT VERIFIABLE — SHA_STATUS = NOT_VERIFIED** |
| **Previous counts** — 154 / 79 / 72 / 7 / 0 | Cannot be measured; no artifact to parse. | **NOT MEASURED** |
| **Previous digest** — `1f5308f2…9d3b09` | Cannot be computed; no records to digest. | **NOT COMPUTED** |
| **Previous version** — `2024-07` | Present in `registry.ts:125` as a registry **assertion**. No artifact, checksum, release manifest, or upstream documentation in this environment corroborates it. | **UNVERIFIED** |
| **Relationship counts** — 74 / 3 / 1 / 5 | Cannot be measured; no `links.tsv` or relationship data present. | **NOT MEASURED** |

**Conclusion: every measured historical claim is unreproducible. The actual artifact
remains non-existent; therefore the actual artifact cannot "become authoritative," and no
substitute was manufactured to fill the gap.**

---

## 3. Repository History Evidence

Absence was established authoritatively, not from shallow local history.

```console
$ git rev-parse --is-shallow-repository
true                    # depth-1 clone — local history is NOT authoritative
$ git rev-list --count HEAD
1

# Escalated to authoritative full-history API:
$ gh api "repos/ranimony-afk/nihingobridgeupgrade/commits?path=data/tatoeba" --jq 'length'
0                       # 0 commits EVER touched data/tatoeba

$ gh api "repos/ranimony-afk/nihingobridgeupgrade/git/trees/HEAD?recursive=1" \
    --jq '[.tree[].path | select(test("tatoeba|sentences.*\\.tsv"))] | length'
0                       # no such path in the complete tree
```

- **8 remote branches** inspected — none contains a Tatoeba artifact.
- **9 pull requests (all states)** inspected — phases 13.x–14.4E only; zero Tatoeba artifacts.
- A `path=data` query returns 10 commits; each was individually inspected and consists of
  unrelated scaffold operations (`.dockerignore`, `.env.example`, `.github/workflows/*`,
  `Dockerfile`, `README.md`). **No sentence artifact among them.**

---

## 4. Phase Reconstruction Claims

§1 requires reconciling the phase lineage itself, not just the artifact.

| Historical claim | Actual evidence | Status |
| :--- | :--- | :--- |
| **Phase 14.5A completed and independently verified with GO** | No 14.5A gate report existed before this session; no 14.5A code, test, manifest, or artifact exists. `reports/gates/` contained no `PHASE-14.5*` file. | **NOT SUPPORTED** |
| **Phase 14.5A baseline: 40/40 test files, 774/774 tests** | Measured on a clean checkout: **18 failed / 20 passed (38 files)**, **62 failed / 551 passed / 102 skipped (715 tests)**. | **MISMATCH** |
| **Phase 14.4F — Takoboto-Class Dictionary & Kanji API + Web UX Foundation (verified precursor)** | **Does not exist.** Latest report present is `PHASE-14.4E-FINAL-GATE-REPORT.md`. Reports present span 14.4A–14.4E only. All 9 merged PRs are 13.x–14.4E. The only files containing "14.4F" are this session's audit reports quoting the prompt. | **NOT SUPPORTED** |
| **Branch `arena/01a0cd33-nihingobridgeupgrade` carries the 14.5A work** | That branch is the **Phase 14.4E** branch (PR #9, merged 2026-09-23), containing 0 Tatoeba/14.5 files. | **MISMATCH** |
| **`dictionary_entries: 206,747` vs test assertion `206,717`** | Both correct, different scopes: 206,747 = table total (206,717 JMdict + 30 first-party + 2 pilot); 206,717 = JMdict subset. Confirmed by `PHASE-14.4E-FINAL-GATE-REPORT.md:7` and `PHASE-14.4C-PREINGESTION-AUDIT.md:22`. | **RECONCILED — no contradiction** |

---

## 5. Plausibility Assessment of the Historical Claims

Recorded because §3 requires determining the artifact's actual source/version rather than
relabelling it.

Tatoeba's published sentence exports are corpora of **millions** of sentences spanning
hundreds of languages; Japanese alone is on the order of 10⁵ sentences. A file containing
**154 records, of which 79 are Japanese**, is roughly **four orders of magnitude** smaller
than any actual Tatoeba release export.

Consequences:

- `d2297821…038d0b` **cannot** be the SHA-256 of a genuine Tatoeba `2024-07` release artifact.
- The 154/79/72/7/0 statistics **cannot** describe a genuine Tatoeba release.
- Therefore the historical 14.5A was, with high confidence, authored against a **small
  curated fixture** rather than an official Tatoeba export — and its figures were never
  reproducible from upstream data.

Per §0 rule 14 and §2D, no substitute release, mirror, or package-registry copy was used to
attempt to match these figures. Per §0 rule 19, the existence of a report claiming GO was
given no evidentiary weight.

---

## 6. Outcome

```
ARTIFACT:    NOT AVAILABLE
SHA_STATUS:  NOT_VERIFIED
COUNTS:      NOT MEASURED
DIGEST:      NOT COMPUTED
VERSION:     UNVERIFIED

No historical claim was confirmed.
No historical claim was reproduced by substitution.
No new value was adjusted to resemble a historical claim.
```

The prior 14.5A report's **NO-GO** verdict stands unchanged and is **not** superseded by any
new GO. No previous gate report was deleted (§0 rule 22).
