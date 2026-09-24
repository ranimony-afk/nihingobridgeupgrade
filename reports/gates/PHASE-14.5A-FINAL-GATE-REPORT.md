# Phase 14.5A-R Final Gate Report

**Gate**: Phase 14.5A-R — Tatoeba Acquisition & Provenance Foundation (Reproducible Rebase)
**Parent**: Phase 14.4F — Takoboto-Class Dictionary & Kanji Experience
**Date**: 2026-09-24
**Branch**: `arena/01a0d136-nihingobridgeupgrade`
**Commit**: `318289da2e816fa3a77b7e061b793cf3f6d0a219`
**Mode**: Audit → acquire → validate → manifest → deterministic dry-run → test → gate (**halted at acquire**)

> **Lineage note.** This report **supersedes** the previous Phase 14.5A final gate report at
> this path (2026-09-24, earlier revision). That report's verdict was also NO-GO; its
> findings are preserved here and in the two companion audits. Per §0, the objective of this
> rebase was **not** to make the prior report appear correct, and no prior finding was
> softened. Git history retains the earlier revision.

---

## 1. Executive Verdict

```
=============================================================================
NO-GO / BLOCKED — PHASE 14.5A-R
=============================================================================
Blocking gate: Gate 1 — Artifact availability (§2)
```

The phase halted at **Gate 1** in accordance with §2's HARD STOP. Per §30, GO requires a
real artifact, a verified SHA, verified source identity, and a parser that processes the
actual artifact. None can exist, so **NO-GO / BLOCKED** is returned.

Per §0, "A BLOCKED / NO-GO result is a valid and preferred outcome when prerequisites are
unavailable." Per §30, no partial GO was claimed.

---

## 2. §29 Formal Gate Matrix

| Gate | Requirement | Result | Evidence |
| :---: | :--- | :--- | :--- |
| 0 | Safety preflight | **PASS** | 0 production contact; 0 writes; 0 migrations; no prod env vars; all 4 prod hosts unreachable |
| 1 | Artifact availability | **FAIL — BLOCKING** | 2A absent · 2B never existed · 2D unreachable & no repo-hosted artifact |
| 2 | Source identity | **NOT VERIFIABLE** | version/date unconfirmed; §3 forbids inventing |
| 3 | SHA-256 | **NOT COMPUTED** | no artifact |
| 4 | Provenance registration | **PASS** | `upstream:tatoeba:2024-07` exists; retained, not duplicated (§4, §2C) |
| 5 | Format audit | **BLOCKED** | nothing to inspect (§5) |
| 6 | Streaming parser | **NOT IMPLEMENTED** | §6 authorizes only after artifact exists |
| 7 | Japanese identification | **BLOCKED** | no records |
| 8 | Validation | **BLOCKED** | no records |
| 9 | Relationship extraction | **BLOCKED** | no records |
| 10 | Source preservation | **N/A** | no records |
| 11 | Provenance completeness | **N/A** | no records |
| 12 | Deterministic serialization | **SPECIFIED, NOT EXERCISED** | contract defined in TATOEBA-ACQUISITION.md §10 |
| 13 | Pass 1 digest | **NOT COMPUTED** | — |
| 14 | Pass 2 digest | **NOT COMPUTED** | — |
| 15 | Digest equality | **NOT COMPUTED** | — |
| 16 | Database safety | **PASS** | 0 writes · 0 migrations · 0 production access |
| 17 | Canonical invariants | **BLOCKED** | no DB, no corpus sources (§20) — see §7 |
| 18 | Security validation | **BLOCKED** | no input to validate |
| 19 | Performance | **NOT MEASURED** | no artifact; §25 forbids claiming full-corpus metrics |
| 20 | Focused tests | **NOT CREATED** | §6/§31 — no suite can test a parser that cannot exist |
| 21 | Regression | **MEASURED, HONESTLY REPORTED** | 62 failed / 551 passed / 102 skipped — pre-existing, see §5 |
| 22 | Typecheck | **PASS** | 0 errors |
| 23 | Lint | **PASS** | 0 errors, 4 pre-existing warnings |
| 24 | Build | **PASS** | compiled successfully |
| 25 | Documentation | **PARTIAL — as permitted** | 2 of 2 spec docs created; manifest correctly withheld (§16) |
| 26 | 14.5B handoff | **NOT SATISFIED** | 10 of 11 consumable items unavailable — see §8 |
| 27 | Final verdict | **NO-GO / BLOCKED** | Blocking gate 1 |

