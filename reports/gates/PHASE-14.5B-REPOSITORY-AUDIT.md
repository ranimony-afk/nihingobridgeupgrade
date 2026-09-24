# Phase 14.5B Gate Report: Repository Audit (Pre-Implementation)

**Gate**: Phase 14.5B — Tatoeba Sentence Normalization, Validation & Canonical Linkage Foundation
**Deliverable**: §5 First Task — Repository Audit (and §2 Critical Input Availability Gate)
**Date**: 2026-09-24
**Branch audited**: `arena/01a0d136-nihingobridgeupgrade` @ `318289da2e816fa3a77b7e061b793cf3f6d0a219`
**Mode**: CONTROLLED / READ-ONLY / NON-DESTRUCTIVE
**Production access**: 0
**Database writes**: 0
**Files created**: 1 (this report)
**Files modified**: 0

---

## Verdict

```
=============================================================================
PHASE 14.5B PRE-IMPLEMENTATION AUDIT: BLOCKED
=============================================================================
```

**Phase 14.5B cannot be executed as specified.** Its required input — the Phase 14.5A
acquisition artifact — **does not exist** in this repository, on any branch, or anywhere
in this sandbox. The claimed Phase 14.5A baseline is **not reproducible** here.

Per §1.1 ("fail closed") and §33 ("The phase may only receive GO if all are true"), the
audit **halts implementation** rather than fabricating a substitute input.

This is **not** a NO-GO on the architecture. It is a **NO-GO on executability**: the
design work can proceed once the input exists (see §10 Unblock Conditions).

---

## 0. §2 CRITICAL INPUT AVAILABILITY GATE — EXECUTED, FAILED

The gate mandated by §2 was executed before any normalization code was written or run.

| §2 step | Action | Result |
| :---: | :--- | :--- |
| 1 | Locate `data/tatoeba/sentences.tsv` | **NOT FOUND** — `data/` itself does not exist |
| 2 | Verify existence | **FAIL** — `ls: cannot access 'data/tatoeba/sentences.tsv'` |
| 3 | Compute SHA-256 | **NOT RUN** — `sha256sum` has no file to hash |
| 4 | Compare to `d2297821…038d0b` | **NOT REACHABLE** |
| 5 | Verify metadata / encoding | **NOT REACHABLE** |
| 6 | Verify against 14.5A provenance manifest | **NOT REACHABLE** — no 14.5A manifest exists |

Independent corroboration that the artifact is absent (not merely mis-pathed):

```console
$ find / -name "*.tsv" -not -path "*/node_modules/*" 2>/dev/null
(no results)

$ find / -ipath "*tatoeba*" -not -path "*/node_modules/*" 2>/dev/null
(no results)

$ git status --porcelain          # only this audit report is new
?? reports/gates/PHASE-14.5B-REPOSITORY-AUDIT.md

$ git stash list
(empty)

$ grep -rl "d22978218dfee13a46021ef700aff9a968081133ca4141c0eb7ad966ad038d0b" .  # excl. node_modules/.git
./reports/gates/PHASE-14.5B-REPOSITORY-AUDIT.md    ← this report only
```

The expected SHA appears **nowhere in the repository** except this report's own quotation
of it. No manual supply occurred during the session.

**Per §2 HARD SAFETY RULE, execution stopped immediately.** The following were expressly
**not** done: no re-download, no Tatoeba network access, no Internet search for replacement
data, no substitution of another release, no synthetic corpus generation, no claim of 14.5B
validation, no database modification, no production contact, no fabricated metrics.

### §2 Mandated Return Block

```text
BLOCKED — PHASE 14.5A ARTIFACT UNAVAILABLE

Required artifact:
data/tatoeba/sentences.tsv

Expected SHA-256:
d22978218dfee13a46021ef700aff9a968081133ca4141c0eb7ad966ad038d0b

No Phase 14.5B normalization or validation executed.
HARD STOP.
```

---

## 1. Scope & Method

Per §4 of the phase prompt, the following were inspected read-only:

