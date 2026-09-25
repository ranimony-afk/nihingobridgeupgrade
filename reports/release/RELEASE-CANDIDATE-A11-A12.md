# RELEASE CANDIDATE — MOBILE DICTIONARY SEARCH (A11 + A12 + A13 appends)

**Gate label:** `RELEASE-CANDIDATE-0`. **Date:** 2026-09-25.
**Branch:** `arena/01a0d21c-nihingobridgeupgrade` (contains Tatoeba 14.5A reconciliation `12e2d84`; main
is `cfe565d`; the branch is 1 commit ahead and **0 commits behind** — the release candidate is applied
on top of it).
**References:** A11 report, A11.5 durability manifest/handoff, A12 hardening + capability reports,
A13 decision report, `docs/api/MOBILE-DICTIONARY-SEARCH-PRODUCTION-STATUS.md` (production guard).

---

## §1 The two decisions, stated separately

| Decision | Verdict | Basis |
| :--- | :--- | :--- |
| **Open a PR for review** | **YES — DONE** | PR **#11** — https://github.com/ranimony-afk/nihingobridgeupgrade/pull/11 (open, head `arena/01a0d21c-nihingobridgeupgrade` @ `2bdd8ea`, base `main`). The candidate is complete, self-consistent, and verified locally: 73/73 mobile tests, typecheck clean, lint 0 errors, production build green, 26/26 release smoke checks. |
| **Merge the PR** | **NO — under the stated acceptance gate** | One mandatory item is **not satisfied**: *"CI passes on PR branch"*. CI is red **on `main` itself** and, on the PR, produces **exactly the same failure annotations as main** — 0 new failure signatures (§6). Merging would require either accepted-risk sign-off for a red suite or a CI policy change — neither is mine to take. |
| **Public production exposure** | **NO** | D-13 abuse protection remains unapproved; the endpoint's worst measured case is 17.1 s of database work per request. See the production guard. |

These are three independent decisions. A red suite caused by missing corpus bytes is not a defect in
this slice; an unthrottled public endpoint is not a defect either — but neither may be silently
declared ready.

## §2 What the candidate contains (exact path list)

**Executable (10 paths)** — these are the *dependency closure* of the mobile route, computing by
import graph, not a hand-picked list. Every one of them is either new or differs from `main`:

| Path | State vs main | Role |
| :--- | :--- | :--- |
| `src/app/api/v1/mobile/dictionary/search/route.ts` | new, 125 L `5523860e48c88329` | the GET-only route (A11) |
| `src/app/api/v1/mobile/dictionary/search/_lib.ts` | new, 130 L `b8a575399b8f9986` | projection / cap / language adapter (A11+A12) |
| `src/types/mobileDictionary.ts` | modified, 353 L `aece3af08cb9300d` | frozen mobile types (A10 alignment) |
| `src/services/search/types.ts` | modified, 57+/8− | six-member `SearchScript` (A7 freeze) |
| `src/services/search/matcher.ts` | modified, 72+/2− | canonical script detection + LIKE escaping (A7) |
| `src/services/dataquality/jlptChecks.ts` | modified, 48+/17− | `classifyJlptLevel` tri-state (A9) |
| `src/lib/japanese/kanjiText.ts` | new, 134 L | canonical kanji primitives, de-duplicated (Gate 6) |
| `src/etl/grammar/types.ts` | modified, 37+/4− | anchored JLPT normalization (A1) |
| `tests/mobile-dictionary-search-api.test.ts` | new, 1180 L `8d258fb1d049c3c6` | 64 DB-free contract tests (42 A11 + 17 A12 + 5 A13) |
| `tests/mobile-dictionary-search-api-live.test.ts` | new, 307 L `a787c36bcd42fd1f` | 9 disposable-DB tests (7 A11 + 2 A13) |

**Release-readiness additions (2 paths, new in this patch):**

| Path | Purpose |
| :--- | :--- |
| `docs/api/MOBILE-DICTIONARY-SEARCH-PRODUCTION-STATUS.md` | production guard / status declaration (documentation only, no runtime effect) |
| `scripts/release-smoke-mobile-dictionary.mjs` | dependency-free release smoke test (exit-code driven) |

