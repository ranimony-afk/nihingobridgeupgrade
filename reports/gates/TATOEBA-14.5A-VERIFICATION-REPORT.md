# Tatoeba 14.5A — Gate Zero Reconciliation & Artifact Verification Report

**Gate**: Gate 0 (Repository Reconciliation) + Gate 1 (Tatoeba 14.5A Artifact Verification)
**Date**: 2026-09-24
**Session branch**: `arena/01a0d21c-nihingobridgeupgrade`
**Base commit**: `cfe565d58ec4f6902c9f00bba491827ab303a53d`
**Mode**: Read-only throughout — no implementation change, no schema change, no migration, no database access, no production contact
**Method**: Evidence gathered independently from the repository, its Git object store, the authoritative GitHub API, the GitHub LFS API, and direct network probes. No prior report was trusted as evidence.

---

## §1. Verdict

```text
GATE 0  — REPOSITORY RECONCILIATION:  PASS (with findings)

GATE 1  — TATOEBA 14.5A ARTIFACT VERIFICATION:  BLOCKED — ARTIFACT BYTES UNRETRIEVABLE

PHASE 14.5A STATUS:  BLOCKED
PHASE 14.5B:         NOT AUTHORIZED
PHASE 14.5C:         NOT AUTHORIZED
PHASE 14.5D:         NOT AUTHORIZED
```

**Why this is not PASS.** The five archives *are* declared in the repository and *do* exist in
GitHub's LFS store at the declared OIDs and byte sizes. But they are **not retrievable in this
environment**: every `*.githubusercontent.com` host — the sole media host the LFS API issues
for object downloads — is blocked by the sandbox egress policy. All five working-tree paths
contain **Git LFS pointer files**, not corpus bytes. Therefore:

- no archive can be opened, hashed from its own bytes, or inspected;
- the archive SHA-256 values **cannot be independently reproduced**;
- no record, count, relationship, or digest can be measured;
- the §5 data-quality gate cannot be executed;
- §6 manifest generation is refused, because §4/§6 forbid placeholder or unmeasured fields.

**Why this is not simply "no artifact".** This is a materially different state from the earlier
R/R2/R3 `BLOCKED` findings. A genuine, content-addressed artifact identity now exists upstream
with host-attested size. The blocker has moved from *"no artifact is declared anywhere"* to
*"the declared artifact's bytes are firewalled from this sandbox."* That distinction determines
the next gate, and is recorded precisely in §4.

---

## §2. Gate Zero — Reconciliation (items A–L)

| # | Question | Finding | Basis |
| :-- | :--- | :--- | :--- |
| **A** | Current main SHA | `cfe565d58ec4f6902c9f00bba491827ab303a53d` | `git rev-parse origin/main` + GitHub API |
| **B** | Current local SHA | `cfe565d58ec4f6902c9f00bba491827ab303a53d` — identical | `git rev-parse HEAD` |
| **C** | Working tree clean | **YES** — 0 modified, 0 untracked | `git status --porcelain=v1 -uall` → empty |
| **D** | Local main == origin/main | **YES** — 0 ahead / 0 behind | `git rev-list --left-right --count main...origin/main` → `0 0` |
| **E** | Git LFS objects available | **NO, two independent reasons** (see §3.2) | `git lfs` absent; `.git/lfs` absent; media host blocked |
| **F** | Five archives exist locally | **NO — only pointer files exist** | 132–134-byte text files (§3.1) |
| **G** | Exact byte sizes | Pointers: 132/134/133/134/132 B. **Declared archive sizes: 2,862,055 / 149,766,093 / 63,742,494 / 302,949,563 / 4,875,551 B** — none present on disk | `stat` + pointer `size` field |
| **H** | SHA-256 values | **Not computable for archives.** Pointer-OID values recovered (§3.1); pointer-file hashes computed | `sha256sum` on pointers only |
| **I** | Match previously recorded values | **MATCH — but only because the recorded values *are* the LFS OIDs**, not independently measured digests (§3.3) | String comparison, 5/5 |
| **J** | Does PR #10 contain anything main lacks? | **NO — nothing.** `main...ab452b3da` → `ahead_by=0` | GitHub compare API |
| **K** | PR #10 overlap with Tatoeba files | **NONE** — 48 files, 0 of them `data/tatoeba/*`, `.gitattributes`, or `.gitignore` | PR files API |
| **L** | Should PR #10 remain separate? | **Question is moot — PR #10 is already MERGED.** No separate handling exists or is needed | `gh api pulls/10` → `merged=true` |

### 2.1 Findings that contradict the session brief

Three premises in the session brief do not match the current repository. They are recorded
rather than silently worked around.

