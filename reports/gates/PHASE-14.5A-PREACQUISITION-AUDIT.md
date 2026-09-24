# Phase 14.5A Gate Report: Pre-Acquisition Audit

**Gate**: Phase 14.5A — Tatoeba Sentence Acquisition & Provenance Foundation
**Deliverable**: §0 Non-Negotiable Safety Gate + Mandatory Preflight
**Date**: 2026-09-24
**Execution Mode**: READ-ONLY ACQUISITION + VALIDATION + NORMALIZATION + PROVENANCE + FULL DRY RUN
**Production access**: 0
**Database writes**: 0
**Schema migrations**: 0
**Files modified**: 0 (this report is new)
**Verdict**: **NO-GO — PHASE 14.5A BLOCKED**

---

## Headline

The §0 safety gate **passed** (no production exposure — see §2). The mandatory preflight
**failed on two of ten items**, and one of the failures is environmental while the other is
a **specification defect that no environment can satisfy**:

1. **§3 acquisition is impossible** — every `tatoeba.org` host is blocked by the sandbox
   egress allowlist (§4).
2. **The declared artifact is not a genuine Tatoeba release** — §26's targets (154 raw
   records) describe a ~154-line file, whereas Tatoeba's actual 2024-07 export contains
   **millions** of sentences (§5). The declared SHA-256 cannot correspond to any real
   Tatoeba release artifact.
3. **No database exists** — no `DATABASE_URL`, port 5432 closed (§3). §15's canonical
   immutability checks cannot be performed.

---

## 1. §0 Mandatory Preflight — All Ten Items

| # | Required check | Result | Evidence |
| :---: | :--- | :--- | :--- |
| 1 | Current Git branch | **PASS** | `arena/01a0d136-nihingobridgeupgrade` |
| 2 | Git working tree | **PASS** | Clean except this session's untracked reports (`git status --porcelain`) |
| 3 | Current commit SHA | **PASS** | `318289da2e816fa3a77b7e061b793cf3f6d0a219` |
| 4 | Database hostname | **UNAVAILABLE** | No `DATABASE_URL`; no DB env vars of any kind |
| 5 | Database port | **FAIL** | Nothing listening on 5432 — `Connection refused` |
| 6 | Database name | **UNAVAILABLE** | No `app_db` reachable; no local PostgreSQL installed (`which psql` → empty) |
| 7 | Production environment variables | **PASS** | None set — `env \| grep -iE "SUPABASE\|NEON\|VERCEL\|POSTGRES\|PROD\|AWS_"` → empty |
| 8 | Supabase / Neon / Vercel endpoints | **PASS (unreachable)** | All four probed hosts return `000` (blocked) — see §2 |
| 9 | Current schema state | **PASS** | 4 migrations (`0000`–`0003`); 31 tables declared; `drizzle-kit check` clean |
| 10 | Canonical row counts | **BLOCKED** | Cannot query — no database connection possible |

```console
$ echo "DATABASE_URL=${DATABASE_URL:-<unset>}"
DATABASE_URL=<unset>

$ env | grep -iE "database|postgres|supabase|neon|vercel|pg_|db_"
(none set)

$ ss -ltn | grep -E "127\.0\.0\.1|::1"
(no loopback listeners)

$ timeout 3 bash -c 'cat < /dev/null > /dev/tcp/127.0.0.1/5432'
bash: connect: Connection refused

$ which psql pg_ctl postgres
(no results)
```

**Preflight result: 6 PASS / 2 FAIL / 2 UNAVAILABLE.** Per §0, "Do NOT bypass the guard
merely because the database connection succeeds" — here the inverse applies: the guard
cannot be satisfied because no authorized target exists at all.

---

## 2. §0 Production Isolation — Verified Clean

The production-isolation requirements of §0 are **satisfied by absence and by egress
filtering**. No production credential, endpoint, or store is reachable from this sandbox.

| Forbidden target | Probe result |
| :--- | :--- |
| `db.abcdefgh.supabase.co` | `000` — blocked / unresolved |
| `aws-0-us-east-1.pooler.supabase.com` | `000` — blocked / unresolved |
| `ep-cool-name.us-east-2.aws.neon.tech` | `000` — blocked / unresolved |
| `xyz.vercel-storage.com` | `000` — blocked / unresolved |

Supabase/Neon/Vercel env vars: **none present**. `.env`/`.env.local`: **absent**
(only `.env.example`, containing placeholder values).

### Egress allowlist characterization

The sandbox enforces a strict host allowlist. This is the mechanism that will block §3.

