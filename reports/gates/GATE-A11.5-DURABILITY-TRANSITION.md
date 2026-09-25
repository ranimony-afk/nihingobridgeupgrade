# GATE A11.5 — POST-IMPLEMENTATION DURABILITY, EVIDENCE & A12 HANDOFF

**Gate:** A11.5 (read-only audit — no implementation)
**Date:** 2026-09-24
**Verdict:** **PASS WITH CONDITIONS** (§14)

A11.5 established an immutable, evidence-based starting point for A12 after repeated `.git` layer
resets. It implemented nothing, modified no application file, and repaired no blocker — by design.

---

## 1. Purpose

```text
READ-ONLY APPLICATION AUDIT
+ EVIDENCE PRESERVATION
+ A12 HANDOFF FREEZE
```

The question A11.5 answers: *does the surviving working tree still contain a verified A11
implementation that matches the frozen A10 contract, and can A12 start from it without relying on
Git history?* Answer: **yes**, with the conditions in §14.

---

## 2. Gate 0 — preserve-first git audit

| Item | Measured |
| :--- | :--- |
| `git status --short` | 37 `??` + 31 `M` = **68 entries** (38 untracked files expanded) |
| `git branch --show-current` | `arena/01a0d21c-nihingobridgeupgrade` |
| `git rev-parse HEAD` | `cfe565d58ec4f6902c9f00bba491827ab303a53d` |
| `git rev-parse origin/main` | `cfe565d58ec4f6902c9f00bba491827ab303a53d` |
| `git rev-list --left-right --count HEAD...origin/main` | `0  0` |
| `git reflog --date=iso -30` | `clone` (12:21:52) + `checkout` (12:21:53) — nothing else |
| `git log --oneline --decorate -20` | one commit: `cfe565d (grafted …) Merge pull request #10` |
| Reachable commit objects | **1** |

**No destructive operation was executed:** no `reset`, `reset --hard`, `clean`, `restore`,
`checkout --`, `rebase`, `merge` or `cherry-pick`. Nothing was staged by `git add .`/`-A` at any
point; only explicit paths were ever added (and only for the A11/A11.5 evidence commits).

---

## 3. Commit verification (§3)

| Command | Result |
| :--- | :--- |
| `git cat-file -t 694c0e2` | `fatal: Not a valid object name 694c0e2` |
| `git cat-file -t fa16e09` | `fatal: Not a valid object name fa16e09` |
| `git cat-file -t 23ba543` (A10) | `fatal: Not a valid object name 23ba543` |

```text
OUTCOME B — A11 COMMIT OBJECT: NOT PRESENT IN CURRENT GIT LAYER
A11 FILE CONTENT SURVIVES
A11 COMMIT OBJECT DOES NOT
```

Treated exactly as the brief requires: **not** as a loss of A11 work (the files survive), and
**not** repaired by recreating history. This is an infrastructure property — the ninth consecutive
reset — not an A11 implementation failure. The durable identity of A11 is path + SHA-256
(`reports/gates/A11.5-DURABILITY-MANIFEST.md` §2), not a hash.

---

## 4. File survival and inventory (§4, §5)

| File | Exists | A11-owned | Current state | Evidence |
| :--- | :---: | :---: | :--- | :--- |
| mobile search route | yes | **yes** | unmodified since A11 | 108 L · `a9a06987bd9cf761` |
| mobile search adapter | yes | **yes** | unmodified since A11 | 94 L · `582d725faf96404f` |
| DB-free A11 tests | yes | **yes** | 42 tests, green | 722 L · `a84b39fe09412717` |
| live A11 tests | yes | **yes** | 7 tests, green | 208 L · `029c4331ee90f433` |
| mobile API contract | yes | A9→A10→A11 | A9 body + 18 × A10.x + 8 × A11.x | 769 L · `84da9e4a7dddc2c8` |
| A11 gate report | yes | **yes** | 31 sections | 773 L · `c114d3d1fe1d79d0` |