`src/db/schema.ts`, `src/db/index.ts`, `src/services/dictionary/`, `src/services/knowledge/`,
`src/types/`, `scripts/`, `tests/`, `reports/gates/`, `docs/architecture/`, `data/tatoeba/`,
`package.json`, `drizzle.config.ts`, plus git history, remote refs, and all GitHub PRs.

No file was modified. No database connection was opened. No network call was made.

---

## 2. THE BLOCKING FINDING — Phase 14.5A does not exist

### 2.1 The required input artifact is absent

| Required by §2 | Claimed | Observed |
| :--- | :--- | :--- |
| Artifact path | `data/tatoeba/sentences.tsv` | **ABSENT** — `data/` directory does not exist at all |
| Artifact SHA-256 | `d22978218dfee13a46021ef700aff9a968081133ca4141c0eb7ad966ad038d0b` | **UNVERIFIABLE** — the string does not appear in any file in the repo |
| Acquisition digest | `1f5308f2286288adb5eadcb79afb69c176de1d5d029b820e0c21a66db29d3b09` | **UNVERIFIABLE** — the string does not appear in any file in the repo |

Evidence:

```console
$ ls data
ls: cannot access 'data': No such file or directory

$ find / -iname "*tatoeba*" -not -path "*/node_modules/*" 2>/dev/null
(no results)

$ grep -rl "d22978218dfee13a46021ef700aff9a968081133ca4141c0eb7ad966ad038d0b" .   # excluding node_modules/.git
(no results)

$ grep -rl "1f5308f2286288adb5eadcb79afb69c176de1d5d029b820e0c21a66db29d3b09" .
(no results)
```

`data/` is gitignored (`.gitignore`: `# Knowledge Corpus & ETL Downloads (Phase 14) → /data/`),
so the artifact was never committed. It is also **not present as an untracked working-tree
file**, and no `.tsv` file exists anywhere on the filesystem.

### 2.2 No Phase 14.5A implementation, report, or test exists

| 14.5A deliverable sought in §4 | Observed |
| :--- | :--- |
| Acquisition parser | **ABSENT** — no Tatoeba parser; no `data/tatoeba` path is referenced by any script or source file |
| Provenance / artifact manifest | **ABSENT** — no `*TATOEBA*ACQUISITION-MANIFEST.json` (cf. `PHASE-14.4B-KANJIDIC2-ACQUISITION-MANIFEST.json`, which does exist for KANJIDIC2) |
| Validation code / sentence representation | Only the pre-existing **Phase 4** `src/etl/sentence/*` (see §5) |
| Existing Tatoeba types | Only Phase 4 types (`TATOEBA_SOURCE_REF`, `RawSentenceSourceRecord`) |
| Existing gate report | **ABSENT** — `reports/gates/` contains no `PHASE-14.5*` file |
| Existing test fixture | Only `TATOEBA_PILOT_FIXTURE` — **25 hardcoded records**, not the claimed 154 raw / 79 Japanese |
| Existing digest algorithm | **ABSENT** |

```console
$ git ls-tree -r --name-only origin/main | grep -ciE "tatoeba|14\.5"
0
```

### 2.3 The claimed branch does not contain 14.5A work

The prompt names the current branch as `arena/01a0cd33-nihingobridgeupgrade`.

```console
$ gh pr view 9 --json title,state,mergedAt,headRefName
{"title":"feat(knowledge): Phase 14.4E — Comprehensive Kanji Lexical & Structural Knowledge Graph",
 "state":"MERGED","mergedAt":"2026-09-23T13:12:51Z",
 "headRefName":"arena/01a0cd33-nihingobridgeupgrade"}
```

That branch is the **already-merged Phase 14.4E (Kanji Lexical Graph)** branch — not a 14.5A
branch. It contains **0** Tatoeba/14.5 files. The sandbox's working branch is
`arena/01a0d136-nihingobridgeupgrade`, branched from the merge commit of that PR, which is
correct per session policy.

A full sweep of **all** remote branches and **all 9 PRs (every state)** found **zero**
Tatoeba-acquisition or 14.5-phase artifacts:

```console
$ for b in $(git branch -r | grep -v HEAD); do echo "$b -> $(git ls-tree -r --name-only $b | grep -ciE 'tatoeba|14\.5')"; done
origin/main -> 0

$ gh pr list --state all --limit 50   # 9 PRs, all MERGED, phases 13.x–14.4E
$ gh search prs --repo ranimony-afk/nihingobridgeupgrade "tatoeba"
[]
```

### 2.4 The repository's own roadmap contradicts the premise

The in-repo roadmap places this work **in the future**, not in the past:

| Source | Statement |
| :--- | :--- |
| `reports/gates/PHASE-14.0-KNOWLEDGE-DATA-ARCHITECTURE-RECON.md:295` | `14.5 \| Example Sentence Pipeline \| 14.4 PASS \| Ingest Tatoeba sentences with reading generation and entity matching` — i.e. **not yet executed** |
| `reports/gates/PHASE-14.4A-TAKOBOTO-DICTIONARY-ARCHITECTURE.md:106` | "Tatoeba example sentence ingestion (Phase 14.6)" listed under §5 as **intentionally blocked** |

---

## 3. Environment & Baseline Verification

### 3.1 No authorized local database exists

§1.1 permits exactly one database target: `127.0.0.1:5432`, database `app_db`.

```console
$ ss -ltnp
LISTEN 0 4096 0.0.0.0:111    0.0.0.0:*
LISTEN 0 4096 *:49983        *:*
LISTEN 0 4096 *:22           *:*
   → nothing listening on 5432

$ which psql pg_ctl postgres
(no results)
```

There is **no local PostgreSQL instance**, no `DATABASE_URL`, and no seeded `app_db`.
Consequently the canonical corpus that §13 ("Use the existing canonical dictionary"),
§16, and §17 require linking against — `dictionary_entries`, `kanji_entries`,
`kanji_radicals`, `kanji_composition` — **is not reachable in this environment**.

The canonical corpus is likewise not reconstructible here: it derives from
`data/JMdict.xml`, `data/kanjidic2.xml`, and `data/kanjivg/` (per `scripts/` and
`reports/gates/*-ACQUISITION-MANIFEST.json`), and **none of those artifacts exist on disk**.
Only 4 Drizzle migrations exist (`drizzle/0000`–`0003`); they create schema, not corpus rows.

### 3.2 The claimed 14.5A regression baseline is not reproducible

§2 claims, for the 14.5A baseline:

```
Full regression: 40 / 40 test files
Tests:           774 / 774
```

Measured on a clean checkout of this branch (`npm ci`, then
`npx vitest run --fileParallelism=false`):

```
Test Files  18 failed | 20 passed (38)
Tests       62 failed | 551 passed | 102 skipped (715)
Duration    23.10s
```

That is **not** 40/40 files and **not** 774/774 tests. Failure causes are environmental,
not code defects:

| Cause | Occurrences | Detail |
| :--- | :--- | :--- |
| `Error: DATABASE_URL is required` | 39 | Canonical DB-backed assertions cannot run |
| `connect ECONNREFUSED 127.0.0.1:5432` | 1 | No local PostgreSQL (`tests/dry-run-jmdict.test.ts` preflight) |
| `ENOENT .../data/kanjidic2.xml`, `/data/kanjivg` | 2 (+2) | Missing ETL source artifacts |
| `[SOURCE_VERIFIED] STOP — SOURCE FILE MISSING` | 1 | Missing ETL source artifacts |

Notably, **`tests/kanji-lexical-graph.test.ts` — Phase 14.4E's own suite, merged as the
current HEAD — is 18/24 failing** without a database. This confirms the red baseline is
pre-existing and unrelated to 14.5B.

### 3.3 Toolchain baseline (these genuinely pass)

```console
$ npm run typecheck       → PASS (0 errors)
$ npm run lint            → PASS (0 errors, 4 warnings — the documented legacy react-hooks warnings)
$ npx drizzle-kit check   → PASS ("Everything's fine 🐶🔥")
$ npm run build           → PASS (compiled successfully)
```

The toolchain is healthy. Only the database- and artifact-dependent tests are red.

---

## 4. WHAT EXISTS

Verified present and relevant to 14.5B:

| Artifact | Location | Notes |
| :--- | :--- | :--- |
| Tatoeba provenance registration | `src/services/knowledge/provenance/registry.ts:125` | `upstream:tatoeba:2024-07`, license `CC-BY-2.0-FR`, `releaseDate: 2024-07-01`, `domain: "sentence"`, `targetTables: ["example_sentences"]`, `status: "active"` |
| Source-ID alias table | `registry.ts:287` | `"tatoeba:corpus:2024-07" → "upstream:tatoeba:2024-07"` |
| Phase 4 sentence ETL | `src/etl/sentence/{types,loader,transformer,matcher,pipeline,index}.ts` | 25-record hardcoded pilot fixture; parser/loader/matcher/pipeline |
| Canonical sentence table | `src/db/schema.ts:750` `example_sentences` | `japanese`, `reading`, `english`, `jlpt_level` all `NOT NULL` |
| Knowledge source registry table | `src/db/schema.ts:691` `knowledge_sources` | Carries `license`, `version`, `recordCount` |
| Canonical dictionary table | `src/db/schema.ts:707` `dictionary_entries` | `headword`, `reading`, `romaji`, `jlpt_level`, `frequency_rank`, `kanji_characters`, `senses`, `source_ref` |
| Canonical kanji tables | `src/db/schema.ts:529/549/569` | `kanji_radicals`, `kanji_entries`, `kanji_composition` |
| Dictionary service | `src/services/dictionary/dictionaryService.ts` | `searchEntries`, `autocomplete`, `getEntryDetail` |
| Kanji lexical graph service | `src/services/knowledge/kanjiLexicalGraphService.ts` | `getKanjiVocabulary`, `getVocabularyKanji`, `getKanjiCompounds`, `getReadingVocabulary`, `getJLPTVocabularyForKanji`, `getKanjiMindTree`, `getKeigoRelations` |
| Kanji/reading/visual services | `kanjiReadingService.ts`, `kanjiVisualService.ts` | Phase 14.4B–E graph layer |
| Kanji extraction primitives | `kanjiLexicalGraphService.ts:37,64,113` | `KANJI_REGEX`, `extractKanjiCharacters`, `katakanaToHiragana` |
| Drizzle migrations | `drizzle/0000`–`0003` | Schema only |

---

## 5. WHAT CAN BE REUSED

Directly reusable **without modification** when the phase is unblocked:

1. **Provenance registration** — `upstream:tatoeba:2024-07` already exists with the exact
   license string required by §20/§21 (`CC-BY-2.0-FR`) and a compliant attribution string.
   §20's provenance model can bind to it rather than introducing a new source identity.
2. **Source-ID reconciliation** — the Phase 4 ETL's `tatoeba:corpus:2024-07` is an
   **alias** that the registry already resolves to `upstream:tatoeba:2024-07`. This is a
   reconciliation point to honor, not a conflict to fix.
3. **Kanji extraction primitives** — `extractKanjiCharacters` / `KANJI_REGEX` satisfy §12's
   character-occurrence index; the regex covers CJK Unified Ideographs, Extension A, and
   the Compatibility Ideographs block.
4. **Canonical graph services** — the reverse traversals demanded by §16 (`Kanji → Sentence
   → Dictionary Entry → Reading`) and the JLPT inheritance of §17 have existing, tested
   backing: `getVocabularyKanji`, `getReadingVocabulary`, `getJLPTVocabularyForKanji`.
5. **Report + manifest conventions** — the `*-ACQUISITION-MANIFEST.json` shape
   (`source`, `version`, `license`, `SHA256`, `size`, `entryCount`, `acquiredAt`, `status`)
   is an established, reusable determinism/attribution pattern.

---

## 6. WHAT IS MISSING

Everything that Phase 14.5B consumes or produces:

| # | Missing item | Blocks |
| :--- | :--- | :--- |
| 1 | `data/tatoeba/sentences.tsv` (154 raw / 79 Japanese records) | **Entire phase** — the object of normalization |
| 2 | 14.5A artifact SHA verification | §20 provenance, §33 source invariant |
| 3 | 14.5A parser / validator / digest algorithm | §7 pipeline, §23 two-pass determinism |
| 4 | 14.5A gate report | Audit trail, §32 report chain |
| 5 | Local `app_db` with canonical corpus | §13 dictionary linkage, §16 kanji traversal, §17 JLPT |
| 6 | `data/JMdict.xml`, `data/kanjidic2.xml`, `data/kanjivg/` | Seeding the canonical corpus (206k dictionary entries) |
| 7 | Tatoeba-normalization/linkage code, tests, docs | §29, §31 |