---

## 3. §2 Critical Input Availability Gate

Full evidence in `reports/gates/PHASE-14.5A-R-ARTIFACT-AUDIT.md`. Summary:

| §2 level | Method | Result |
| :--- | :--- | :--- |
| **2A** Repository | filesystem + tracked-file search | `data/` does not exist; 0 tracked refs to `sentences.tsv` |
| **2B** Git history | **GitHub API (full history)**, not the shallow local clone | **0 commits EVER touched `data/tatoeba`**; no `.tsv` ever committed; no tatoeba path in full tree; stash empty |
| **2C** Provenance registry | registry inspection | `upstream:tatoeba:2024-07` exists — retained, **not duplicated** |
| **2D** Approved acquisition | official endpoint probe + org/release audit | All Tatoeba endpoints `HTTP 000`; Tatoeba's GitHub org (20 repos) hosts **software only, 0 release assets** — **no approved repo-hosted artifact exists** |

**Shallow-clone caveat handled.** The local clone is depth-1
(`git rev-parse --is-shallow-repository` → `true`), so local `git log --all` cannot disprove
historical existence. The check was escalated to the GitHub API, which reads full history
and returns 0 for `path=data/tatoeba`. The 10 historical commits matching `path=data` were
individually inspected and are unrelated scaffold operations (`.dockerignore`, CI workflows,
`Dockerfile`, `README.md`) — **no sentence artifact among them.**

§2's HARD STOP therefore applies:

```
BLOCKED — PHASE 14.5A-R ARTIFACT UNAVAILABLE

Required artifact:
data/tatoeba/sentences.tsv   (or the genuine equivalent Tatoeba export)

Expected SHA-256:
d22978218dfee13a46021ef700aff9a968081133ca4141c0eb7ad966ad038d0b
   — cannot be confirmed; per §0 not authoritative without physically identical bytes

No Phase 14.5A-R acquisition, parsing, validation, or digest executed.
HARD STOP.
```

---

## 4. §0 Operating-Rules Compliance

| Rule | Status |
| :--- | :--- |
| Never fabricate records, counts, checksums, relationships, licenses, dates, provenance | **PASS** |
| Never claim a file exists unless its bytes are available | **PASS** — evidence-based non-existence claims only |
| Never reuse the claimed 154/79/72/`d2297821…` as authoritative without identical bytes | **PASS** — not reused |
| Do not manufacture a replacement file | **PASS** |
| Do not create a synthetic corpus and call it Tatoeba | **PASS** |
| Do not silently substitute another release | **PASS** |
| Do not silently substitute a GitHub mirror | **PASS** — investigated, explicitly rejected, documented |
| Do not bypass network restrictions | **PASS** — no npm/PyPI side-channel used despite registries being reachable |
| Do not use production database credentials | **PASS** — none exist |
| Do not write to production PostgreSQL | **PASS** — 0 writes |
| Do not execute migrations | **PASS** — 0 migrations |
| Do not modify canonical dictionary/kanji records | **PASS** — 0 modifications |
| Do not alter existing canonical provenance | **PASS** — registry untouched |
| Do not execute Phase 14.5B | **PASS** — not started |
| Do not produce GO without real evidence | **PASS** — NO-GO returned |

### Explicitly rejected acquisition alternatives