Supporting artifacts verified present: `src/types/mobileDictionary.ts` (353 L), A10 readiness tests
(360 L), A9 freeze tests (370 L), A7 script tests (235 L), A8 payload tests (338 L).

No unrelated file counted as an A11 deliverable.

---

## 5. Route, adapter and DTO verification (§6, §7, §14, §15)

**Route inventory:** exactly **one** route under `src/app/api/v1` —
`mobile/dictionary/search/route.ts`. No detail route, no `[id]`, no catch-all (`[...*]`), no
`/api/mobile/*`. Files under `v1/`: the route plus its `_lib.ts`.

**Method surface:** `export const dynamic` + `export async function GET` only. No POST/PUT/PATCH/
DELETE handler exists, so no custom method framework was introduced.

**Ownership boundary verified as frozen:**

```text
HTTP request → validation (route) → DictionaryService.searchEntries  →  A11 adapter
             (sanitize/parse,            (existing engine: matching,      (9-field projection)
              reused helpers)             ranking, filters, clamping)             ↓
                                                                    frozen mobile envelope
```

The adapter (`_lib.ts`) exports exactly three pure functions — `flattenGlosses`, `projectEntry`,
`parseTargetLanguage` — and contains **no** matching, no ranking, no SQL, no JLPT parsing and no
script classification of its own.

**Closed projection (§14, security-critical):** `projectEntry` constructs an explicit object
literal with exactly the nine frozen keys:

```text
id  headword  reading  romaji  primaryGlosses  jlptLevel  jlptStatus  isCommon  kanjiCharacters
```

**Row-leakage scan (§15)** across the A11 response path:

| Pattern | Hits | Classification |
| :--- | ---: | :--- |
| `...row` | 1 | **comment** — docblock at `_lib.ts:19` describing the anti-pattern as a compile error |
| `...entry`, `Object.assign`, `return row`, `return entries`, `databaseRow`, `$inferSelect` | 0 each | — |

`sourceRef`, `frequencyRank`, `partsOfSpeech`, `tags` appear nowhere in the emitted literal. The
only `CanonicalDictionaryRow[...]` typed parameter is `flattenGlosses(senses)` — a single typed
field, not a row. **The A11 response path is a closed allow-list.**

---

## 6. Contract integrity (§8)

| Check | Result |
| :--- | :--- |
| `# A10 — IMPLEMENTATION-READINESS FREEZE` | present (L328) |
| `## A10.x` subsections | **18** (A10.1–A10.18) — complete |
| `## A11.x` subsections | **8** (A11.1–A11.8) — additive |
| A9 body | intact: `v1 (A9 FROZEN)` title, A9 markers present |
| Frozen statements verbatim | `MOBILE-CANONICAL: \`id\`, and only \`id\`` (L425) · `RATE LIMIT: none in v1` (L572) · `1…200 at the boundary; applied 1…100` (L372) · exact `hasMore` invariant (L32) |
| A11 silently rewrote A9/A10? | **no** — appended sections only |

**Semantic invariants re-verified read-only (§9–§13, §16):**

| Invariant | Evidence |
| :--- | :--- |
| query canonical | `sanitizeSearchQuery` reused (route L51); `queryEcho` hits in the A11 path = **0** |
| sanitation unchanged | no `normalize`/`NFKC`/`NFC`/case-fold/transliteration anywhere in the A11 path |
| SearchScript | `detectSearchScript` reused (L70); `ALL_SEARCH_SCRIPTS` = the six canonical values; no `english`/`tamil`/`malayalam` |
| targetLanguage | `SUPPORTED_LANGUAGES = ["en","ta","ml"]`; parsed then discarded — validated + inert |
| JLPT | item carries `jlptLevel` + `jlptStatus` (tri-state); `jlptKnown` in the A11 path = **0** (the single repo hit is the A9 retirement note at `mobileDictionary.ts:96`) |
| public ID | `id` verbatim; `ent_seq`/`entSeq` in `_lib.ts` = **0** |
| pagination | `page` parsed = **0**; boundary 200 / applied 100 / offset 100 000 unchanged; applied values echoed |
| `hasMore` | `result.offset + entries.length < result.total` — exact, applied window |

