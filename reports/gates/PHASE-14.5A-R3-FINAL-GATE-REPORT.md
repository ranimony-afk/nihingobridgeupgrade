# Phase 14.5A-R3 Final Gate Report

**Gate**: Phase 14.5A-R3 — Tatoeba Sentence Acquisition & Provenance Foundation (Reconciliation & Real Acquisition)
**Date**: 2026-09-24
**Branch**: `arena/01a0d136-nihingobridgeupgrade` (environment-provided; not created or switched)
**Commit**: `318289da2e816fa3a77b7e061b793cf3f6d0a219`
**Mode**: Reconcile → audit → acquire → validate → manifest → digest → gate (**halted at acquire**)

---

## §0. Path Note — §28 vs §0 Rule 22

§28 requests this report at `reports/gates/PHASE-14.5A-FINAL-GATE-REPORT.md`. That path is
**already occupied** by the Phase 14.5A-R report from an earlier session.

§0 rule 22 states: **"Do NOT delete previous gate reports."** Overwriting that file would
destroy the R-phase audit record.

Resolution: this R3 report is written to
`reports/gates/PHASE-14.5A-R3-FINAL-GATE-REPORT.md`, and the existing
`PHASE-14.5A-FINAL-GATE-REPORT.md` is **left intact**. The chain of gate reports across
sessions is preserved in full. Its verdict was also NO-GO, so no prior GO is being displaced.

---

## §1. Final Verdict

Per §28, the BLOCKED output format is mandated:

```text
PHASE 14.5A STATUS: BLOCKED

ARTIFACT: NOT AVAILABLE
SOURCE: registered but acquisition not verified
SHA: NOT VERIFIED
RAW RECORDS: NOT MEASURED
JAPANESE RECORDS: NOT MEASURED
RELATIONSHIPS: NOT MEASURED
DIGEST: NOT COMPUTED
DATABASE WRITES: 0
SCHEMA MIGRATIONS: 0
PRODUCTION ACCESS: 0
14.5B: NOT AUTHORIZED
```

Per §30:

```text
BLOCKED — PHASE 14.5A TATOEBA ACQUISITION & PROVENANCE FOUNDATION NOT VERIFIED
```

---

## §2. §1 Repository State Reconciliation

| Item | Actual state |
| :--- | :--- |
| Current branch | `arena/01a0d136-nihingobridgeupgrade` (environment-provided) |
| HEAD commit | `318289da2e816fa3a77b7e061b793cf3f6d0a219` |
| Working tree | Unmodified application code; only session-created reports/docs untracked |
| Clone depth | **shallow** (`git rev-parse --is-shallow-repository` → `true`, depth 1) |
| **LATEST_VERIFIABLE_PHASE** | **`14.4E`** — `PHASE-14.4E-FINAL-GATE-REPORT.md` present with implementation |
| Phase 14.4F present? | **NO** — verified from files, not from conversation claims (§1) |
| Existing phase reports | 14.4A–14.4E (15 files) plus session-created 14.5A/14.5B audits |
| Provenance registry | Present (`src/services/knowledge/provenance/`) |
| Tatoeba-related code | `src/etl/sentence/**` (Phase 4) — 25-record hardcoded fixture |
| Sentence schema | `example_sentences` (`schema.ts:750`) |
| `data/` directory | **DOES NOT EXIST** |
| `.gitignore` | `/data/`, `*.gz`, `*.xml`, `*.xml.gz`, `*.br` excluded |
| `drizzle/` | 4 migrations (`0000`–`0003`) + snapshots; unchanged |
| Tests | 39 files (38 counted in vitest include) |
| Architecture docs | `docs/architecture/` — 9 pre-existing + 2 session-created |

```
LATEST_VERIFIABLE_PHASE = 14.4E
```

---

## §3. §2 Critical Artifact Availability Gate

### 2A — Workspace

Expanded search per §1B. **All absent:**

| Candidate | Result |
| :--- | :--- |
| `data/tatoeba/sentences.tsv` | absent — `data/` does not exist |
| `data/tatoeba/sentences_detailed.tsv` | absent |
| `links.tsv` | absent |
| `sentences.csv` | absent |
| `sentences.tar.bz2` | absent |
| `sentences_detailed.tar.bz2` | absent |
| `jpn_sentences.tsv` | absent |
| `tatoeba_links.tsv` | absent |
| any `.tsv` on the filesystem | absent (0 matches) |
| any compressed/archive candidate | absent |
| any Tatoeba acquisition/provenance manifest | absent |