**Documentation and evidence (8 paths):** the API contract (now 1 042 L `3e56b84b8b393fab`, carrying
A10/A11/A12/A13 sections) and the gate reports `GATE-A11-*`, `GATE-A11.5-*`, `A11.5-DURABILITY-MANIFEST`,
`A11-TO-A12-HANDOFF`, `GATE-A12-*` (both), `GATE-A13-*`, `A13-TO-A14-HANDOFF`.

**Why the contract and tests are the A13 state, not the A12 state.** The working tree holds the A13
artifacts (contract 946 → 1 042 lines, tests +7). Shipping the earlier 946-line contract or the
1 031-line test file would mean regenerating a superseded file from memory — forbidden. The A13 deltas
are strictly additive and change **no runtime behaviour**: the contract append only *documents* the
ordering mechanism, and the test additions are new assertions.

## §3 What is deliberately excluded (proof, not intent)

Excluded and confirmed absent from the candidate: 14.4D/14.4E/14.5A/14.5B work, Tatoeba
(`data/tatoeba/*` untouched — 5 archives), KanjiVG, JMdict/KANJIDIC2 ingestion or ETL, schema and
migrations (4 migrations, `0000`–`0003`, unchanged; `src/db/schema.ts` carries only its pre-existing A2
comment diff and is **not** in the candidate), SRS, CMS, AI/tutor, translation, gamification, and the
web dictionary routes (`src/app/api/dictionary/**`: 0 modifications).

Verification method: `git status --porcelain -uall` on the working tree, filtered to the candidate
list; every excluded path remains local-only and unstaged. The candidate was proven self-consistent in
an **isolated clone of the real remote head** (§5), so nothing outside the list is required.

## §4 PR acceptance gate — item-by-item result

| # | Item | Result | Evidence |
| :-: | :--- | :--- | :--- |
| 1 | A11 files present | **PASS** | route + adapter + mocked tests + contract |
| 2 | A12 files present | **PASS** | A12 deltas live inside those files + 2 A12 reports |
| 3 | A11 hashes verified | **PASS** | route `5523860e48c88329`, `_lib` `b8a575399b8f9986` — identical to A12 |
| 4 | A12 authorized changes verified | **PASS** | cap + guards present; contract §A12.1/§A12.6/§A12.7 |
| 5 | No unrelated files staged | **PASS** | exact path list in §2; verified with `git diff --cached --name-only` |
| 6 | `package.json` unchanged | **PASS** | 0 diff vs main |
| 7 | `package-lock.json` unchanged | **PASS** | 0 diff vs main; `npm ci` clean twice |
| 8 | Schema unchanged by this PR | **PASS** | `src/db/schema.ts` not in candidate; migrations untouched |
| 9 | Migrations unchanged | **PASS** | 4 migrations before and after |
| 10 | Web dictionary routes unchanged | **PASS** | 0 modified paths under `src/app/api/dictionary/**` |
| 11 | GET search route only | **PASS** | 1 mobile route; nothing else added |
| 12 | Non-GET methods → 405 | **PASS** | POST/PUT/PATCH/DELETE all 405 (smoke + live server log) |
| 13 | Missing `q` → 400 `MISSING_QUERY` | **PASS** | smoke + mocked test |
| 14 | `q=1000` accepted | **PASS** | smoke + mocked boundary tests |
| 15 | `q=1001` → 400 `VALIDATION_ERROR` | **PASS** | smoke + mocked boundary tests; no `details`, no `stack` |
| 16 | `limit` boundary verified | **PASS** | `limit=1/100/201` → applied `1/100/100` |
| 17 | `offset` boundary verified | **PASS** | `offset=100001` → applied `100000`; `offset=-1` → `0` |
| 18 | `targetLanguage` remains inert | **PASS** | byte-identical bodies for en/ta/ml/klingon/empty |
| 19 | Closed 9-field projection verified | **PASS** | exact key-set assertions (`Object.keys`) |
| 20 | `sourceRef` absent | **PASS** | key-set + leakage scan |
| 21 | `ent_seq` absent | **PASS** | key-set + leakage scan |
| 22 | `frequencyRank` absent | **PASS** | key-set + leakage scan |
| 23 | `partsOfSpeech` absent | **PASS** | key-set + leakage scan |
| 24 | `tags` absent | **PASS** | key-set + leakage scan |
| 25 | No raw-row spread | **PASS** | hand-built projection; `{...row}` appears only in the docblock forbidding it |
| 26 | No internal error leakage | **PASS** | fixed `INTERNAL_ERROR` literal; stack/SQL/host/password scans clean |
| 27 | No detail endpoint | **PASS** | `/api/v1/mobile/dictionary/entry/de-mizu` → 404 |
| 28 | No localization | **PASS** | `localizedGlosses`/`glosses` absent; parser inert |
| 29 | No schema/migration/index change | **PASS** | 0 migrations, 0 indexes, 0 SQL |
| 30 | Tatoeba untouched | **PASS** | 5 archives unmodified |
| 31 | KanjiVG untouched | **PASS** | 11 658 SVGs unmodified; `M tests/kanjivg-etl.test.ts` is a pre-existing session diff, excluded |
| 32 | Full regression passes | **FAIL** | main itself fails 43 tests in this environment; candidate 46; delta proven pre-existing (§6). 73/73 mobile tests pass |
| 33 | Typecheck passes | **PASS** | `tsc --noEmit` — no diagnostics, locally and in the isolated clone |
| 34 | Lint passes | **PASS** | 0 errors / 4 pre-existing warnings |
| 35 | Drizzle check passes | **PASS** | `drizzle-kit push --force` exit 0 against the disposable instance |
| 36 | Production build passes | **PASS** | `next build` complete in the isolated clone |
| 37 | D-13 production exposure remains blocked | **PASS** | guard document + no limiter claimed anywhere |
| 38 | CI passes on PR branch | **FAIL** | red on `main` for pre-existing reasons (§6); not satisfiable without corpus bytes or weakening tests |