| Briefed premise | Actual state |
| :--- | :--- |
| *"PR #10 — OPEN, MERGEABLE, 12 ahead, 3 behind, CI failing"* | **MERGEABLE and CI-failing were accurate; OPEN was not.** PR #10 is `closed`, `merged=true`, `merged_at=2026-09-24T06:27:06Z`, `merge_commit=cfe565d58` — which **is** the current main tip. Measured `ahead_by=0 / behind_by=4`. |
| *"Do NOT automatically merge PR #10 — first determine exactly what it contains"* | The merge already happened before this session began. There is no pending merge decision. All 48 files are in main. |
| *"The commit `40c3ecf` is at HEAD"* | `40c3ecf` is real — `data: add verified Tatoeba export archives via LFS` — but it is the **first parent of the current tip**, not HEAD. HEAD is the PR #10 merge commit. |

### 2.2 PR #10 change classification

Since PR #10 is fully merged and its branch head contains nothing main lacks, every change is
already landed. Classification below is by *review disposition*, for the record — not as a
merge recommendation.

| Class | Count | Items |
| :--- | --: | :--- |
| **MERGE** (already landed, no action) | 46 | 14 `docs/architecture/*`, 15 `reports/gates/*`, 5 API routes, `src/lib/api/routeParams.ts`, 3 `src/services/dataquality/*`, 4 `src/services/sentence/*`, `src/types/grammar.ts`, `src/types/sentenceSource.ts`, 4 test files |
| **REVIEW** | 2 | `src/services/sentence/lexicalMatcher.ts` + `src/services/sentence/offsetContract.ts` — trie matcher and code-point offset contract; the documented replacement for the O(N×M) `src/etl/sentence/matcher.ts`. **Correct direction, but it consumes a corpus that does not yet exist.** It cannot be exercised against real data until Gate 1 clears. |
| **KEEP** / **SUPERSEDE** / **DUPLICATE** / **DROP** | 0 | Nothing to keep separate, supersede, duplicate, or drop. |

**No change to PR #10 was made, and none is proposed.** It is merged; re-opening it is not a
live engineering option.

### 2.3 Repository hygiene finding

`01a0cd33-6580-7b64-a540-a08f871a01b5.patch` (1,181,085 bytes) is **tracked at the repository
root**. It was introduced by commit `eb0ceed47` (*"dfs"*, 2026-09-24) — a directly-pushed
commit on main, **not** part of PR #10. It is a bare forensic artifact with a message that
describes nothing. Recorded only; **not removed, renamed, or modified** (rule 4, rule 21).

---

## §3. Tatoeba Artifacts — Actual State

### 3.1 What is on disk

| Path | Bytes on disk | Content |
| :--- | --: | :--- |
| `data/tatoeba/jpn_indices.tar.bz2` | 132 | LFS pointer text |
| `data/tatoeba/links.tar.bz2` | 134 | LFS pointer text |
| `data/tatoeba/sentences_base.tar.bz2` | 133 | LFS pointer text |
| `data/tatoeba/sentences_detailed.tar.bz2` | 134 | LFS pointer text |
| `data/tatoeba/tags.tar.bz2` | 132 | LFS pointer text |

Each file is a 3-line spec-v1 pointer:

```
version https://git-lfs.github.com/spec/v1
oid sha256:<64 hex>
size <declared byte size>
```

LFS filter configuration is active and correct: `git check-attr -a data/tatoeba/links.tar.bz2`
→ `filter: lfs`, `diff: lfs`, `merge: lfs`, `text: unset`. `git ls-files -s` shows the five
pointers as ordinary blobs at stage 0; **no smudge has ever occurred in this checkout.**

### 3.2 Why the archive bytes are unavailable

Two independent blockers, each sufficient on its own:

| Blocker | Evidence |
| :--- | :--- |
| **1. No LFS client / no local object cache** | `git lfs version` → `git: 'lfs' is not a git command`. `.git/lfs` → *No such file or directory*. `find .git -name "*lfs*"` → empty. The clone was fetched without LFS smudge. |
| **2. The LFS media host is firewalled** | The batch API is reachable and returns a download action on `github-cloud.githubusercontent.com`. Every fetch fails: `curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to github-cloud.githubusercontent.com:443`. |

Egress probe results:

| Host | Result |
| :--- | :--- |
| `github.com` | **200** |
| `api.github.com` | **200** |
| `codeload.github.com` | **301** |
| `github-cloud.githubusercontent.com` | **000** — `SSL_ERROR_SYSCALL` |
| `media.githubusercontent.com` | **000** |
| `objects.githubusercontent.com` | **000** |
| `release-assets.githubusercontent.com` | **000** (302 issued, target unreachable) |
| `downloads.tatoeba.org` | **000** |

GitHub's release-asset path confirms the pattern is host-based, not path-based: a
`github.com/.../releases/download/...` request returns **302** and then dies at
`release-assets.githubusercontent.com`. All `*.githubusercontent.com` hosts are filtered.