| Route | Rejected because |
| :--- | :--- |
| GitHub mirror of Tatoeba corpus | §0 — a mirror is not the official release; its identity cannot be verified |
| npm / PyPI package carrying Tatoeba data (registries **are** reachable) | Would **circumvent the tatoeba.org block** — §2D forbids bypassing network restrictions |
| Internet search for replacement data | §2D permits testing only the official endpoint |
| Synthetic corpus generation | §0 — "Do not manufacture a replacement file" |
| Reusing historical claimed metrics | §0 — requires physically identical bytes |

No substitution was performed, silently or otherwise.

---

## 5. §24 Full Regression Battery (fresh, this phase)

| Command | Result |
| :--- | :--- |
| `npx vitest run --fileParallelism=false` | **62 failed \| 551 passed \| 102 skipped (715)** · 18 failed \| 20 passed (38 files) |
| `npm run typecheck` | **PASS** (0 errors) |
| `npm run lint` | **PASS** (0 errors, 4 warnings) |
| `npm run build` | **PASS** |
| `npx drizzle-kit check` | **PASS** — "Everything's fine 🐶🔥" (0 migrations required) |

Results are **identical to the pre-phase baseline** — expected, since 0 files were modified.

### §24 failure attribution: Phase 14.5A vs environmental/pre-existing

Per §24, these are explicitly distinguished:

| Category | Count | Detail |
| :--- | :--- | :--- |
| **Phase 14.5A failures** | **0** | No 14.5A code was written, so no 14.5A test can fail |
| Environmental — `DATABASE_URL is required` | 39 occurrences | no DB configured |
| Environmental — `ECONNREFUSED 127.0.0.1:5432` | 1 | no local PostgreSQL |
| Environmental — missing ETL artifacts (`data/kanjidic2.xml`, `data/kanjivg`) | 4 | `data/` absent |
| Pre-existing, DB-dependent | remainder | e.g. Phase 14.4E's own suite is 18/24 failing without a DB, despite having been merged as verified |

**No test was modified, weakened, or skipped to influence any result.**

### Canonical counts correction (carried forward)

The prompt's §20 states `dictionary_entries = 206,747` and clarifies it is "the full
dictionary table total, not merely the JMdict subset." This **confirms and resolves** a
discrepancy noted in an earlier audit revision:

```
dictionary_entries total          206,747   ← §20 invariant target
  upstream:jmdict:2023-08         206,717   ← what tests/dictionary-architecture.test.ts:48 asserts
  first-party:dictionary-core:v1       30
  test pilot entries                    2
```

Both figures are correct and measure different scopes; no contradiction exists.

---

## 6. §12 Audit — Can `example_sentences` Represent Tatoeba Records?

**Table** (`src/db/schema.ts:750`), inspected read-only. **Not altered** (§12).

```
id                  text   PRIMARY KEY
japanese            text   NOT NULL
reading             text   NOT NULL      ← blocker
english             text   NOT NULL      ← blocker
jlpt_level          text   NOT NULL      ← blocker
grammar_id          text   NULL
dictionary_entry_ids jsonb  NOT NULL default []
kanji_characters    jsonb   NOT NULL default []
tags                jsonb   NOT NULL default []
source_ref          text   NOT NULL
```

**Verdict: NO — the table cannot represent Tatoeba records as currently declared.**

| Column | Conflict |
| :--- | :--- |
| `reading` | Tatoeba supplies **no full-sentence reading**. §22 prohibits `reading = japanese`. Satisfying `NOT NULL` honestly is impossible. |
| `english` | §10 requires untranslated sentences to remain **explicitly untranslated**. `NOT NULL` forbids representing that state. |
| `jlpt_level` | §21 prohibits assigning JLPT levels to Tatoeba sentences. `NOT NULL` forces a fabricated value. |
| `dictionary_entry_ids`, `kanji_characters` | Canonical linkage is **Phase 14.5B** (§11), not 14.5A. |
| — | No column exists for the Tatoeba source sentence ID or for translation relationships (§11). |

**Incompatibility documented for 14.5B/14.5C.** Per §12, no migration was written and no
table was altered. Per §31, `example_sentences` was not modified.

---

## 7. §13 Audit — Existing Sentence Matcher Complexity