**Result: 36 PASS / 2 FAIL.** The two failures are environmental and pre-existing; per the stated rule
("one failed mandatory item = PR not merge-ready"), **merge-readiness is NO**.

## §5 Local verification evidence (all commands executed)

Environment: disposable `PGlite` on `127.0.0.1:5432` (data `/tmp/pg-rc0`), `npm ci` (444 packages,
lockfile unchanged), `drizzle-kit push --force` exit 0. No production contact.

| Check | Command | Result |
| :--- | :--- | :--- |
| Release smoke (live server) | `node scripts/release-smoke-mobile-dictionary.mjs` | **PASS — 26 passed, 0 failed, 0 skipped** |
| Mobile tests (working tree) | `npx vitest run tests/mobile-dictionary-search-api*.test.ts` | 73 passed (64 + 9) |
| Typecheck (working tree) | `npx tsc --noEmit` | no diagnostics |
| Lint (working tree) | `npm run lint` | 0 errors / 4 warnings |
| **Isolated clone of remote head** | `git checkout origin/arena/01a0d21c-…` (base `12e2d84`) + candidate files only | typecheck **clean**; mobile tests **73/73 passed**; lint **0 errors**; `next build` **green** |

The isolated-clone check is the one that matters for review: it proves the candidate list is a
*self-consistent branch* — not a set of files that only compiles because unrelated local edits are
present. `tsc --noEmit` over the whole repository produced zero diagnostics with **only** main + these
ten executable paths present.

## §6 CI status — recorded honestly, not excused

| Fact | Value |
| :--- | :--- |
| Latest run on `main` | `35964546020` — **failure** (20 h old) |
| Failing step | `Test (P3/P4 — real Vitest run against PostgreSQL)` |
| Steps never reached | Typecheck, Lint, Production build |
| Recent PR runs | PRs #8, #9, #10 — **all failure** |

Failing assertions (read from the check-run annotations, not from logs — the log host is unreachable
from this environment):

