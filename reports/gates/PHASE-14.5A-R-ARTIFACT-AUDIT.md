# Phase 14.5A-R Gate Report: Tatoeba Artifact Availability Audit

**Gate**: Phase 14.5A-R — Tatoeba Acquisition & Provenance Foundation (Reproducible Rebase)
**Deliverable**: §2 Critical Input Availability Gate (search order A→B→C→D)
**Date**: 2026-09-24
**Branch**: `arena/01a0d136-nihingobridgeupgrade`
**Commit**: `318289da2e816fa3a77b7e061b793cf3f6d0a219`
**Mode**: READ-ONLY
**Files modified**: 0

---

## Verdict

```
BLOCKED — PHASE 14.5A-R ARTIFACT UNAVAILABLE
Blocking gate: §2 Gate 1 (Artifact availability)
```

§2's search order was executed **in full and in order**. No legitimate Tatoeba artifact is
available at any of the four levels. §2's HARD STOP therefore applies, and per §0 no
artifact was invented, synthesised, or substituted.

---

## 2A. Repository Search — ABSENT

```console
$ for f in data/tatoeba/sentences.tsv data/tatoeba/sentences_detailed.tsv data/sentences.tsv; do
    printf "%-42s " "$f"; [ -f "$f" ] && echo "EXISTS" || echo "ABSENT"; done
data/tatoeba/sentences.tsv                 ABSENT
data/tatoeba/sentences_detailed.tsv        ABSENT
data/sentences.tsv                         ABSENT

$ ls data
ls: cannot access 'data': No such file or directory

$ git grep -l "sentences.tsv" HEAD | wc -l
0
$ git grep -l "sentences_detailed.tsv" HEAD | wc -l
0
$ git grep -l "upstream:tatoeba" HEAD | wc -l
4      # registry.ts, mobileDictionary.ts, tests/knowledge-retrieval.test.ts, tests/provenance-foundation.test.ts
```

The four `upstream:tatoeba` hits are **references to the source identity**, not to any
acquired data file. No `sentences.tsv` path is referenced anywhere in tracked source.

**Repository policy note**: `.gitignore:35-37` already excludes the corpus directory:

```
# Knowledge Corpus & ETL Downloads (Phase 14)
/data/
*.gz
```

So even had the artifact been present locally, repository policy is that it is **not
version-controlled**. This is relevant to §2's "approved repository-hosted artifact"
question (see §2D).

---

## 2B. Git History — NEVER EXISTED

Local `git log --all` is **not authoritative here**, because the clone is shallow:

```console
$ git rev-list --count HEAD
1
$ git rev-parse --is-shallow-repository
true
```

A depth-1 clone cannot disprove historical existence. The check was therefore escalated to
the **GitHub API, which reads full history**:

```console
$ gh api "repos/ranimony-afk/nihingobridgeupgrade/commits?path=data/tatoeba&per_page=10" --jq 'length'
0        → 0 commits EVER touched data/tatoeba

$ gh api "repos/ranimony-afk/nihingobridgeupgrade/git/trees/HEAD?recursive=1" \
    --jq '[.tree[].path | select(test("tatoeba|\\.tsv$"))] | length'
0        → no tatoeba/ or .tsv path anywhere in the full tree
```

Local corroboration:

```console
$ git log --all --oneline -- data/tatoeba
(NO COMMITS EVER TOUCHED data/tatoeba)
$ git log --all --oneline -- '*.tsv'
(NO .tsv EVER COMMITTED)
$ git stash list
(empty)
$ git branch -a
* arena/01a0d136-nihingobridgeupgrade
  main
  remotes/origin/HEAD -> origin/main
  remotes/origin/main
```

**Adjudication of the 10 historical `data/` commits.** A query for `path=data` returns 10
commits, but inspection shows they are unrelated scaffold add/remove operations
(`.dockerignore`, `.env.example`, `.github/workflows/*`, `Dockerfile`, `README.md`) with
cryptographic-reset style messages (`del b16`, `b15`, `B5`). **None contains a sentence
artifact.** The dedicated `path=data/tatoeba` query returns 0.

A separate sweep of **all** remote branches and **all 9 PRs (every state)** found zero
Tatoeba/14.5 artifacts:

```console
$ for b in $(git branch -r | grep -v HEAD); do echo "$b -> $(git ls-tree -r --name-only $b | grep -ciE 'tatoeba|14\.5')"; done
origin/main -> 0

$ gh search prs --repo ranimony-afk/nihingobridgeupgrade "tatoeba"
[]
```