**Not fixed in 14.5A** (§13). Findings recorded as a downstream Phase 14.5B requirement.

`src/etl/sentence/matcher.ts` → `SentenceMatcher.matchDictionaryEntries(japanese)`:

```ts
for (const v of this.cachedVocab) {
  if (v.headword.length >= 2 || /[\u4E00-\u9FFF]/.test(v.headword)) {
    if (japanese.includes(v.headword)) { matched.add(v.id); }
  }
}
```

| Property | Observed | §13 requirement for 14.5B |
| :--- | :--- | :--- |
| Complexity | `japanese.includes(headword)` over the **entire** cached corpus ⇒ **O(sentences × dictionary_entries)** | bounded complexity, indexed lookup |
| Positions | none | character positions required |
| Longest-match | none | longest-match behavior required |
| Index | none (linear scan of ~206,747 headwords) | trie / Aho-Corasick or equivalent |
| Reading alignment | none | reading alignment required |

**Additional defect — silent failure mode.** `pipeline.ts:46-49` wraps
`SentenceMatcher.load()` in a bare `catch {}`, continuing with an empty cache:

```ts
try { await SentenceMatcher.load(); } catch { /* continues with empty cache */ }
```

A database outage is thereby indistinguishable from "no vocabulary matched" — producing
`dictionaryEntryIds: []` with no error signal. This is a correctness hazard for any future
linkage, and is flagged for 14.5B (not repaired here, per §13).

**Related §21/§22 violation (pre-existing).** `transformer.ts:52` —
`const reading = cleanText(raw.reading) || japanese;` — implements exactly the
`reading = japanese` substitution §22 prohibits, and pushes `jlptLevel` into `tags`.

---

## 8. §20 Canonical Corpus Invariants — BLOCKED

| Invariant | Expected | Result |
| :--- | :--- | :--- |
| `dictionary_entries` | 206,747 | **BLOCKED** |
| `kanji_entries` | 13,108 | **BLOCKED** |
| `kanji_radicals` | 63 | **BLOCKED** |
| `kanji_composition` | 90 | **BLOCKED** |

**Reason.** No database is reachable and none can be made meaningful:

- `DATABASE_URL` unset; port 5432 closed (`ECONNREFUSED`); `psql` not installed.
- The corpus is populated by ingesting `data/JMdict.xml`, `data/kanjidic2.xml`, and
  `data/kanjivg/` — **all absent**, and `data/` does not exist.

A disposable PGlite instance *could* be started (`scripts/run-disposable-pg.ts`,
`@electric-sql/pglite` already a devDependency), but it would yield an **empty schema**:
206,747 dictionary entries cannot be produced without `data/JMdict.xml`. Starting it would
therefore not verify anything, and creating tables would risk appearing as schema work
prohibited by §19/§31.

Per §20: "If the local corpus is unavailable: VERIFICATION = BLOCKED. **Do not pretend the
invariant was checked.**" The invariant was **not** checked, and is reported as such. No
canonical table was read, written, or altered (§31).

---

## 9. §5 Created Files

| File | §ref | Purpose |
| :--- | :--- | :--- |
| `reports/gates/PHASE-14.5A-R-ARTIFACT-AUDIT.md` | §2 | Artifact availability audit (search order A–D) |
| `docs/architecture/TATOEBA-ACQUISITION.md` | §27, §28 | Acquisition spec + 14.5B handoff contract |
| `docs/architecture/TATOEBA-PROVENANCE-MODEL.md` | §27 | Provenance/attribution/digest contract |
| `reports/gates/PHASE-14.5A-FINAL-GATE-REPORT.md` | §27, §29 | This report |

**Modified files: 0.** No file under `src/`, `drizzle/`, `tests/`, `scripts/`, or
`package.json` was created or changed (`git diff --stat HEAD` for those paths → empty).

### Deliberately NOT created