| Test | Message | Root cause |
| :--- | :--- | :--- |
| `tests/full-jmdict-ingestion.test.ts` | `SOURCE FILE MISSING: data/JMdict.xml`; `expected +0 to be 206717` | corpus bytes absent in the runner |
| `tests/dictionary-architecture.test.ts:48` | `expected +0 to be 206717` | same |
| `tests/dry-run-jmdict.test.ts:11` | `expected false to be true` | same |
| `tests/kanji-expansion.test.ts:74` | `expected 11 to be 12` | independent pre-existing assertion |

**Full-suite attribution** (identical fresh-database condition for both, 30 tables truncated before
each run):

| Run | Files | Executed | Failed | Skipped |
| :--- | --: | --: | --: | --: |
| pristine `main` (`cfe565d`) | 42 | 854 | **43** | 12 |
| candidate | 44 | 927 | **46** | 12 |
| delta | +2 files | **+73 (all mobile)** | +3 | 0 |

The +3 delta was investigated rather than assumed. In a first pairing it appeared as JMdict/KANJIDIC2/
KanjiVG tests; in a second, identically-conditioned pairing, as three `srs-activation` tests. Running
`srs-activation.test.ts` **alone, on a freshly emptied database, with zero mobile test files in the
run**, produces **4 failed / 8 passed — on pristine `main` (`cfe565d`) and on the candidate alike**.
The pre-existing corpus/SRS suites are therefore order- and state-sensitive in this environment, and
the delta is variance in those tests, not a regression introduced by the candidate. Nothing was
weakened, skipped or deleted to obtain this result; no test assertion was changed anywhere in the
repository.

**CI cannot be made green by this slice.** It requires either supplying the missing corpus bytes to CI
(ingestion is not authorized for this gate) or relaxing those tests (never permitted).

### §6.1 CI on the PR itself (run `36087451278`, head `2bdd8ea`)

| Fact | Value |
| :--- | :--- |
| Run | `36087451278` — `pull_request`, branch `arena/01a0d21c-nihingobridgeupgrade`, 58 s |
| Result | **failure** |
| Failing step | `Test (P3/P4 — real Vitest run against PostgreSQL)` — identical to main |
| Steps never reached | Typecheck, Lint, Production build (same as main; they pass locally) |
| Vercel preview | **pass** — the PR branch builds and deploys as a preview |
| Supabase preview | skipped |

**Failure-annotation comparison — the criterion that actually matters for review.** The PR run and the
main run `35964546020` produce **byte-identical annotation sets**:

| Annotation | main run | PR run |
| :--- | --: | --: |
| `scripts/ingest-full-jmdict.ts:215` (`SOURCE FILE MISSING: data/JMdict.xml`) | 3 | 3 |
| `tests/full-jmdict-ingestion.test.ts:71 / :79 / :340 / :370` | 1 each | 1 each |
| `tests/dictionary-architecture.test.ts:48` (`expected +0 to be 206717`) | 1 | 1 |
| `tests/dry-run-jmdict.test.ts:11` | 1 | 1 |
| `tests/kanji-expansion.test.ts:74` (`expected 11 to be 12`) | 1 | 1 |

**New CI failure signatures introduced by this PR: 0.** The suite fails earlier on `main` for reasons
that have nothing to do with the mobile dictionary surface, and the slice neither adds nor removes a
single failure annotation.

**Branch protection:** not verifiable with the available token —
`GET /repos/…/branches/main/protection` returns **403 `Resource not accessible by integration`**. Whether
`main` requires green checks before merge is therefore **NOT VERIFIED** from this session, and is
recorded as such rather than assumed.

## §7 Merge decision and what would change it

**Merge: NO today.** Not because the slice is defective, but because the stated gate requires a green
CI on the PR branch and CI is red on `main`. Two acceptable routes, both needing a decision that is not
mine:

1. **Policy route** — accept a documented exception: "CI red for pre-existing corpus reasons; this PR
   adds 73 passing tests and 0 new CI failure annotations versus main". Requires a named approver.
2. **Repair route** — a separate, authorized gate fixes the CI corpus/test conditions on `main` first,
   then this PR re-runs green.