**Consequence: installing `git-lfs` would not help.** `npm`/`pip` are reachable, so the client
itself could be installed — but it would download through the same blocked media host. This was
deliberately **not** attempted, to avoid pulling a binary solely to reach a walled endpoint.

**No workaround was used.** No mirror, proxy, alternative host, codeload archive (which would
contain pointers, not content), or package-registry side channel was tried. Per rule 11 and
rule 14, a pointer — or a client that would fetch content — is not the artifact.

### 3.3 The recorded SHA-256 values are not independent evidence

All five SHA-256 values supplied in the session brief are **byte-identical to the LFS pointer
OIDs**, case-insensitively:

| Artifact | Briefed SHA-256 | Pointer OID | Equal? |
| :--- | :--- | :--- | :-: |
| `jpn_indices.tar.bz2` | `AA292244…C7F2389F` | `aa292244…c7f2389f` | ✔ |
| `links.tar.bz2` | `19CBF4CF…818CB70BF` | `19cbf4cf…818cb70bf` | ✔ |
| `sentences_base.tar.bz2` | `FA38BABE…E1C188D879` | `fa38babe…e1c188d879` | ✔ |
| `sentences_detailed.tar.bz2` | `3F7CFB1E…0E31B304C` | `3f7cfb1e…0e31b304c` | ✔ |
| `tags.tar.bz2` | `77D4C656…CED12DEA5` | `77d4c656…ced12dea5` | ✔ |

They are the values **declared by the committing process**. They were **not** produced by
hashing artifact bytes in this environment, and this report does not treat the match as
verification. The digest of the pointer files themselves — a different quantity — was measured:

| Pointer file | Its own SHA-256 |
| :--- | :--- |
| `jpn_indices.tar.bz2` | `49da2702c4dac45a697497824cbf07e91187b315c759f75cf66ca5bd41e30382` |
| `links.tar.bz2` | `032f35f6a9f5ddac0e543a01210e60314a659e9bf06918cd9fc2a2f5aae05658` |
| `sentences_base.tar.bz2` | `f9333ce8e53ea790888581ce512b919ddaea773b85e8a6f3ade3080bba22295b` |
| `sentences_detailed.tar.bz2` | `3d4486335c73e3092082f4ba94c654abf3f6146294ef9f04bf23ab57b442ba4b` |
| `tags.tar.bz2` | `eb0c52b65cd2641ad0b97ca2c44f6abfd1171759e2929c22219c34494bcebd17` |

### 3.4 Host-attested declaration (not a measurement)

The GitHub LFS batch API is reachable from this sandbox and confirms each object exists in the
repository's LFS store at the declared OID and declared size:

| OID (prefix) | Declared size | LFS download action | Reported error |
| :--- | --: | :--- | :--- |
| `aa292244fd984b3b` | 2,862,055 | issued | none |
| `19cbf4cf18d9130e` | 149,766,093 | issued | none |
| `fa38babeecaf43d3` | 63,742,494 | issued | none |
| `3f7cfb1ebe413cbd` | 302,949,563 | issued | none |
| `77d4c65620b71410` | 4,875,551 | issued | none |

**This is an existence-and-size attestation by the hosting service. It is not a content
verification.** Because LFS OIDs are content-addressed, a successful server-side match is
*corroborating but not reproducing* evidence: it does not substitute for hashing bytes this
environment cannot read. `SHA_STATUS = NOT_MEASURED` stands.

### 3.5 Artifact table (§40 format)

| Artifact | Exists | LFS | Bytes | SHA256 | Archive Valid | Expected Structure |
| :--- | :--- | :--- | --: | :--- | :--- | :--- |
| `jpn_indices.tar.bz2` | Pointer only | yes (pointer) | 2,862,055 (declared) / 132 (on disk) | OID declared; **not measured** | **NOT TESTABLE** — bytes unretrievable | **UNVERIFIED** — must not be assumed |
| `links.tar.bz2` | Pointer only | yes (pointer) | 149,766,093 (declared) / 134 (on disk) | OID declared; **not measured** | **NOT TESTABLE** | **UNVERIFIED** |
| `sentences_base.tar.bz2` | Pointer only | yes (pointer) | 63,742,494 (declared) / 133 (on disk) | OID declared; **not measured** | **NOT TESTABLE** | **UNVERIFIED** |
| `sentences_detailed.tar.bz2` | Pointer only | yes (pointer) | 302,949,563 (declared) / 134 (on disk) | OID declared; **not measured** | **NOT TESTABLE** | **UNVERIFIED** |
| `tags.tar.bz2` | Pointer only | yes (pointer) | 4,875,551 (declared) / 132 (on disk) | OID declared; **not measured** | **NOT TESTABLE** | **UNVERIFIED** |

Total declared payload ≈ **524.2 MB**. Estimated decompressed footprint: multiple GB.