---

## 7. Error security (§17)

The only client-facing strings in the A11 path are:

```text
"Query parameter 'q' is required"     (400 MISSING_QUERY — byte-identical to the web route)
"Dictionary search failed"            (500 INTERNAL_ERROR)
```

`error.message` in the A11 path = **0**; the single `.message` match in `route.ts` is a **comment**
(L101) explaining why the mobile route must *not* do what the web route does. The full diagnostic
goes to `console.error` server-side. No SQL, host, port, password, `DATABASE_URL`, filesystem path,
stack trace or raw exception can reach a client, and the A11 test suite asserts this against a
deliberately poisoned error (SQL text + `ECONNREFUSED` + host + port + `password=` + path).

**No defect found; nothing was modified.**

---

## 8. Web API isolation (§18)

| Check | Command | Result |
| :--- | :--- | :--- |
| Web dictionary routes | `git diff --stat cfe565d -- src/app/api/dictionary` | **empty** |
| New route additive | `git diff --stat cfe565d -- src/app/api/v1` | **empty** (new path; nothing existing edited) |
| Modified shared files | `git diff --name-only cfe565d -- src/services src/app/api` | 8 files, all classified **pre-existing** (below) |

Shared-file classification by diff content — **A11 owns none**:

| File | Lines | Owner | Evidence |
| :--- | :--- | :--- | :--- |
| `search/matcher.ts` | +72 −2 | kanji session (Gate 6) | `containsKanji` delegation; A11 markers = 0 |
| `search/types.ts` | +57 −8 | **A7** | `-| "english"` removal + `ALL_SEARCH_SCRIPTS`; `projectEntry`/`v1/mobile`/`_lib` = **0** |
| `search/unifiedSearchService.ts` | +30 −10 | A7-era | no mobile markers |
| `dataquality/jlptChecks.ts` | +48 −17 | Gate 14 | docstring corrections; `classifyJlptLevel` exists at `cfe565d` |
| `cms/types.ts` | +52 −2 | Gate A2 / CMS | provenance types |
| `cms/validation.ts` | +79 −0 | Gate A2 / CMS | validation |
| `knowledge/kanjiJmdictLinkage.ts` | +9 −5 | kanji session | kanji lines |
| `knowledge/kanjiLexicalGraphService.ts` | +26 −14 | kanji session | kanji lines |

No web route was modified by A11 → **no BLOCKED trigger**.

---

## 9. Schema, migrations, indexes (§20)

| Check | Result |
| :--- | :--- |
| `src/db/schema.ts` — any `mobile`/`v1`/`dictionary_search` addition? | **0** |
| `src/db/schema.ts` delta nature | **11 added comment lines / 1 removed** — the pre-existing **Gate A2** doc-comment on `provenanceType` (`ai_generated`, explicitly migration-free). Classified **pre-existing**, unchanged |
| `drizzle/` modifications | **none** (4 migration files present, unmodified) |
| Indexes created by A11 | **0** |
| Migrations generated/run by A11 | **0** (only `drizzle-kit push --force` against the disposable PGlite) |

```text
A11 SCHEMA CHANGES: 0     A11 MIGRATIONS: 0     A11 INDEXES: 0
```

---

## 10. Tatoeba / KanjiVG / Phase 14 preservation (§21, §22)

| Check | Result |
| :--- | :--- |
| `data/tatoeba/*` | untouched (5 archives present); `git status --short -- data` **empty** |
| Tatoeba provenance reports | `TATOEBA-14.5A-VERIFICATION-REPORT.md` remains **untracked and unmodified** — Phase 14.5A was not resolved, accessed or altered by this gate |
| KanjiVG / KANJIDIC2 / JMdict | no ingestion, no download, no manifest change |
| Phase 14.4D / 14.4E / 14.5A | `PHASE-14.5A-SCHEMA-NECESSITY.md` and `tests/kanjivg-etl.test.ts` are **pre-existing** modifications, classified independently and left untouched; `PHASE-14.4D-GATE-0-…` remains an untracked pre-existing report |