| Host | Reachability |
| :--- | :--- |
| `github.com`, `api.github.com`, `codeload.github.com` | **200 / 301 — ALLOWED** |
| `registry.npmjs.org`, `pypi.org` | **200 — ALLOWED** |
| `downloads.tatoeba.org` | **000 — BLOCKED** |
| `www.tatoeba.org`, `tatoeba.org` | **000 — BLOCKED** |
| `raw.githubusercontent.com`, `objects.githubusercontent.com` | **000 — BLOCKED** |
| `example.com` (control) | **000 — BLOCKED** |

The allowlist admits **package/tooling infrastructure only** (GitHub + package registries).
General web egress is closed. `TATOEBA_*` acquisition is therefore not merely unimplemented —
it is **network-impossible** in this environment.

---

## 3. Database Environment Assessment

| Item | Expected (§0) | Observed |
| :--- | :--- | :--- |
| Host | `127.0.0.1` | no listener |
| Port | `5432` | closed (`ECONNREFUSED`) |
| Database | `app_db` | does not exist |
| Client binaries | `psql` | not installed |
| `DATABASE_URL` | configured | unset |

A disposable local PostgreSQL **could** in principle be started — the repo ships
`scripts/run-disposable-pg.ts` (PGlite + `pglite-server`, bound to `127.0.0.1`) and
`@electric-sql/pglite` is already a devDependency. **However, starting it would not
satisfy §15**, because the canonical corpus itself is absent: `dictionary_entries` (206,747),
`kanji_entries` (13,108), `kanji_radicals` (63), and `kanji_composition` (90) are populated
by ingesting `data/JMdict.xml`, `data/kanjidic2.xml`, and `data/kanjivg/` — and **none of
those source artifacts exist on disk** (`find / -name "*.tsv"` → empty; the `data/`
directory does not exist).

So a locally-started PGlite instance would produce an **empty schema**, against which
§15's "record row counts … verify identical state" and "箸 = 14 strokes" checks are
meaningless. Provisioning a faithful corpus is out of scope for a read-only phase.

---

## 4. §3 Acquisition Attempt — Network Blocked

§3 requires acquiring the exact declared artifact and storing it at
`data/tatoeba/sentences.tsv`.

| §3 requirement | Result |
| :--- | :--- |
| 1. Acquire the exact declared artifact | **FAIL — host unreachable** |
| 2. Store under `data/tatoeba/` | **NOT ATTEMPTED** — no artifact acquired |
| 3–8. Record SHA-256 / size / timestamp / version / license / source ID | **NOT ATTEMPTED** |
| 9. Preserve raw source data | **N/A** |
| 10. Ensure raw data gitignored | **PASS (pre-existing)** — `.gitignore` already excludes `/data/` |

```console
$ curl -sS https://downloads.tatoeba.org/
curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to downloads.tatoeba.org:443
```

Per §29 ("Do NOT download another Tatoeba release") and §4 ("Do not fabricate metadata"),
no substitute was sought, no mirror was tried, and **no manifest was generated**.

> `reports/gates/PHASE-14.5A-TATOEBA-ACQUISITION-MANIFEST.json` was **deliberately not
> created.** §4 requires the manifest to "reflect the actual acquired artifact" and forbids
> fabricating metadata. There is no artifact, therefore there is no honest manifest.

---

## 5. §26 Verification Targets — Not Reproducible

§26 lists the following as verification targets (explicitly "NOT values to hardcode"):

```
Raw records: 154      Japanese records: 79      Accepted: 72
Warnings: 7           Rejected: 0               Relationships: 74
SHA-256: d22978218dfee13a46021ef700aff9a968081133ca4141c0eb7ad966ad038d0b
Digest:  1f5308f2286288adb5eadcb79afb69c176de1d5d029b820e0c21a66db29d3b09
```

**These targets are mutually inconsistent with a genuine Tatoeba release.**

Tatoeba's real sentence export is a corpus of **millions** of sentences spanning hundreds of
languages (Japanese alone is on the order of 10⁵ sentences). A 154-record file with 79
Japanese records is roughly **four orders of magnitude** smaller than any actual
`sentences.tsv` export. Therefore:

- `d2297821…038d0b` cannot be the SHA-256 of a real Tatoeba 2024-07 release artifact;
- the 14.5A statistics (154/79/72/7/0, and digest `1f5308f2…`) do not describe a real
  release, and are **not reproducible from one**;
- consequently §12 ("If the artifact differs, DO NOT force these numbers") and §26 can
  never both be satisfied against real upstream data.