No path, byte size, mtime, MIME type, or SHA-256 can be recorded — no candidate exists.
Nothing was renamed (§2A).

### 2B — Repository History

Shallow state **explicitly detected** (`true`, depth 1), so local history was **not** treated
as proof of absence. Authoritative remote history was inspected (authorized; GitHub API):

```
commits ever touching data/tatoeba                                   → 0
tatoeba / sentences*.tsv paths in complete tree                      → 0
remote branches containing a Tatoeba artifact (of 8)                 → 0
PRs containing a Tatoeba artifact (of 9, all states)                 → 0
```

The 10 commits matching `path=data` are unrelated scaffold add/remove operations
(`.dockerignore`, `.env.example`, `.github/workflows/*`, `Dockerfile`, `README.md`) —
individually inspected, no sentence artifact among them.

### 2C — Existing Provenance Registration

`upstream:tatoeba:2024-07` **exists** (`registry.ts:125`). **Reused — no duplicate source
identity created** (§2C, §4).

| Field | Value | Status |
| :--- | :--- | :--- |
| source ID | `upstream:tatoeba:2024-07` | registered |
| source type | `upstream` | registered |
| namespace | `upstream:tatoeba` | registered |
| version | `2024-07` | **UNVERIFIED** |
| release date | `2024-07-01` | **UNVERIFIED** |
| license | `CC-BY-2.0-FR` | registered |
| URL | `https://tatoeba.org` | **UNREACHABLE** |
| attribution | "Tatoeba Project (tatoeba.org) contributors under Creative Commons BY 2.0 FR" | registered |
| domain | `sentence` | registered |
| target tables | `["example_sentences"]` | registered |
| status | `active` | registered |
| alias | `tatoeba:corpus:2024-07` → `upstream:tatoeba:2024-07` | registered |

Per §4, no metadata was silently corrected: `version` and `releaseDate` are marked
**UNVERIFIED** rather than replaced.

> **A registry entry DOES NOT prove that an artifact was acquired** (§2C). The entry carries
> no checksum, byte size, or record count, and no field in it derives from an inspected file.

### 2D — Approved Official Acquisition

| Approved endpoint | Result |
| :--- | :--- |
| `https://downloads.tatoeba.org/exports/` | **HTTP 000** |
| `https://downloads.tatoeba.org/exports/per_language/jpn/` | **HTTP 000** |
| `https://tatoeba.org` | **HTTP 000** |

All fail with `SSL_ERROR_SYSCALL`. Control probes confirm the sandbox is not simply offline:
`github.com` → 200, `registry.npmjs.org` → 200. Egress is an allowlist admitting GitHub and
package registries only; all `tatoeba.org` hosts are filtered.

No approved repository-hosted artifact exists either: Tatoeba's official GitHub organisation
is reachable but hosts **software only** (§0 rule 15; 0 release assets across `tatoeba2`,
`tatoeba-api`, `tatodb`, `horus`).

**Per §2D: STOP. No fabrication performed.**

Prohibited sources — **none used**: random mirrors · Kaggle · Hugging Face · npm · PyPI ·
scraped datasets · unofficial GitHub repos · synthetic corpus. §0 rules 15 and 16 are
notable here: package registries **are** reachable, so bypassing the blocked official source
via npm/PyPI was technically possible and was **deliberately not done**.

```
ACQUISITION_STATUS: BLOCKED — OFFICIAL SOURCE UNREACHABLE
```

---

## §4. §3 Historical SHA Handling

```text
SHA_STATUS = NOT_VERIFIED
```

The historical SHA `d2297821…038d0b` is treated as an **unverified historical claim** (§3).
No artifact exists to hash, so no comparison was possible. Per §3, `SHA = d229...` was
**not** written into any manifest, report field, or code merely because an older report
asserted it. Full reconciliation: `reports/gates/PHASE-14.5A-HISTORICAL-RECONCILIATION.md`.

---

## §5. §7–§15 Execution Gates