No corpus was downloaded, seeded, removed or converted.

---

## 11. Pre-existing modifications (§19)

Classification of all 31 modified tracked files (full table in
`reports/gates/A11.5-DURABILITY-MANIFEST.md` §6): search axis/ranking (A7 + kanji session), JLPT audit
(Gate 14), CMS provenance (Gate A2), kanji graph (kanji session), ETL/corpus (A6/14.x), schema
(Gate A2, comment-only), docs (A7/A8/A9), reports (14.5A), CI/config (A6).

```text
A11.5-owned: 0 tracked files
A11-owned:   0 tracked files (A11 added new paths only)
PRE-EXISTING: 31 tracked files, all classified
UNCERTAIN FILES: 0
```

**Untracked reconciliation (38 files, 0 strays):** every untracked file maps to a known gate
family (A1–A11, kanji session, 14.x). No build artifacts, `.next`, `*.tsbuildinfo` or logs (all
gitignored). Arithmetic closes exactly:

```text
A11 Gate 0: 33 collapsed ??  +  4 A11-created entries  =  37 collapsed ?? (current)
```

which proves A11 introduced no file beyond its own evidence set and that nothing appeared between
gates.

---

## 12. Test survival and re-run (§23, §24)

Both layers survive and were re-run **unmodified** — no assertion weakened, no expected value
changed to obtain green:

| Suite | Tests | Result |
| :--- | ---: | :--- |
| `tests/mobile-dictionary-search-api.test.ts` (DB-free contract/adapter) | 42 | **pass** |
| `tests/mobile-dictionary-search-api-live.test.ts` (live, disposable DB) | 7 | **pass** |
| A11 total | **49** | **0 failures** · 19.14 s |

Related contract suites (re-run): payload 14 · script 35 · design-freeze 18 · readiness 20 ·
dictionary-kanji routes 31 = **118 passed**.

A11-specific failures: **0**.

---

## 13. Regression, corpus tier and validation (§25–§31)

| | Files | Passed | Failed | Skipped | Total |
| :--- | ---: | ---: | ---: | ---: | ---: |
| **BASELINE** (A10) | 54 | 1075 | 0 | 55 | 1130 |
| **CURRENT** (A11.5 re-run) | **56** | **1124** | **0** | **55** | **1179** |
| **NEW FAILURES** | — | — | **0** | — | — |
| **NEW SKIPS** | — | — | — | **0** | — |

The current result is **identical** to the A11 final measurement — no drift.

**Corpus tier (§26):** 55 skips, byte-identical across the same nine files
(`pilot-jmdict-db` 12, `kanjidic2-canonical-ingestion` 11, `kanji-lexical-graph` 11,
`full-jmdict-ingestion` 7, `kanjivg-etl` 7, `kanjidic2-etl-foundation` 4, `corpus-preflight` 1,
`dictionary-architecture-corpus` 1, `dry-run-jmdict` 1). Nothing removed, added or converted.

**Count correction for the record:** the brief cites the A11 result as
`56 / 1122 / 0 / 55 / 1177`. After A11's follow-up added two explicit pagination boundary tests, the
measured figure is **`56 / 1124 / 0 / 55 / 1179`** (+2 passed, +2 total). The A11 report and the
contract already carry the corrected numbers, and this gate reproduces them exactly.

| Validation | Result |
| :--- | :--- |
| `npx tsc --noEmit` | **clean** (no diagnostics) |
| `npm run lint` | **0 errors / 4 warnings** (unchanged from baseline) |
| `npx drizzle-kit check` | **OK** |
| `npm run build` | **exit 0**; route registered as dynamic |
| Package integrity | `package.json` + `package-lock.json` **clean before and after** `npm ci` (341 entries); no upgrade, no substitution |