**No archive was opened, so no column set, delimiter, member name, encoding, or language
coding is asserted anywhere in this report.** `sentences_base` and `sentences_detailed` are
*different exports* of the same conceptual data and must not be assumed to be interchangeable;
`jpn_indices` must not be assumed to match any documented schema (§14.5A.2).

---

## §4. Tatoeba Measurements (§40 — actual measured values only)

```text
MEASUREMENT STATUS: NOT EXECUTED — INPUT ARTIFACT UNREADABLE
```

| metric | measured_value | method | source_archive | validation_status |
| :--- | :--- | :--- | :--- | :--- |
| total sentence records | **NOT MEASURED** | blocked — bytes unretrievable | `sentences_base` / `sentences_detailed` | BLOCKED |
| Japanese sentence records | **NOT MEASURED** | blocked | `sentences_base` / `sentences_detailed` | BLOCKED |
| non-Japanese sentence records | **NOT MEASURED** | blocked | `sentences_base` / `sentences_detailed` | BLOCKED |
| total links | **NOT MEASURED** | blocked | `links` | BLOCKED |
| links involving Japanese | **NOT MEASURED** | blocked | `links` | BLOCKED |
| total tags | **NOT MEASURED** | blocked | `tags` | BLOCKED |
| Japanese tags | **NOT MEASURED** | blocked | `tags` | BLOCKED |
| unique Japanese sentence IDs | **NOT MEASURED** | blocked | `sentences_base` | BLOCKED |
| Japanese sentences with links | **NOT MEASURED** | blocked | `links` | BLOCKED |
| Japanese sentences without links | **NOT MEASURED** | blocked | `links` | BLOCKED |
| duplicate sentence IDs | **NOT MEASURED** | blocked | all | BLOCKED |
| duplicate exact Japanese texts | **NOT MEASURED** | blocked | `sentences_base` | BLOCKED |
| empty Japanese texts | **NOT MEASURED** | blocked | `sentences_base` | BLOCKED |
| malformed rows | **NOT MEASURED** | blocked | all | BLOCKED |
| malformed IDs | **NOT MEASURED** | blocked | all | BLOCKED |
| invalid UTF-8 | **NOT MEASURED** | blocked | all | BLOCKED |
| language-code distribution | **NOT MEASURED** | blocked | `sentences_base` | BLOCKED |
| link symmetry / relationship stats | **NOT MEASURED** | blocked | `links` | BLOCKED |
| `jpn_indices` schema | **NOT MEASURED** | blocked | `jpn_indices` | BLOCKED |

**Zero of the required metrics could be produced.** The table is reported in full — with
`NOT MEASURED` rather than omission — so that no reader can mistake an absent row for a
measured zero.

No JLPT level was assigned. No reading was invented. No translation was invented.
`example_sentences` was not read, written, or modified (§5).

### 4.1 Reconciliation against historical claims

| Historical claim | Evidence available in this session | Status |
| :--- | :--- | :--- |
| Artifact `data/tatoeba/sentences.tsv` | **No such path** — the committed artifacts are five `*.tar.bz2` archives | **MISMATCH** |
| SHA-256 `d22978218dfee13a46021ef700aff9a968081133ca4141c0eb7ad966ad038d0b` | Matches **none** of the five declared OIDs; no such object in the LFS store | **NOT REPRODUCIBLE** |
| Raw records `154` | Not measurable; inconsistent in scale with any real Tatoeba export (see below) | **NOT MEASURED** |
| Japanese records `79` | Not measurable | **NOT MEASURED** |
| Accepted `72` / Warnings `7` / Rejected `0` | Not measurable | **NOT MEASURED** |
| Relationships `74` (3 one-to-many, 1 many-to-one, 5 untranslated) | Not measurable | **NOT MEASURED** |
| Digest `1f5308f2286288adb5eadcb79afb69c176de1d5d029b820e0c21a66db29d3b09` | Not computable | **NOT COMPUTED** |
| Version `2024-07` | Registry assertion at `src/services/knowledge/provenance/registry.ts:125`; **no artifact or upstream document corroborates it** | **UNVERIFIED** |

The scale argument recorded in `PHASE-14.5A-HISTORICAL-RECONCILIATION.md` still holds and is
now corroborated by a second signal: the declared payload of these archives is **~524 MB
compressed**, spanning the whole multilingual corpus. A **154-record** file cannot be a
by-product of that payload. The 154/79/72/7/0 figures describe a small curated fixture, not
an official export.

**No measurement was adjusted to resemble a historical claim**, and no claim was promoted on
the strength of a matching string.

---

## §5. Canonical Data Protection

```text
dictionary_entries / kanji_entries / kanji_radicals / kanji_composition / example_sentences
→ NOT READ, NOT WRITTEN, NOT MODIFIED
```