| File | Reason |
| :--- | :--- |
| `reports/gates/PHASE-14.5A-TATOEBA-ACQUISITION-MANIFEST.json` | §16: "No placeholder values in the final manifest." No artifact ⇒ every field would be a placeholder. Emitting it would be fabrication (§0). |
| `src/etl/tatoeba/**` | §6: implement "**only after** the real artifact is available." |
| `tests/tatoeba-provenance-acquisition.test.ts` | §23 — a suite cannot test a parser that §6 forbids creating. Writing tests against no input would produce unverifiable green results. |
| Any schema migration | §19, §31 explicitly prohibit. |

---

## 10. Known Limitations

1. **No Tatoeba artifact exists** and none is obtainable in this environment. The phase's
   core dependency is unsatisfied.
2. **The historical 14.5A figures are unverifiable.** `d2297821…038d0b`, the
   `1f5308f2…` digest, and 154/79/72/7/0 cannot be confirmed and, per §0, are not
   authoritative without physically identical bytes.
3. **The declared figures are implausible for a genuine Tatoeba release.** Tatoeba's real
   `sentences.tsv` export contains millions of sentences; a 154-record file with 79 Japanese
   records is ~4 orders of magnitude too small. This suggests the prior 14.5A was authored
   against a small curated file rather than an actual Tatoeba release export. **§3's
   "never invent the version" cannot be satisfied by re-scoping without user direction.**
4. **Egress is allowlisted** to GitHub + package registries. Tatoeba acquisition is
   impossible here without a platform-level change, and bypassing is prohibited.
5. **Canonical invariants unverifiable** — no DB and no ETL source artifacts.
6. **Regression baseline is red for environmental reasons**, so §24's expectation of green
   regression cannot currently be met by any phase.
7. **`example_sentences` is structurally incompatible** with Tatoeba records (§6 above).
8. **No sentence↔sentence relationship model exists**, and the Phase 4 transformer violates
   §22's `reading = japanese` prohibition.

---

## 11. §28 14.5B Handoff Contract — Current State

Documented in full in `docs/architecture/TATOEBA-ACQUISITION.md` §14.

```
14.5B CONSUMABLE INPUTS
✗  immutable Tatoeba artifact          — DOES NOT EXIST
✗  verified SHA-256                    — NOT COMPUTED
✗  verified source identity            — UNVERIFIED (version/date asserted only)
✓  provenance registry entry           — PRESENT (registry.ts:125)
✗  parsed sentence records             — NONE
✗  source sentence IDs                  — NONE
✗  language metadata                    — NONE
✗  translation relationships            — NONE
✗  validation statuses                  — NONE
✗  deterministic digest                 — NOT COMPUTED
✗  acquisition manifest                 — WITHHELD (§16)

14.5B MUST STILL PERFORM
→  normalization, deduplication, dictionary linkage, kanji linkage,
   reading-aware matching, character positions, longest-match logic,
   canonical example-sentence strategy, translation linkage, DB integration
```

**1 of 11 handoff items is satisfied. The handoff is NOT complete.**
Per §30 ("14.5B handoff is complete" is a GO requirement) and the closing rule
("14.5B AUTHORIZED TO START ONLY IF FINAL VERDICT = GO"), **Phase 14.5B remains
unauthorized.**

---

## 12. Required Final Report (§31 closing format)