---

## 14. Production contact audit (§34)

| Check | Evidence | Result |
| :--- | :--- | :--- |
| `.env` / `.env.local` | only `.env.example` (tracked template) present | none |
| `DATABASE_URL` in shell | unset at audit start; set only to `127.0.0.1` loopback for validation | loopback only |
| `.vercel` directory | absent | none |
| Vercel/Supabase CLI | not in `package.json` scripts; never invoked | none |
| Listening sockets | `:111`, `:49983`, `:22` (+ disposable PGlite `:5432` during validation) | no production endpoint |
| Stray processes | none outside the declared disposable DB | none |

```text
VERCEL PRODUCTION CONTACTED:    NO
SUPABASE PRODUCTION CONTACTED:  NO
PRODUCTION DATABASE READ:       NO
PRODUCTION DATABASE WRITTEN:    NO
PRODUCTION ENVIRONMENT CHANGED: NO
PRODUCTION DEPLOYMENT:          NO
```

---

## 15. Static contract audit (§32)

| Term | A11 path | Repo `src` | Classification |
| :--- | ---: | ---: | :--- |
| `queryEcho` | 0 | 0 | SUPERSEDED (docs/tests only) |
| `matchType` | 0 | 0 | SUPERSEDED |
| `jlptKnown` | 0 | 1 | HISTORICAL — A9 retirement note |
| `returned` | 1 | 18 | **comment** (retirement list) / UNRELATED elsewhere |
| `page` | 1 | 12 | **comment** / UNRELATED elsewhere |
| `apiVersion` | 1 | 1 | **comment** / HISTORICAL |
| `meta` | 1 | 44 | **comment** / UNRELATED |
| `warnings` | 1 | 21 | **comment** / UNRELATED (ETL) |
| `results` | 0 | 93 | UNRELATED (`UnifiedSearchResponse`, JLPT pages) |
| `totalResults` | 0 | 4 | UNRELATED (web unified-search payload) |
| `executionTimeMs` | 0 | 1 | HISTORICAL |

All A11-path hits are on **one line** (`route.ts:42`), a docblock enumerating what is retired.
**No active A11 contract leakage.** The A11 response carries none of these keys, asserted by test.
`UnifiedSearchResponse` remains a *different* payload and was not conflated with the mobile
response.

---

## 16. Route inventory (§33)

```text
MOBILE ROUTES BEFORE A11: 0
MOBILE ROUTES AFTER A11:  1   → /api/v1/mobile/dictionary/search
NEW ROUTES DURING A11.5:  0
DETAIL ROUTE:             none     CATCH-ALL: none
```

---

## 17. A11.5 artifacts

| Artifact | Purpose |
| :--- | :--- |
| `reports/gates/A11.5-DURABILITY-MANIFEST.md` | evidence: hashes, run results, classifications |
| `reports/gates/A11-TO-A12-HANDOFF.md` | authoritative A12 starting document |
| `reports/gates/GATE-A11.5-DURABILITY-TRANSITION.md` | this report |

No application file was created or modified by A11.5.

---

## 18. Files changed by A11.5

```text
+A11.5-DURABILITY-MANIFEST.md         (new, evidence)
+A11-TO-A12-HANDOFF.md              (new, handoff)
+GATE-A11.5-DURABILITY-TRANSITION.md (new, this report)
```

Path-scoped staging only. Nothing else staged: not `src/db/schema.ts`, not any pre-existing
modification, not any Phase 14/Tatoeba/KanjiVG file.

---

## 19. Verdict

### `A11.5 VERDICT: PASS WITH CONDITIONS`