| Invariant | Status |
| :--- | :--- |
| Database connection opened | **NO** — `DATABASE_URL` unset in this environment; no `.env*` beyond `.env.example`; no `psql` used |
| Row counts recorded | **NOT OBTAINABLE** — no database target exists. Reported honestly as not-obtainable rather than asserted from a prior report |
| 箸 = 14 strokes / `source_ref = first-party:kanji-mindtree:v1` | **NOT VERIFIED THIS SESSION** — requires a live database; no such connection was made |
| Canonical writes | **0** |
| Schema migrations | **0** |
| Production contact (`nihongobridge.vercel.app`, Supabase, Neon, Vercel Postgres) | **0** |

`assertDisposableLocalDatabase()` and the preflight checks specified in the acquisition brief
**were not exercised**, because Gate 1 never reached an execution stage requiring a database.
Implementing the guard remains valid future work; it was not done here, since 14.5A is BLOCKED
at artifact acquisition and adding unreachable safety code would be speculative scope.

---

## §6. Existing Implementation — Reuse Map

### 6.1 Reusable components

| Component | Location | Reuse verdict |
| :--- | :--- | :--- |
| Provenance/registry model | `src/services/knowledge/provenance/registry.ts` | **REUSE.** `upstream:tatoeba:2024-07` already registered (line 125) with license, attribution, `domain: "sentence"`, `targetTables: ["example_sentences"]`; alias `tatoeba:corpus:2024-07` at line 287. **Do not create a second provenance system.** |
| Source-neutral sentence contracts | `src/types/sentenceSource.ts` | **REUSE.** Already defines `SentenceSourceRecord`, `SentenceRelationshipRecord`, `SentenceProvenanceRef` (all fields required, no defaults), `AcquisitionManifest`, `SentenceValidationStatus`. Explicitly designed to be populated only from an observed artifact. |
| Lexical matcher (trie, code-point offsets) | `src/services/sentence/lexicalMatcher.ts`, `offsetContract.ts` | **REUSE** for §13/§14 linkage readiness. Correct architecture (dictionary-driven longest-match). Untestable against real data until Gate 1 clears. |
| Knowledge-source table | `src/db/schema.ts` `knowledge_sources` | **REUSE**, with a gap — see §7.3. |
| Existing ETL pipeline conventions | `src/etl/dictionary/*`, `src/etl/kanji/*`, `src/etl/grammar/*` | **REUSE the pattern** (types / loader / transformer / pipeline / dry-run script). Do not build a parallel ETL framework. |
| Dry-run + manifest conventions | `scripts/dry-run-*.ts`, `reports/gates/PHASE-14.4B-*-ACQUISITION-MANIFEST.json` | **REUSE** as the model for a future Tatoeba manifest. |
| Data-quality checks | `src/services/dataquality/*` | **REUSE** for §31 gate coverage. |

### 6.2 `src/etl/sentence/**` — present but NOT reusable for Tatoeba

This module exists (Phase 4) and is Tatoeba-named, but it is a **25-record hardcoded fixture
pipeline** (`pilotData.ts`), and the defects catalogued in `PHASE-14.5A-R3-FINAL-GATE-REPORT.md`
§13 are **still present and unrepaired**:

| Defect | Location | Consequence |
| :--- | :--- | :--- |
| Fabricates readings — `reading = cleanText(raw.reading) \|\| japanese` | `transformer.ts` | Violates the no-fabrication rule directly |
| Assigns JLPT level + injects `jlpt:` tags | `transformer.ts` | Assigns unsupported classification |
| **Rejects** any sentence lacking English | `transformer.ts` | Discards untranslated Japanese, which must be preserved |
| Single `english` column — assumes one translation | `schema.ts` / `loader.ts` | Collapses many-to-many relationships |
| O(N×M) `includes()` matching over the full corpus | `etl/sentence/matcher.ts` | Not viable at 206k entries × corpus scale |
| Bare `catch {}` around matcher load | `etl/sentence/pipeline.ts` | Silently swallows DB errors |
| Upstream ID hidden inside a derived key `es-tat-${tatoebaId}` | `transformer.ts` | Upstream identity not a first-class field |

**Verdict: `etl/sentence/**` must not be used to consume the archives.** It is the wrong shape
and it violates the no-fabrication policy. It was **not modified** (rule 21).

### 6.3 Duplicate components (§20 — confirmed still present)

| Symbol | Definitions | Coverage |
| :--- | --: | :--- |
| `KANJI_REGEX` | **3** | `src/etl/dictionary/types.ts:303` `[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]` · `src/services/knowledge/kanjiLexicalGraphService.ts:37` `[\u4E00-\u9FAF\u3400-\u4DBF\uF900-\uFAFF]` · `src/services/search/matcher.ts:3` `[\u4e00-\u9faf\u3400-\u4dbf]` |
| `extractKanjiCharacters` | **2** | `src/etl/dictionary/types.ts:305`, `src/services/knowledge/kanjiLexicalGraphService.ts:64` |
| `katakanaToHiragana` | **2** | `src/services/knowledge/kanjiJmdictLinkage.ts:45`, `src/services/knowledge/kanjiLexicalGraphService.ts:113` |