**Conclusion for §2B: the artifact never existed in this repository's history.** It cannot
be recovered from a branch, tag, stash, or commit.

---

## 2C. Provenance Registry — EXISTS, REUSABLE, NOT DUPLICATED

`upstream:tatoeba:2024-07` **is already registered** (`src/services/knowledge/provenance/registry.ts:125`):

```ts
"upstream:tatoeba:2024-07": {
  id: "upstream:tatoeba:2024-07",
  type: "upstream",
  name: "Tatoeba Multilingual Example Sentences",
  version: "2024-07",
  releaseDate: "2024-07-01",
  uri: "https://tatoeba.org",
  license: "CC-BY-2.0-FR",
  attribution: "Tatoeba Project (tatoeba.org) contributors under Creative Commons BY 2.0 FR",
  domain: "sentence",
  status: "active",
  targetTables: ["example_sentences"],
},
```

Plus an alias (`registry.ts:287`): `"tatoeba:corpus:2024-07" → "upstream:tatoeba:2024-07"`.

**§4 compliance**: this registration was **retained, not duplicated, and not deleted**.
Per §4, "If it is valid and reusable, retain it." It is. Per §2C, "Do not duplicate it if
it already exists." It was not duplicated.

Important distinction for §3: the registry entry establishes a **source identity and licence**.
It does **not** evidence that any artifact was acquired. §3 requires source identity to be
*verified against a real artifact*; with no artifact, the `version: "2024-07"` and
`releaseDate: "2024-07-01"` fields remain **assertions** that cannot currently be
independently confirmed. Per §4, correcting them "only with explicit evidence" is therefore
not possible — and per §3, "Never invent the version," no correction was made.

---

## 2D. Approved Upstream Acquisition — BLOCKED

### Official endpoints (unreachable)

```console
$ curl -sS -o /dev/null -w "HTTP %{http_code}" https://downloads.tatoeba.org/exports/                        → HTTP 000
$ curl -sS -o /dev/null -w "HTTP %{http_code}" https://downloads.tatoeba.org/exports/per_language/jpn/       → HTTP 000
$ curl -sS -o /dev/null -w "HTTP %{http_code}" https://tatoeba.org/en/downloads                              → HTTP 000
```

All three return `000` (`OpenSSL SSL_connect: SSL_ERROR_SYSCALL`). The sandbox enforces a
strict egress allowlist:

| Host | Result |
| :--- | :--- |
| `github.com`, `api.github.com`, `codeload.github.com` | **ALLOWED** |
| `registry.npmjs.org`, `pypi.org` | **ALLOWED** |
| `downloads.tatoeba.org`, `www.tatoeba.org`, `tatoeba.org` | **BLOCKED** |
| `example.com` (control) | **BLOCKED** |

Per §2D — "Do not bypass network restrictions" — no alternative route was attempted.

### "Approved repository-hosted artifact" — DETERMINED NOT TO EXIST

§0 instructs: "If network access is unavailable, determine whether an approved
repository-hosted artifact is available." This was investigated. **The answer is no.**

The official Tatoeba GitHub organisation exists (`github.com/Tatoeba`, 20 public repos) and
**is reachable**:

```
tatoeba2      — the collaborative dataset *platform* (server code)
tatoeba-api, tatodb, horus, imouto, nihongoparserd, tatomecab, …
tatoeba-ios, TatoebaViewer, Tatodetect, sinoparserd, yadict, …
```

Every one of these is **software**, not corpus data. No repository publishes a sentence
export:

```console
$ for r in tatoeba2 tatoeba-api tatodb horus; do gh api "repos/Tatoeba/$r/releases?per_page=5" --jq 'length'; done
0
0
0
0
```

Tatoeba sentence exports are distributed **only** via `downloads.tatoeba.org`, which is
blocked. There is therefore **no approved repository-hosted artifact** of the Tatoeba corpus.

### Explicitly rejected alternatives

Several theoretically-available routes were considered and **rejected**, with reasons:

| Route | Rejected because |
| :--- | :--- |
| GitHub mirror of Tatoeba data | §0: "Do not silently substitute a GitHub mirror for an official release." A mirror is not the official release and its release identity cannot be verified. |
| npm / PyPI package containing Tatoeba data (registries *are* reachable) | This would be **circumventing the tatoeba.org block** via an unapproved channel — §2D forbids bypassing network restrictions. Also not an official release. |
| Search engine / Internet retrieval of replacement data | §2D: only the official endpoint may be tested; no substitute acquisition. |
| Generate a synthetic corpus | §0: "Do not manufacture a replacement file"; "Do not create a synthetic corpus and call it Tatoeba." |
| Reuse the historical claimed 154/79/72 figures and `d2297821…038d0b` | §0: cannot be treated as authoritative unless the exact artifact "is physically available and hashes identically." It is not and cannot be. |

No substitution was performed, silently or otherwise.

---

## §3 Source Identity — NOT VERIFIABLE

§3 requires verifying release/version, publication date, exact filename, source URL,
license, attribution, format, compression status, extraction procedure, and SHA-256.

**None of these can be verified** without the artifact. The §3 example manifest structure
was **not created**, in any location, because §3 states "Never invent the version" and §16
states "No placeholder values in the final manifest."

`reports/gates/PHASE-14.5A-TATOEBA-ACQUISITION-MANIFEST.json` was **deliberately not
created**. A manifest with unmeasured fields would be fabrication; a manifest with measured
fields cannot exist. See `PHASE-14.5A-FINAL-GATE-REPORT.md` §5.

---

## §5 Tatoeba File Format Audit — BLOCKED

§5 requires inspecting the *actual acquired artifact* before designing assumptions
(delimiter, encoding, newline format, column count/order, ID format, language code field,
relationship representation, malformed records, duplicates).

With no artifact there is nothing to inspect, so **no format assumptions were encoded**.
This is the correct outcome: §5 explicitly warns, "Do not assume that the 14.5A historical
fixture structure is representative of the real Tatoeba corpus."

For the record, the only Tatoeba-shaped data in the repository is
`src/etl/sentence/pilotData.ts` — `TATOEBA_PILOT_FIXTURE`, **25 hardcoded records** with
hand-authored `reading`/`english`/`jlptLevel` fields. Under §9 ("DO NOT NORMALIZE
SENTENCES YET") and §21/§22 (no reading or JLPT fabrication), this fixture is **not
suitable as a substrate** and was not used. It also carries fabricated `reading` values
(katakana/kana transcriptions absent from Tatoeba) and `jlptLevel` assignments, both of
which §21/§22 prohibit.

---

## §0 Operating-Rules Compliance Record

| Rule | Status |
| :--- | :--- |
| Never fabricate records/counts/checksums/relationships/licenses/dates/provenance | **PASS** — nothing fabricated |
| Never claim a file exists unless its bytes are available | **PASS** — all claims are non-existence claims, evidenced |
| Never reuse the claimed 154/79/72/`d2297821…` unless physically available & hashing identically | **PASS** — not reused |
| Do not manufacture a replacement file | **PASS** |
| Do not create a synthetic corpus and call it Tatoeba | **PASS** |
| Do not silently substitute another release / a GitHub mirror | **PASS** — investigated, rejected, documented |
| Do not bypass network restrictions | **PASS** — no alternative channel attempted |
| Do not use production database credentials | **PASS** — none exist |
| Do not write to production PostgreSQL | **PASS** — 0 writes |
| Do not execute migrations | **PASS** — 0 migrations |
| Do not modify canonical dictionary/kanji records | **PASS** — 0 modifications |
| Do not alter existing canonical provenance | **PASS** — registry retained unchanged |
| Do not execute Phase 14.5B | **PASS** — not started |
| Do not produce GO without real evidence for every gate | **PASS** — NO-GO returned |
| BLOCKED/NO-GO is a valid preferred outcome | **Honored** |

---

## Artifact Audit Verdict

```
=============================================================================
§2 GATE: FAILED — ARTIFACT UNAVAILABLE
BLOCKED — PHASE 14.5A-R ARTIFACT UNAVAILABLE
=============================================================================

2A  Repository            ABSENT   (data/ does not exist; 0 tracked refs)
2B  Git history           NEVER EXISTED   (0 commits ever touched data/tatoeba — full-history API)
2C  Provenance registry   EXISTS   (upstream:tatoeba:2024-07; retained, not duplicated)
2D  Approved acquisition  BLOCKED  (official endpoints 000; no repo-hosted artifact exists)

No artifact invented. No synthetic corpus. No mirror substitution.
No network restriction bypassed. No parsing code written (§6 precondition unmet).
```

**HARD STOP.** Per §2, execution halts here. `src/etl/tatoeba/` was **not** created —
§6 authorizes implementation "only after the real artifact is available."