| § | Requirement | Result |
| :--- | :--- | :--- |
| §5 | Official artifact acquisition | **NOT EXECUTED** — §2D gate failed |
| §6 | Acquisition manifest contract | **NOT PRODUCED** — measured fields would be placeholders (§6 forbids `TBD`/`UNKNOWN`) |
| §7 | Two independent SHA-256 calculations | **NOT PERFORMED** — no artifact |
| §8 | Raw corpus characterization | **NOT MEASURED** — no artifact; no expected count assumed |
| §9 | Tatoeba record model audit | **BLOCKED** — actual upstream fields unobservable |
| §10 | Japanese identification from language metadata | **BLOCKED** — no records |
| §11 | Translation relationship model | **BLOCKED** — no records; no `links.tsv` |
| §12 | Database compatibility audit | **COMPLETE** — schema change required; see below |
| §13 | Existing sentence pipeline audit | **COMPLETE** — 7 defects documented |
| §14 | Provenance binding | **NOT PRODUCED** — no records |
| §15 | Deterministic raw record digest | **NOT COMPUTED** — no records |

### §12 — Schema Necessity (completed)

`example_sentences` **cannot** safely store Tatoeba records: `reading`, `english`, and
`jlpt_level` are all `NOT NULL`, there is no upstream-ID column, no relationship model, no
raw-text field, no artifact binding, and no indexes.

```
SCHEMA CHANGE REQUIRED — USER AUTHORIZATION NEEDED
Migration executed: NO (stopped before migration, per §12)
```

Full analysis — current limitation, exact requirement, minimum proposed change, six
alternatives considered, migration implications, rollback strategy — in
`reports/gates/PHASE-14.5A-SCHEMA-NECESSITY.md`.

### §13 — Sentence Pipeline Audit (completed, not repaired)

| Defect | Location | Policy violated |
| :--- | :--- | :--- |
| Fabricates readings — `reading = cleanText(raw.reading) \|\| japanese` | `transformer.ts:52` | §9 — explicitly prohibited |
| Assigns unsupported JLPT + injects `jlpt:` tags | `transformer.ts:54,71-72` | §10 |
| **Rejects** a sentence lacking English (`if (!english) errors.push(...)`) | `transformer.ts:48-50` | §11 — untranslated must be retained |
| Assumes one translation (`english: text` column) | `schema.ts:754` | §11 |
| O(N×M) matching — `japanese.includes(headword)` over the full corpus | `matcher.ts` | §13 |
| Swallows DB errors — bare `catch {}` around matcher load | `pipeline.ts:46-49` | §13 |
| Upstream ID embedded in a derived key (`es-tat-${tatoebaId}`), not preserved as a source field | `transformer.ts:81` | §9 |

All are **downstream inputs to Phase 14.5B/14.5C** and were **not silently repaired** (§13).

---

## §6. §16/§17/§18 Database Safety

```text
DATABASE WRITES:    0
SCHEMA MIGRATIONS:  0
PRODUCTION ACCESS:  0

CANONICAL_INVARIANTS = BLOCKED — DATABASE UNAVAILABLE
```

| Check | Result |
| :--- | :--- |
| `DATABASE_URL` | `<unset>` |
| Port 5432 | **CLOSED** (`ECONNREFUSED`) |
| `psql` | not installed |
| Safe/disposable DB available | **NO** |
| Production Supabase / pooler / Vercel DB contacted | **NO** — no connection attempted |
| `db:push` / `db:migrate` / bulk insertion run | **NO** |
| Canonical sentence persistence performed | **NO** (§0 rule 27) |
| Bulk ingestion performed | **NO** (§0 rule 26) |

Per §17, canonical invariants are reported as **`BLOCKED — DATABASE UNAVAILABLE`** and are
**not** reported as verified. No database connection was opened during this phase.

### §18 Canonical Count Context

Per §18, the three scopes are kept distinct and no previously reported number is hard-coded
as truth. These are **documented** values from Phase 14.4E, not values measured in this phase:

```
dictionary_entries total          206,747   ← PHASE-14.4E-FINAL-GATE-REPORT.md:7,21
  upstream:jmdict:2023-08         206,717   ← JMdict subset
  first-party:dictionary-core:v1       30
  test pilot entries                    2
kanji_entries     13,108
kanji_radicals        63
kanji_composition     90
```

Because no database is available, these were **not measured during R3** and are recorded as
documented context only.

---

## §7. §19 Test Design

**No test file was created.** §19 authorizes
`tests/tatoeba-provenance-acquisition.test.ts` "only after a real artifact exists," and the
required cases (artifact existence, SHA verification, Japanese identification, malformed
records, untranslated handling, relationship preservation, digests, second-run equivalence)
all operate on artifact data that does not exist.