**The historical defect is confirmed verbatim.** `src/services/search/matcher.ts:3` uses
`[\u4e00-\u9faf\u3400-\u4dbf]`, which differs from its siblings in **two** ways, not one:

1. it **omits compatibility ideographs `U+F900–U+FAFF`** — the historically reported defect;
2. it **truncates the CJK block at `U+9FAF` instead of `U+9FFF`**, silently excluding the
   `U+9FB0–U+9FFF` range that its siblings include.

This is a live correctness divergence in the **search** path. It was **inspected only** — no
consolidation was performed, because that is Gate 6 scope, not Gate 1.

---

## §7. Existing Schema — Relevance and Incompatibility

### 7.1 Relevant tables

| Table | Role | Notes |
| :--- | :--- | :--- |
| `example_sentences` | canonical learner-facing examples | **Incompatible with raw Tatoeba** — see §7.2 |
| `knowledge_sources` | provenance registry | `record_count`, `imported_at` only — see §7.3 |
| `entity_translations` | multilingual layer (`en`/`ta`/`ml`) | existing translation store; do not duplicate |
| `dictionary_entries` | 206,747 rows per prior report (**not remeasured this session**) | linkage target |
| `kanji_entries` / `kanji_radicals` / `kanji_composition` | kanji graph | linkage target |
| `grammar_patterns` | grammar linkage target | — |

**No sentence-source, sentence-translation, or sentence-link table exists anywhere** —
`grep` for `source_sentences`, `tatoeba_sentences`, `sentence_translations`, `sentence_sources`
across `*.ts` and `*.sql` returns nothing (one unrelated string literal in
`src/types/mobileDictionary.ts`).

### 7.2 `example_sentences` incompatibility

```sql
CREATE TABLE "example_sentences" (
  "id" text PRIMARY KEY NOT NULL,
  "japanese" text NOT NULL,
  "reading" text NOT NULL,          -- no authoritative Tatoeba source
  "english" text NOT NULL,          -- assumes exactly one translation
  "jlpt_level" text NOT NULL,       -- Tatoeba supplies no such classification
  "grammar_id" text,
  "dictionary_entry_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "kanji_characters" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source_ref" text NOT NULL
);
```

| Limitation | Impact |
| :--- | :--- |
| `reading` NOT NULL | No authoritative reading source; satisfying it requires fabrication |
| `english` NOT NULL | Rejects/queries untranslated Japanese; collapses many-to-many to one-to-one |
| `jlpt_level` NOT NULL | Forces a classification Tatoeba does not provide |
| No upstream sentence ID column | Tatoeba identity cannot be preserved as a field |
| No raw-text column | Normalized text would overwrite source text |
| No artifact/checksum binding | Records cannot be traced to bytes |
| No translation-relationship table | Many-to-one / one-to-many cannot be represented |
| **No indexes and no foreign keys** | Only the PK; `grep` over `drizzle/*.sql` finds zero indexes or FK constraints on this table |

**Conclusion: `example_sentences` cannot store raw Tatoeba records.** This confirms — and does
not extend — `reports/gates/PHASE-14.5A-SCHEMA-NECESSITY.md`, which already analyses the
requirement, alternatives, migration implications, and rollback strategy. **That document is a
DESIGN INPUT, not authorization.** It is referenced, not duplicated here.

### 7.3 Provenance gap

`knowledge_sources` carries `id, name, version, license, url, description, domain,
record_count, imported_at`. It has **no column for a checksum, artifact filename, acquisition
timestamp, format, or verification status**. The required §6/§9 provenance fields therefore
have **no home in the current schema**. This is a genuine, narrowly scoped gap — and it is
**not implementable now**, because populating those fields requires an artifact whose bytes
can be read.

### 7.4 Migration state

4 migrations (`0000`–`0003`) + 4 snapshots + `_journal.json`. **Unchanged. No migration was
generated or applied.** `npx drizzle-kit check` was **NOT RUN** (no `node_modules`; running it
would require a full install, which is unjustified for a read-only gate — reported as
`NOT RUN`, not as a pass).

---

## §8. Data-Model Decision (described, NOT implemented)

Required minimum, for the record. **Nothing here was implemented, migrated, or committed.**

```text
upstream source identity   → registry entry extended with checksum + artifact + acquisition
                             (extend knowledge_sources or its companion — one system, not two)
source_sentences           → source-native records: upstream ID (authoritative, never replaced),
                             upstream language code, raw text, normalized text, artifact binding
sentence_translations      → explicit many-to-many relationship rows:
                             source ID → target ID → target language → relationship provenance
sentence_sources           → per-record provenance → artifact + checksum + parser version
example_sentences          → UNCHANGED. Learner-facing canonical examples only.
```