**Why not bare PASS.** Every substantive criterion is met: all six A11 artifacts survive with
content hashes recorded; the frozen A10 contract is intact (18 × A10.x + 8 × A11.x anchors, frozen
statements verbatim); the implementation matches the contract with no drift (closed 9-field
projection, reused engine, no row spread, no `page`, no `ent_seq`, exact `hasMore`, safe errors);
the web API is provably unmodified; schema, migrations and indexes are untouched; Tatoeba, KanjiVG
and Phase 14 are untouched; all tests are green (49 A11, 118 related, 1124 full) with **0 new
failures and 0 new skips**; the corpus skip set is unchanged; typecheck/lint/drizzle/build all pass;
pre-existing modifications are fully classified with **0 uncertain files**; production was not
contacted; and A12 has not started. The single condition that prevents a bare PASS is
**infrastructure**, not implementation:

1. **Commit durability cannot be verified.** The A11 commit objects (`694c0e2`, `fa16e09`) — and the
   A10 commit `23ba543` — are absent from the git layer, which has reset on nine consecutive turns.
   A11 file content survives; A11 commit objects do not. The durable reference is path + SHA-256.
2. **D-13 deployment security / rate limiting remains outstanding** — the endpoint is public,
   read-only, with no rate limiting; the search predicate is an `ILIKE` scan, so it is **not
   approved for production exposure** until a deployment security gate resolves it.
3. **D-14 (`q` length cap) remains deferred** — parity with the web route was frozen for v1; the cap
   is a security decision, not A11.5's.

Per the brief, exactly this situation ("commit durability cannot be verified" plus
"already-documented deferred conditions") is the expected `PASS WITH CONDITIONS` outcome.

**BLOCKED was not triggered:** no implementation drift, no security leak, no new regression, no
overwritten work, no missing file, no schema need, no production contact, and no uncertain file
ownership (0).

---

## 19b. Re-verification pass

This gate was re-run after a further git-layer reset (10th consecutive). No application file was
created or modified in either pass; the only writes were the three documentation-only artifacts.

| Item | Result |
| :--- | :--- |
| A11 artifact hashes | **7/7 byte-identical** — zero implementation drift |
| Commit objects (`fa16e09`, `694c0e2`, `b1246f1`, `23ba543`) | all **absent** |
| A11 suites | 49 passed / 0 failed |
| Full regression | **56 / 1124 / 0 / 55 / 1179** — identical to the A11 final |
| Corpus skip set | 55, same nine files |
| Typecheck / lint / drizzle / build | clean / 0 err 4 warn / OK / exit 0 |
| Uncertain files | **0** |
| Production contact | none |
| A12 started | **no** |