Per §19: "Do NOT create fake green tests that substitute for an absent artifact." No
fixture-based substitute suite was written.

---

## §8. §20 Regression Results

Run fresh this phase:

| Command | Result |
| :--- | :--- |
| `npx vitest run --fileParallelism=false` | **62 failed \| 551 passed \| 102 skipped (715)** · 18 failed \| 20 passed (38 files) |

| Category | Count |
| :--- | :--- |
| **Baseline (pre-phase)** | 62 failed / 551 passed / 102 skipped |
| **New failures introduced by this phase** | **0** |
| **Existing failures** | 62 — all environmental/pre-existing |
| **Attributable to Phase 14.5A-R3** | **0** — no 14.5A-R3 runtime code exists |

Breakdown of existing failures: 39 × `DATABASE_URL is required` · 1 ×
`ECONNREFUSED 127.0.0.1:5432` · 4 × missing ETL artifacts (`data/kanjidic2.xml`,
`data/kanjivg`) · remainder pre-existing DB-dependent assertions (e.g. Phase 14.4E's own
suite is 18/24 failing without a database).

Per §20, `all tests passed` is **not** claimed — it would be false. No test was weakened,
skipped, or suppressed (§0 rules 20, 21).

---

## §9. §21 Toolchain Verification

| Command | Result |
| :--- | :--- |
| `npm run typecheck` | **PASS** (0 errors) |
| `npm run lint` | **PASS** (0 errors, 4 pre-existing warnings) |
| `npx drizzle-kit check` | **PASS** — "Everything's fine 🐶🔥" (0 migrations required) |
| `npm run build` | **PASS** |

No unrelated failure was modified (§21).

---

## §10. §22 Repository Change Boundary

| Path | Change |
| :--- | :--- |
| `data/tatoeba/**` | **none** — no artifact |
| `reports/gates/**` | +4 documents (this report, artifact reconciliation, schema necessity, historical reconciliation) |
| `docs/architecture/**` | 2 documents updated |
| `tests/tatoeba-provenance-acquisition.test.ts` | **not created** (§19 precondition unmet) |
| Application runtime code (`src/**`) | **0 modifications** |
| DB schema / migrations | **0 modifications** — `drizzle/` unchanged |

No UI changes. No learner/SRS/XP changes. No CMS changes (§0 rules 9, 10). No AI changes. No
search changes. No previous gate report deleted (§0 rule 22). Existing UI, application
architecture, and provenance architecture preserved (§0 rules 23, 24). Zero schema changes
(§0 rule 25).

---

## §11. §23 Architecture Documentation

| Document | Status |
| :--- | :--- |
| `docs/architecture/TATOEBA-ACQUISITION.md` | **UPDATED** — source, official acquisition method, artifact structure, acquisition process, integrity model, reproducibility, licensing, attribution, downstream boundaries |
| `docs/architecture/TATOEBA-PROVENANCE-MODEL.md` | **UPDATED** — provenance chain and acquisition-vs-persistence distinction |

---

## §12. §24 Final Gate Conditions

| Condition | Result |
| :--- | :--- |
| Real official artifact exists | **BLOCKED** |
| Artifact SHA independently measured | **BLOCKED** |
| Source identity verified | **NOT VERIFIABLE** |
| License verified | **REGISTERED** (not independently verified) |
| Attribution verified | **REGISTERED** (not independently verified) |
| Artifact reproducible | **BLOCKED** |
| Deterministic digest matches across two runs | **NOT COMPUTED** |
| Raw metrics actually measured | **NOT MEASURED** |
| Relationship structure preserved | **BLOCKED** |
| No fabricated metadata | **PASS** |
| No production DB access occurred | **PASS** |
| No canonical mutations occurred | **PASS** (no connection; not empirically verified) |
| No migrations occurred | **PASS** |
| Focused tests pass | **NOT CREATED** (§19 precondition unmet) |
| Typecheck passes | **PASS** |
| Lint passes | **PASS** |
| Drizzle check passes | **PASS** |
| Build passes | **PASS** |
| Regression honestly reported | **PASS** |
| Acquisition manifest complete | **NOT PRODUCED** (§6 forbids placeholders) |
| Architecture documentation complete | **PASS** |

Per §24, GO requires every condition. Not one artifact-dependent condition holds.

---

## §13. §26 14.5B Handoff Contract — Current State