Binding constraints carried forward: `reading` stays `NULL` rather than fabricated; JLPT stays
`NULL` unless independently evidenced; translations remain relationships, never collapsed into
a single column; `example_sentences` is not written to on ingestion.

**Blocking prerequisite:** the model's *actual column set* must be derived from the observed
artifact. Since the artifact cannot be opened, **the model cannot be finalized**. Designing it
now would repeat the precise failure mode — schema shaped by assumption — that produced the
current situation.

---

## §9. CI State (§33)

Rechecked at HEAD. **Not** inherited from a prior report.

| Item | Finding |
| :--- | :--- |
| main tip `cfe565d` CI | **failure** (run `35964546020`, 1m34s) |
| PR #10 branch `ab452b3da` CI | **failure** (run `35964141478`) |
| Failing step | **`Test (P3/P4 — real Vitest run against PostgreSQL)`** — identical on both |
| Passing steps | `Install (P1)`, `Assert toolchain determinism (P2)`, `Initialize disposable schema` |
| Skipped steps | `Typecheck`, `Lint`, `Production build`, `Assert build/runtime contract` |

The historic pattern is **confirmed and unchanged**: main and the feature branch fail at the
**same** step. This is a **genuine, reproducible test failure**, reported as `FAIL` — not
reclassified as environmental. Note that `Typecheck`, `Lint`, and `Build` were **skipped** on
both; their earlier "passing" status is therefore historical and **not re-verified by CI in
this run**.

**Limitation, stated honestly:** the failure *text* could not be read. `gh run view --log-failed`
fails because the log archive is served from `results-receiver.actions.githubusercontent.com`,
which is blocked by the same egress policy described in §3.2. Only the **step-level
conclusion** is independently verified here.

These checks were **not re-run locally**: `node_modules` is absent, and a full install for a
read-only gate was judged out of scope. Reported as `NOT RUN`, never as pass.

---

## §10. Safety Verification

```text
[x] Production database never contacted
[x] Supabase never contacted
[x] Neon never contacted
[x] Vercel storage never contacted
[x] No database connection opened at all
[x] Zero canonical DB writes
[x] Zero schema migrations (4 unchanged: 0000–0003)
[x] No schema file modified
[x] example_sentences untouched
[x] dictionary_entries / kanji_entries / kanji_radicals / kanji_composition untouched
[ ] 箸 = 14 strokes — NOT VERIFIED (no database available; not asserted)
[ ] Tatoeba source checksum verified — NOT MEASURED (bytes unretrievable)
[x] License recorded as registered: CC-BY-2.0-FR (attribution string preserved verbatim)
[x] Source IDs preserved — LFS OIDs and declared sizes recorded verbatim
[ ] Relationships preserved — NOT APPLICABLE (no records read)
[x] No AI-generated sentence content
[x] No fabricated translations
[x] No fabricated readings, JLPT levels, or record counts
[ ] Two-pass digest — NOT COMPUTED (no records)
[x] PR #10 not merged, not modified, not re-opened
[x] No file deleted, renamed, or moved
[x] No secrets printed; no token echoed; no `.env` contents read
```

---

## §11. Known Limitations

1. **Artifact bytes are unreadable from this environment.** The single blocking condition;
   everything downstream of it is BLOCKED, not failed.
2. **`SHA_STATUS = NOT_MEASURED`.** The five OIDs are declarations. A matching string is not a
   measurement, and this report does not present it as one.
3. **CI failure text unreadable** — log host blocked. Step-level conclusion only.
4. **No database available**, so canonical row counts and the 箸 invariant are **not verified**,
   and the `assertDisposableLocalDatabase()` guard was not exercised.
5. **No local build/test run** — `node_modules` absent; reported `NOT RUN`.
6. **`jpn_indices` schema unknown.** Its structure must be established from the artifact and must
   **not** be assumed from documentation.
7. **`sentences_base` vs `sentences_detailed` are distinct exports.** Which is authoritative for a
   given purpose is an open question resolvable only by inspection.

---

## §12. Changes Made

```text
No implementation changes made.
```

| Action | Count |
| :--- | --: |
| Source files created/modified (`src/`) | **0** |
| Schema files modified (`src/db/schema.ts`) | **0** |
| Migrations added/modified | **0** |
| ETL code added/modified | **0** |
| Tests added/modified | **0** |
| `package.json` / lockfile changes | **0** |
| Canonical data changes | **0** |
| Files deleted / renamed / moved | **0** |
| Files added | **1** — this report, `reports/gates/TATOEBA-14.5A-VERIFICATION-REPORT.md` |
| Network fetches into the repository | **0** (LFS objects were attempted to `/tmp` outside the repo; **all failed**; `/tmp` is outside the workspace and not persisted) |
| Production contact | **0** |