```text
PHASE 14.5A-R STATUS:      BLOCKED / NO-GO

SOURCE:                    upstream:tatoeba:2024-07  (registered; version UNVERIFIED)

ARTIFACT:                  data/tatoeba/sentences.tsv — NOT ACQUIRED

SHA-256:                   NOT COMPUTED
                           (declared d22978218dfee13a46021ef700aff9a968081133ca4141c0eb7ad966ad038d0b
                            is unconfirmable; not treated as authoritative per §0)

RAW RECORDS:               NOT MEASURED
JAPANESE RECORDS:          NOT MEASURED
ACCEPTED:                  NOT MEASURED
WARNINGS:                  NOT MEASURED
REJECTED:                  NOT MEASURED
RELATIONSHIPS:             NOT MEASURED

PASS 1 DIGEST:             NOT COMPUTED
PASS 2 DIGEST:             NOT COMPUTED
DETERMINISM:               NOT COMPUTED

DATABASE WRITES:           0
SCHEMA MIGRATIONS:         0
PRODUCTION ACCESS:         0
CANONICAL MUTATIONS:       0

FOCUSED TESTS:             NOT CREATED (0) — §6 precondition unmet
FULL REGRESSION:           62 failed | 551 passed | 102 skipped (715) — pre-existing/environmental
TYPECHECK:                 PASS (0 errors)
LINT:                      PASS (0 errors, 4 pre-existing warnings)
BUILD:                     PASS
DRIZZLE:                   PASS (0 migrations required)

FINAL VERDICT:             NO-GO / BLOCKED
BLOCKING GATE:             Gate 1 — Artifact availability (§2)

14.5B:                     NOT AUTHORIZED (requires GO)
```

---

## 13. Unblocking Options

| # | Option | Requirement | Assessment |
| :--- | :--- | :--- | :--- |
| **A** | Supply the real artifact | Place the actual file at `data/tatoeba/sentences.tsv`; confirm `sha256sum` = `d2297821…038d0b` | Restores 14.5A-R exactly as specified. Requires the file to exist outside this sandbox. **Preferred.** |
| **B** | Re-scope to the genuine Tatoeba export | Real 2024-07 Japanese export with realistic counts and no fixed SHA; requires platform-level Tatoeba egress | Honest path to a real foundation, but invalidates the 154/79/72/7/0 targets (§26) |
| **C** | Authorize a clearly-labelled non-Tatoeba fixture | Explicit authorization required | §0 forbids synthetic corpora "called Tatoeba"; a fixture must never be reported as a verified Tatoeba foundation |
| **D** | Provision the canonical corpus | Supply `data/JMdict.xml`, `data/kanjidic2.xml`, `data/kanjivg/`; start `scripts/run-disposable-pg.ts`; run 14.3D/14.4C/14.4D ingestion | **Prerequisite for §20/Gate 17 and for a green regression baseline**, under any of A–C |

Option **D** is required for any of A–C to reach the "verified" bar of §30.

---

## 14. Final Gate Verdict & Hard Stop

```
=============================================================================
FINAL VERDICT: NO-GO / BLOCKED — PHASE 14.5A-R

Blocking gate:  Gate 1 — §2 Artifact availability
  · 2A Repository       — ABSENT
  · 2B Git history      — NEVER EXISTED (full-history API: 0 commits touched data/tatoeba)
  · 2C Provenance       — EXISTS, retained, not duplicated
  · 2D Acquisition      — BLOCKED (endpoints 000; no approved repo-hosted artifact exists)

Additional non-passing gates:
  Gate 2  Source identity            NOT VERIFIABLE
  Gate 3  SHA-256                    NOT COMPUTED
  Gate 5  Format audit               BLOCKED
  Gate 6  Streaming parser           NOT IMPLEMENTED (§6 precondition unmet)
  Gate 17 Canonical invariants       BLOCKED (§20 — not pretended otherwise)
  Gate 20 Focused tests              NOT CREATED
  Gate 26 14.5B handoff              NOT SATISFIED (1 of 11 items)

Verified clean:
  Production access      0
  Database writes        0
  Schema migrations      0
  Canonical mutations    0
  Fabricated artifacts   0
  Files modified         0
  Typecheck / Lint / Build / Drizzle   PASS
=============================================================================
```

Per §30, GO requires every listed condition; not one of the artifact-dependent conditions
holds. Failures were **not** downgraded to warnings, and no partial GO was claimed.

**HARD STOP.** Phase 14.5B not started. No sentence normalization. No dictionary or kanji
linkage. `example_sentences` not modified. No schema migrations added. No production seeding.
No additional datasets downloaded. No missing translations invented. No readings generated.
No JLPT levels assigned.

The only output produced is this verification-and-handoff record, which reports the phase as
**BLOCKED** with its exact blocking gate.