**Note on canonical counts (resolved)**: the prompt cites `dictionary_entries: 206,747`,
while `tests/dictionary-architecture.test.ts` asserts **206,717**. Both are correct and
measure different things:

```
dictionary_entries total              206,747   ← §20/§33 target, and what the prompt cites
  upstream:jmdict:2023-08             206,717   ← what tests/dictionary-architecture.test.ts:48 asserts
  first-party:dictionary-core:v1           30
  test pilot entries                        2
```

Corrected against `reports/gates/PHASE-14.4E-FINAL-GATE-REPORT.md:7` and
`PHASE-14.4C-PREINGESTION-AUDIT.md:22`. No discrepancy remains; canonical invariant checks
should target the **206,747** table total.

---

## 7. WHAT WILL BE CREATED (when unblocked)

No code, schema, test, or document beyond this audit was created. No duplicate models were
introduced. When the input exists, the intended — and still safely unspecified — surface is:

- `src/etl/tatoeba/` (or an extension of `src/etl/sentence/`) — normalize / validate /
  dedupe / link, per §7–§18
- `scripts/normalize-tatoeba.ts`, `scripts/link-tatoeba-dictionary.ts` — per §22
- `tests/tatoeba-normalization-linkage.test.ts` — 37+ cases per §29
- `docs/architecture/TATOEBA-NORMALIZATION.md`, `TATOEBA-DICTIONARY-LINKAGE.md` — per §31
- Remaining §32 gate reports

**Schema decision (§6) is deliberately NOT made in this audit.** §6 requires an explicit
architecture decision with documented justification, which cannot honestly be reached
without inspecting the actual 14.5A model. Prudence also favors a **runtime projection
(Option A)** as the default starting hypothesis, but that must be *validated*, not assumed.

---

## 8. WHAT MUST NOT BE CHANGED

| Protected | Reason |
| :--- | :--- |
| `data/tatoeba/sentences.tsv` + its SHA | §2, §33 source invariant |
| `dictionary_entries`, `kanji_entries`, `kanji_radicals`, `kanji_composition` | §5, §33 canonical invariant |
| `dictionary_entries.headword/reading/romaji/jlpt_level/kanji_characters` | §5 — JMdict/KANJIDIC2 remain canonical; Tatoeba is not a metadata source |
| Phase 14.4F API contracts, `src/types/mobileDictionary.ts` | §3, §34 |
| `upstream:tatoeba:2024-07` license/attribution fields | §21 attribution invariant |

---

## 9. Secondary Architectural Findings

Recorded now because they materially shape 14.5B when it is unblocked.

### 9.1 The canonical sentence table cannot hold Tatoeba records as-is

`example_sentences` (schema.ts:750) declares:

```
japanese     NOT NULL
reading      NOT NULL   ← Tatoeba provides no full-sentence reading
english      NOT NULL   ← Tatoeba has untranslated sentences (§11: 5 untranslated of 79)
jlpt_level   NOT NULL   ← §17: sentences must not carry an authoritative JLPT level
```

The Phase 4 transformer masks this by defaulting `reading = japanese` and pushing
`jlptLevel` into `tags` (`transformer.ts`: `const reading = cleanText(raw.reading) || japanese`).
That is a **lossy identity substitution**: `reading` silently becomes the kanji text, which
is not a reading, and it directly conflicts with §17's "never label a sentence itself as
N3". Any 14.5B persistence design must resolve this explicitly rather than inherit it.

### 9.2 The existing matcher does not satisfy §13

`SentenceMatcher.matchDictionaryEntries` (`matcher.ts`) performs a full scan of all
cached headwords using `japanese.includes(v.headword)`:

- **No positions** — §12/§13 require exact 0-based occurrence positions.
- **Not longest-match-first** — §13 requires deterministic longest-match.
- **O(n·m) substring scan** — the exact `O(sentences × dictionary_entries)` pattern §27
  forbids; with ~206k entries this is unsuitable.
- **Silent failure mode** — on DB error the pipeline swallows the exception and continues
  with an empty cache (`pipeline.ts`), yielding `dictionaryEntryIds: []` that is
  indistinguishable from "no vocabulary present".

All four must be replaced, not extended.

### 9.3 Offset unit must be decided before any position is exposed

§12 requires a single documented unit. The codebase mixes native JS string indices
(UTF-16 code units) with `KANJI_REGEX`-based extraction. All Tatoeba Japanese text here is
BMP (kanji, kana, full-width punctuation), so UTF-16 offsets coincide with code points —
but that equivalence must be **documented and enforced**, not assumed.

---

## 10. Unblock Conditions

Phase 14.5B can begin only when **all** of the following hold:

1. **The 14.5A artifact is supplied** at `data/tatoeba/sentences.tsv`, and
   `sha256sum` returns exactly
   `d22978218dfee13a46021ef700aff9a968081133ca4141c0eb7ad966ad038d0b`.
2. **The 14.5A provenance model is supplied** (manifest/parser/digest algorithm), so §4's
   "do not create duplicate models" can be honored — or the user explicitly authorizes
   14.5B to *define* the normalization-layer models from scratch.
3. **A local `app_db` is provisioned** at `127.0.0.1:5432` with the canonical corpus
   seeded (`dictionary_entries`, `kanji_entries`, `kanji_radicals`, `kanji_composition`),
   so §13/§16/§17 linkage and the §33 canonical invariant are actually verifiable. This
   requires the corresponding `data/` ETL artifacts.
4. ~~The 206,747 vs 206,717 count discrepancy is resolved.~~ **Resolved** — see §6 note;
   the values measure the table total vs. the JMdict subset respectively.

If (1) and (2) cannot be supplied, the only compliant alternative is an explicit user
authorization to **re-run Phase 14.5A acquisition first** — which this phase is forbidden
to do on its own initiative (§2, §34) and which would additionally require authorizing a
network download (§28).

---

## 11. Gate Checklist

| Requirement | Result |
| :--- | :--- |
| Read-only audit performed per §4 | **PASS** |
| Repository inspected | **PASS** |
| Database inspected | **N/A** — no authorized DB exists |
| 14.5A artifact located & SHA-verified | **FAIL** — artifact absent |
| 14.5A provenance model located | **FAIL** — absent |
| Canonical corpus available for linkage | **FAIL** — DB and ETL artifacts absent |
| Claimed 14.5A regression baseline reproduced | **FAIL** — 18 files/62 tests failing vs claimed 0/0 |
| Production access | **0** (PASS) |
| Database writes | **0** (PASS) |
| Canonical mutations | **0** (PASS) |
| Schema migrations | **0** (PASS) |
| Files modified | **0** (PASS) |
| Typecheck / Lint / Drizzle / Build | **PASS** |

---

## 12. Final Verdict

Per §30's verdict rule, a GO requires **every** acceptance criterion of §27 to pass. The
first acceptance criterion — "Phase 14.5A artifact exists / SHA matches exactly" — **fails**,
and §28 lists "artifact missing" as an immediate stop condition that must never be
downgraded to a warning.

```
=============================================================================
NO-GO — PHASE 14.5B NOT VERIFIED
=============================================================================
```

Phase 14.5B is a **normalization and linkage** phase over an input that does not exist. Its
central invariants — "14.5A artifact unchanged", "100% of normalized records traceable to
Tatoeba source", "dictionary_entries unchanged" — are **unverifiable** in this environment.

Executing anyway would require inventing the input, and any resulting "PASS 1 == PASS 2"
digest would be a claim about fabricated data, not about the Tatoeba corpus. That is
precisely the false-green outcome §2, §19, §27, and §28 exist to prevent.

**Implementation stopped. No Phase 14.5A re-acquisition performed. No Tatoeba data
downloaded, generated, or substituted. No code, test, schema, or migration created.
Phase 14.5C not started.**

**HARD STOP — awaiting user direction (see §10).**