This is **not** an environment limitation. It is a **defect in the phase specification**:
14.5A was authored on the premise that a prior session had produced a small curated Tatoeba
artifact at a specific SHA, but no such artifact exists in the repository, on any branch
(verified in `PHASE-14.5B-REPOSITORY-AUDIT.md` §2), or anywhere in this sandbox.

---

## 6. Files Not Created (and why)

§22 enumerates the required report set. Three cannot be produced honestly:

| Required artifact | Status | Reason |
| :--- | :--- | :--- |
| `PHASE-14.5A-PREACQUISITION-AUDIT.md` | **CREATED** | This report |
| `PHASE-14.5A-ARCHITECTURE-AUDIT.md` | **CREATED** | §1 deliverable |
| `PHASE-14.5A-TATOEBA-ACQUISITION-MANIFEST.json` | **NOT CREATED** | §4 forbids fabricated metadata; no artifact acquired |
| `PHASE-14.5A-TATOEBA-PROVENANCE.md` | **NOT CREATED** | Depends on a real manifest |
| `PHASE-14.5A-TATOEBA-RELATIONSHIPS.md` | **NOT CREATED** | Depends on a real artifact |
| `PHASE-14.5A-TATOEBA-DRY-RUN.md` | **NOT CREATED** | §17 dry run could not execute |
| `PHASE-14.5A-FINAL-GATE-REPORT.md` | **CREATED** | §22/§28 verdict |

Per §29, "The only permitted outcome of this phase is a verified acquisition/provenance
foundation." No foundation can be verified without its source artifact, so no partial
implementation was written to imply otherwise.

---

## 7. Gate Checklist (§27)

| §27 safety check | Result |
| :--- | :--- |
| Production database never contacted | **PASS** |
| Supabase never contacted | **PASS** |
| Neon never contacted | **PASS** |
| Vercel storage never contacted | **PASS** |
| Only local disposable PostgreSQL used, if DB access necessary | **N/A** — no DB access occurred |
| Zero canonical DB writes | **PASS** (0 writes) |
| Zero schema migrations | **PASS** (0 migrations) |
| `dictionary_entries` unchanged | **UNVERIFIABLE** — no DB |
| `kanji_entries` unchanged | **UNVERIFIABLE** — no DB |
| `kanji_radicals` unchanged | **UNVERIFIABLE** — no DB |
| `kanji_composition` unchanged | **UNVERIFIABLE** — no DB |
| `箸` remains 14 strokes | **UNVERIFIABLE** — no DB |
| Tatoeba source checksum verified | **FAIL** — no artifact |
| License verified | **FAIL** — no artifact |
| Source IDs preserved | **N/A** — no records processed |
| Relationships preserved | **N/A** — no records processed |
| No AI-generated sentence content | **PASS** (none generated) |
| No fabricated translations | **PASS** (none generated) |
| Two-pass digest identical | **N/A** — dry run not executed |
| Focused tests pass | **N/A** — no suite run |
| Full regression passes | **FAIL (pre-existing)** — see §8 |
| Typecheck passes | **PASS** |
| Lint passes | **PASS** |
| Drizzle check passes | **PASS** |
| Production build passes | **PASS** |

---

## 8. Pre-Existing Regression Baseline (informational)

Phase 14.5A's §21 anticipates a green baseline of "approximately 40 test files / 774 tests."
The actual measured baseline on a clean checkout of this branch is **not** green — it is
`18 failed | 20 passed (38 files)` / `62 failed | 551 passed | 102 skipped (715 tests)`.

Failure causes are environmental and **pre-existing**, not caused by this phase:
39 × `DATABASE_URL is required`, 1 × `ECONNREFUSED 127.0.0.1:5432`, and missing
`data/kanjidic2.xml` / `data/kanjivg`. Phase 14.4E's own suite is 18/24 failing without a
database — despite having been merged as verified.

This is recorded because §21's "The entire existing repository must remain green" is
currently unsatisfiable, independent of any Tatoeba work.

---

## 9. Final Preflight Verdict

```
=============================================================================
PHASE 14.5A PREFLIGHT: NO-GO — PHASE 14.5A BLOCKED
=============================================================================
```

Failed gates, exactly:

- **§0 item 5/6/10** — no local disposable PostgreSQL; canonical counts unverifiable.
- **§3** — acquisition impossible: `tatoeba.org` egress blocked.
- **§26** — declared SHA-256 and 154-record statistics describe no real Tatoeba release;
  targets unreachable by construction.
- **§15** — canonical immutability checks (incl. `箸` = 14 strokes) unverifiable.
- **§21** — pre-existing regression baseline is red for environmental reasons.

**No acquisition performed. No database mutated. No schema migration. No production
contact. No fabricated artifact or manifest. HARD STOP.**