The five pointer files under `data/tatoeba/` remain **byte-identical**; `git status` is clean
apart from this report.

---

## §13. Gate Status

| Gate | Status | Basis |
| :--- | :--- | :--- |
| **Gate 0** — Repository reconciliation | **PASS (with findings)** | Local == origin/main; tree clean; PR #10 located and classified; artifacts located; three drifted brief premises recorded |
| **Gate 1 / 14.5A** — Tatoeba artifact verification | **BLOCKED** | Declared artifacts exist upstream at declared OIDs/sizes, but **bytes are unretrievable** — no LFS client, no local cache, media host firewalled. Zero metrics measurable |
| **Gate 2 / 14.5B** — Tatoeba staging | **NOT AUTHORIZED** | Depends on Gate 1 |
| **Gate 3** — Schema/model decision | **NOT AUTHORIZED** | Depends on Gate 2; `PHASE-14.5A-SCHEMA-NECESSITY.md` remains a DESIGN INPUT only |
| **Gate 4 / 14.5C** — Canonical persistence | **NOT AUTHORIZED** | — |
| **Gate 5 / 14.5D** — Dictionary integration | **NOT AUTHORIZED** | — |

---

## §14. Recommended Next Authorized Gate

> **Gate 1 — Tatoeba 14.5A artifact verification, re-entered with readable bytes.**
>
> The narrow, minimal next step: make the five LFS objects' bytes readable **in this
> environment**, then execute the read-only verification programme already specified
> (`PHASE-14.5A-NEXT-SESSION-HANDOFF.md` §5) — measure SHA-256 from the bytes themselves,
> confirm `PASS1 == PASS2`, inspect members and schemas, and measure every metric in §4 above.
>
> Two acceptable routes, neither of which is a re-acquisition and neither of which requires a
> design decision:
>
> 1. **Enable LFS access for the sandbox** — allow `github-cloud.githubusercontent.com` (and
>    `release-assets.githubusercontent.com`) through the egress policy. The objects already
>    exist at the declared OIDs; they simply cannot be reached. This is an environment change,
>    not a repository change.
> 2. **Suppress LFS smudge at clone time and supply the bytes out-of-band**, or have the
>    environment materialize `.git/lfs/objects/` before the session begins.
>
> **Explicitly not recommended:** substituting another release, mirror, or registry copy;
> forcing a digest to match a historical value; or beginning 14.5B staging to "get ahead" of a
> blocked artifact. The first two are prohibited by standing rules; the third would design a
> schema around assumptions — the exact failure this gate exists to prevent.

---

## §15. Final Gate Verdict

Per the mandated output format:

```text
PHASE 14.5A STATUS:  BLOCKED — ARTIFACT BYTES UNRETRIEVABLE
SOURCE:              upstream:tatoeba:2024-07 (registered; version UNVERIFIED)
ARTIFACT:            data/tatoeba/*.tar.bz2 — LFS pointers only (5 files)
CHECKSUM:            NOT MEASURED (OIDs declared upstream; not independently reproduced)
RAW RECORDS:         NOT MEASURED
JAPANESE RECORDS:    NOT MEASURED
ACCEPTED:            NOT MEASURED
WARNINGS:            NOT MEASURED
REJECTED:            NOT MEASURED
RELATIONSHIPS:       NOT MEASURED
PASS 1 DIGEST:       NOT COMPUTED
PASS 2 DIGEST:       NOT COMPUTED
DATABASE WRITES:     0
SCHEMA MIGRATIONS:   0 (4 unchanged)
FOCUSED TESTS:       NOT RUN — no suite written; no artifact to test against
FULL REGRESSION:     NOT RUN — node_modules absent
TYPECHECK:           NOT RUN
LINT:                NOT RUN
BUILD:               NOT RUN
DRIZZLE:             NOT RUN
PRODUCTION ACCESS:   0
CI (main, rechecked): FAIL at Test step — genuine, identical on main and PR branch
FINAL GATE VERDICT:  BLOCKED — PHASE 14.5A NOT VERIFIED
```

**NO-GO.** The failed gate is **Gate 1 — artifact verification**, blocked at the environment
egress boundary, not at the repository, the schema, or the implementation.

---

## §16. Integrity Statement

| Invariant | Value |
| :--- | :--- |
| Files downloaded into the repository | **0** |
| Tatoeba data acquired | **0** |
| Records ingested | **0** |
| Canonical tables read | **0** |
| Canonical tables written | **0** |
| Schema changes / migrations | **0 / 0** |
| Production access | **0** |
| Historical claims promoted without evidence | **0** |
| Measurements tuned toward a target value | **0** |
| Prior gate reports deleted or overwritten | **0** |
| PR #10 modified | **no** (already merged; untouched) |