**Public production exposure: NO**, independent of the merge decision — D-13. The endpoint remains
`safe to merge, safe to run in non-production, not approved for public exposure`, exactly as the
production guard states.

## §7.1 Remote state after this patch

| Item | Value |
| :--- | :--- |
| Branch | `arena/01a0d21c-nihingobridgeupgrade` @ `2bdd8ea` (parent `12e2d84`; fast-forward push, no force) |
| Pull request | **#11** open — https://github.com/ranimony-afk/nihingobridgeupgrade/pull/11 |
| Diff vs `main` | 23 files, +8 617 / −43 (22 candidate paths + the branch's pre-existing `12e2d84` Tatoeba report, which is documentation only; see the PR body note) |
| CI | run `36087451278` **failure** — same failure set as main, 0 new signatures |
| Vercel | preview check **pass** (a preview deployment; it was **not** probed, and no Vercel setting was changed) |
| Supabase preview | skipped |
| Branch protection | **NOT VERIFIED** — API returns 403 for the available token |
| Production | not contacted |

## §8 Evidence identity (`LOCAL INFORMATIONAL HASH — NOT DURABLE UNLESS VERIFIED`)

| Artifact | Lines | SHA-256 (first 16) |
| :--- | :-: | :--- |
| `src/app/api/v1/mobile/dictionary/search/route.ts` | 125 | `5523860e48c88329` |
| `src/app/api/v1/mobile/dictionary/search/_lib.ts` | 130 | `b8a575399b8f9986` |
| `src/types/mobileDictionary.ts` | 353 | `aece3af08cb9300d` |
| `tests/mobile-dictionary-search-api.test.ts` | 1 180 | `8d258fb1d049c3c6` |
| `tests/mobile-dictionary-search-api-live.test.ts` | 307 | `a787c36bcd42fd1f` |
| `docs/api/MOBILE-DICTIONARY-API-CONTRACT.md` | 1 042 | `3e56b84b8b393fab` |
| `reports/gates/GATE-A12-MOBILE-DICTIONARY-HARDENING.md` | 840 | `d26026298905ba7e` |
| `reports/gates/GATE-A12-MOBILE-DICTIONARY-CAPABILITY-EXPANSION.md` | 611 | `98ef6106a2868f09` |
| `reports/gates/GATE-A11-MOBILE-DICTIONARY-SEARCH-API.md` | 773 | `c114d3d1fe1d79d0` |
| `reports/gates/A11.5-DURABILITY-MANIFEST.md` | 269 | `3b6a86d92bde76d8` |
| `reports/gates/A11-TO-A12-HANDOFF.md` | 243 | `1040e109067ee03f` |
| `reports/gates/GATE-A11.5-DURABILITY-TRANSITION.md` | 524 | `728c8cfe7fb766c0` |
| `reports/gates/GATE-A13-MOBILE-DICTIONARY-PRODUCTION-READINESS.md` | 658 | `fa1474d70e83b719` |
| `reports/gates/A13-TO-A14-HANDOFF.md` | 160 | `9a7ba7603543df6d` |

Remote state at authoring time: branch `arena/01a0d21c-nihingobridgeupgrade` = `12e2d84`
(`main` + Tatoeba 14.5A report), 1 ahead / 0 behind. No PR exists for this branch; all prior PRs
(#1–#10) are merged.

## §9 Reproduce this result

```bash
npm ci --no-audit --no-fund
PG_DATA_DIR=/tmp/pg-rc0 PG_PORT=5432 PG_CLEAN=true npx tsx scripts/run-disposable-pg.ts &
npx drizzle-kit push --force --dialect postgresql --schema ./src/db/schema.ts \
  --url "postgresql://postgres:postgres@127.0.0.1:5432/postgres"
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres npx next dev -H 0.0.0.0 -p 3000 &
node scripts/release-smoke-mobile-dictionary.mjs          # → PASS, 26 checks
npx vitest run tests/mobile-dictionary-search-api.test.ts tests/mobile-dictionary-search-api-live.test.ts
npx tsc --noEmit && npm run lint && npm run build
```