| Required for 14.5B | Status |
| :--- | :--- |
| artifact path | ✗ not available |
| artifact SHA-256 | ✗ not measured |
| verified source ID | ~ registered, acquisition unverified |
| verified version | ✗ UNVERIFIED |
| verified license | ~ registered only |
| verified attribution | ~ registered only |
| raw record count | ✗ NOT MEASURED |
| Japanese record count | ✗ NOT MEASURED |
| relationship count | ✗ NOT MEASURED |
| deterministic acquisition digest | ✗ NOT COMPUTED |
| upstream sentence IDs | ✗ none |
| raw sentence text | ✗ none |
| raw language metadata | ✗ none |
| raw relationship metadata | ✗ none |

**Handoff NOT satisfied. Per §29 and §30, Phase 14.5B is NOT AUTHORIZED.**

---

## §14. Created Files

| File | §ref |
| :--- | :--- |
| `reports/gates/PHASE-14.5A-R3-FINAL-GATE-REPORT.md` | §24, §28, §30 |
| `reports/gates/PHASE-14.5A-HISTORICAL-RECONCILIATION.md` | §27 |
| `reports/gates/PHASE-14.5A-SCHEMA-NECESSITY.md` | §12 |
| `reports/gates/PHASE-14.5A-R2-ARTIFACT-AUDIT.md` (prior session) | §2 |
| `reports/gates/PHASE-14.5A-R2-FINAL-GATE-REPORT.md` (prior session) | §24 |
| `docs/architecture/TATOEBA-ACQUISITION.md` | §23 (updated) |
| `docs/architecture/TATOEBA-PROVENANCE-MODEL.md` | §23 (updated) |

**Application files modified: 0.**

---

## §15. Known Limitations

1. **No Tatoeba artifact exists**, and none is obtainable: official endpoints return HTTP 000.
2. **Official source unreachable**; bypassing is prohibited (§2D), including via reachable
   npm/PyPI registries.
3. **No approved repository-hosted artifact exists** — Tatoeba's GitHub org is software-only.
4. **Every historical 14.5A claim is unreproducible** and remains unreproduced.
5. **`LATEST_VERIFIABLE_PHASE = 14.4E`** — the referenced Phase 14.4F does not exist.
6. **Canonical invariants BLOCKED** — no database; `data/JMdict.xml` absent, so no corpus
   could be provisioned either.
7. **Schema change required** before any persistent sentence storage (§12 report).
8. **Regression baseline red for environmental reasons** — no phase can currently pass §20's
   implicit expectation of a green suite.

---

## §16. Final Verdict

```
=============================================================================
BLOCKED — PHASE 14.5A TATOEBA ACQUISITION & PROVENANCE FOUNDATION NOT VERIFIED
=============================================================================

ARTIFACT:            NOT AVAILABLE
SOURCE:              registered but acquisition not verified
SHA:                 NOT VERIFIED
RAW RECORDS:         NOT MEASURED
JAPANESE RECORDS:    NOT MEASURED
RELATIONSHIPS:       NOT MEASURED
DIGEST:              NOT COMPUTED

DATABASE WRITES:     0
SCHEMA MIGRATIONS:   0
PRODUCTION ACCESS:   0
CANONICAL MUTATIONS: 0 (no connection opened; not empirically verified)
FABRICATED METADATA: 0
SUBSTITUTE SOURCES:  0
PREVIOUS REPORTS DELETED: 0

Typecheck:  PASS       Lint:  PASS
Drizzle:    PASS       Build: PASS
Regression: 62 failed | 551 passed | 102 skipped (715) — pre-existing, 0 attributable

LATEST_VERIFIABLE_PHASE = 14.4E

14.5B: NOT AUTHORIZED
=============================================================================
```

Unblocking requires one of:

- **A** — the official Tatoeba artifact placed in the workspace, or platform-level egress
  authorization for `downloads.tatoeba.org`; or
- **B** — explicit user authorization of an alternative source, with the provenance model
  updated accordingly (§2D permits this only with explicit authorization).

Note that option **B** would invalidate the historical 154/79/72/7/0 figures regardless, since
those cannot describe a genuine Tatoeba release (see historical reconciliation §5).

**HARD STOP.** Phase 14.5B not started. No normalization performed. No canonical sentence
persistence. No bulk ingestion. No sentence normalization, vocabulary linkage, longest-match
extraction, JLPT classification, reading generation, grammar or phrase extraction,
synonym/antonym generation, or translation selection (§25). The user will authorize Phase
14.5B explicitly in a separate session (§29).