The manifest was renamed to `A11.5-DURABILITY-MANIFEST.md` (the gate's required artifact path) and
cross-references updated; audit content was unchanged.

---

## 20. Final output (§51)

```text
GATE: A11.5 — POST-IMPLEMENTATION DURABILITY, EVIDENCE & A12 HANDOFF

STATUS: COMPLETE — read-only audit; no application change

A11 IMPLEMENTATION: INTACT and verified (1 route + 1 adapter + 2 suites + contract + report)
A11 COMMIT: 694c0e2 (and follow-up fa16e09) — NOT PRESENT in the git layer
COMMIT DURABILITY: NOT VERIFIED (9th consecutive reset) — A11 FILE CONTENT SURVIVES,
                   A11 COMMIT OBJECTS DO NOT; durable identity = path + SHA-256

A10 CONTRACT: intact — 18 × A10.x anchors + 8 × A11.x anchors; frozen statements verbatim
A11 CONTRACT: §A11.1–§A11.8 present, consistent with the implementation

A11 FILES: 6 artifacts present (route 108 L · _lib 94 L · tests 722 L + 208 L ·
           contract 769 L · report 773 L)
A11 TESTS: 49 (42 DB-free + 7 live) — all pass
A11 REPORT: present, 31 sections

ROUTE: exactly 1 new mobile route — /api/v1/mobile/dictionary/search
ADAPTER: pure (flattenGlosses, projectEntry, parseTargetLanguage); no engine duplication
DTO: closed 9-field allow-list; row-spread hits in code = 0 (1 comment)
PUBLIC ID: id verbatim; ent_seq = 0
PAGINATION: offset/limit; page parsed = 0; applied values echoed; boundary 200 / applied 100 /
            offset 100 000
ERROR SECURITY: 2 fixed client messages; error.message passthrough = 0; diagnostics server-side

WEB API: UNMODIFIED (src/app/api/dictionary diff empty; 8 shared files = pre-existing, 0 A11)
SCHEMA: untouched by A11 (comment-only Gate A2 delta, pre-existing); indexes 0
MIGRATIONS: none generated or run
TATOEBA: untouched (archives present; provenance report unmodified, Phase 14.5A not resolved)
KANJIVG: untouched (kanjivg tests/reports = pre-existing modifications, classified)

PRE-EXISTING MODIFICATIONS: 31 tracked files, all classified (A7/kanji/Gate14/A2/A6/14.5A/CI)
UNRELATED MODIFICATIONS: 0 attributed to A11 or A11.5
UNCERTAIN FILES: 0

REGRESSION: 56 files / 1124 passed / 0 failed / 55 skipped / 1179 total
BASELINE: 54 files / 1075 passed / 0 failed / 55 skipped / 1130 total
CURRENT: 56 files / 1124 passed / 0 failed / 55 skipped / 1179 total (identical to A11 final)
NEW FAILURES: 0
NEW SKIPS: 0 (55-skip corpus set byte-identical across the same nine files)

TYPECHECK: clean
LINT: 0 errors / 4 warnings (unchanged)
DRIZZLE: OK
BUILD: PASS (exit 0; route registered as dynamic)

PRODUCTION: NOT CONTACTED
PRODUCTION CONTACT: none — no .env, no .vercel, DATABASE_URL loopback-only, no CLI calls
PRODUCTION CHANGES: none

A11.5 ARTIFACTS: reports/gates/A11.5-DURABILITY-MANIFEST.md
                 reports/gates/A11-TO-A12-HANDOFF.md
                 reports/gates/GATE-A11.5-DURABILITY-TRANSITION.md

A12 DEFERRED ITEMS: D-4 opaque id · D-5 provenance display form · D-6 localization ·
                    D-7 keigo fields · D-8 audio · D-9 detail DTO + endpoint ·
                    D-10 richer filters · D-11 warnings/offline · D-12 deep pagination ·
                    D-13 rate limiting / abuse protection (deployment-blocking) ·
                    D-14 defensive q length cap

A12 MUST START WITH: the surviving working tree + the frozen A10 contract + the verified A11
                     implementation + A11-TO-A12-HANDOFF.md; reverify A11 by path + SHA-256;
                     re-run the A11 suites and regression; never assume a commit hash exists

A12 MUST NOT: redesign A11 search semantics · change SearchScript · reintroduce queryEcho,
              matchType, jlptKnown or page · expose raw rows / sourceRef / ent_seq /
              frequencyRank / partsOfSpeech / tags · change the web dictionary contract ·
              modify schema, migrations or indexes without separate authorization ·
              ingest Tatoeba, KanjiVG, JMdict or KANJIDIC2 · touch production or deploy ·
              begin Phase 14.4D/14.4E/14.5A/14.5B · infer authorization from relatedness

COMMIT: A11.5 evidence-only commit over the 3 report paths (path-scoped staging)
PUSH: no

FINAL VERDICT: PASS WITH CONDITIONS
NEXT GATE: A12 — NOT STARTED; requires explicit authorization
```

---

**HARD STOP.** A11.5 ends here. No A12 code, no detail route, no rate limiting, no authentication,
no localization, no index, no schema or migration change, no deep-pagination optimization, no
deployment, no production contact, no Tatoeba or Phase 14.5A continuation. The only deliverable of
this gate is: A11 implementation → durability verified → evidence frozen → A12 handoff created →
stop.
