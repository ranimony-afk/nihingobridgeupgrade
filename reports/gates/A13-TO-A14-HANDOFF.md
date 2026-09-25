# A13 → A14 HANDOFF (authoritative start document for Gate A14)

**Issued by:** Gate A13 (`reports/gates/GATE-A13-MOBILE-DICTIONARY-PRODUCTION-READINESS.md`).
**Applies to:** the mobile dictionary surface — the single frozen route
`GET /api/v1/mobile/dictionary/search`.
**Durable identity rule:** the session's git layer re-clones at
`cfe565d58ec4f6902c9f00bba491827ab303a53d` every turn, so a commit hash is **not** durable. Identity is
**path + content + SHA-256**, exactly as listed in §7 below.

---

## §1 Start here — Gate A14 Gate 0 must re-establish, not assume

A14 must begin by re-measuring, in this order, and must report the numbers it actually observes:

1. **Gate 0 baseline.** HEAD, `origin/main` distance, branch (`arena/01a0d21c-nihingobridgeupgrade`),
   reflog, and the working-tree census with `git status --porcelain -uall` (counts reconciled before
   being quoted — the untracked count of this tree has read 39–43 across gates; see A13 §3).
2. **Preservation audit first.** Re-hash the frozen artifacts in §7 before touching anything.
   A13 measured **12 IDENTICAL / 0 drift → PRESERVE**; A14 must not assume it.
3. **Environment.** `npm ci --no-audit --no-fund` (expect 341 entries; lockfiles must not change), then
   a disposable loopback database if DB-dependent work is needed.
4. **Baseline regression.** A13 closed at **56 files / 1 148 executed / 0 failed / 55 skipped /
   1 203 total**. The 55 skips are the untouched A6 corpus-tier set; any new skip is a failure of the
   gate, not a convenience.

## §2 What is frozen and must not be changed without an explicit A14 authorization

* The path, GET-only transport, and the 9-field item projection (`id`, `headword`, `reading`, `romaji`,
  `primaryGlosses`, `jlptLevel`, `jlptStatus`, `isCommon`, `kanjiCharacters`) — hand-built, never a
  `{ ...row }` spread.
* The envelope `{success, data}` / `{success, error:{code,message}}`; the 8 `data` keys
  (`query`, `detectedScript`, `appliedJlptLevel`, `entries`, `total`, `limit`, `offset`, `hasMore`).
* `query` is the sanitized query; `queryEcho`, `matchType`, `page`, `returned`, `apiVersion`, `meta`,
  `warnings`, `pagination`, `totalResults`, `executionTimeMs` stay retired.
* Pagination: `limit` 1…200 at the boundary (service 1…100, default 50), `offset` 0…100 000, applied
  values echoed, `hasMore = offset + entries.length < total` over the applied window.
* Ordering: the global SQL rank ladder + `frequency_rank ASC NULLS LAST, is_common DESC, id ASC`
  (now precisely documented as contract §A13.1). Exact matches cannot appear on a later page.
* `jlptStatus` is the tri-state `classifyJlptLevel` derivation, never a boolean.
* `targetLanguage` is validated and **inert**; A13 raised the guarantee to **byte-identical response
  text** across 7 variants.
* `q`: required, non-empty after sanitization (NUL-strip + trim), ≤ 1 000 UTF-16 code units, rejected
  never truncated, judged after sanitization.
* Never exposed: `ent_seq`/`entSeq`, `sourceRef`, provenance, `frequencyRank`, `partsOfSpeech`, `tags`,
  `senses`, internal ids, SQL/stack/host/path/secret details in any error.
* No route was added; the mobile route inventory is **1**. No web dictionary route may change.

## §3 Producer status a detail contract must respect (from A13 §12 / contract §A13.3)

`MobileDictionaryDetailResponse` **is not a specification** and must never be used as one. Producers:

| Field group | Reality |
| :--- | :--- |
| identity, `jlptLevel`, `isCommon` | producible (`dictionary_entries`, 12 columns) |
| `meanings` | partial (`senses.glosses`/`note`); `order`/`contextTags` unsourced |
| `kanjiList` | partial (`kanji_entries`, `kanji_radicals`, `getVocabularyKanji`); SVG needs KanjiVG = 14.4D, **blocked** |
| `keigo` | produced by `getKeigoRelations` as an **array**; declared shape is an **object** — mapping is undecided |
| `exampleSentences` | partial (`example_sentences` + `dictionary_entry_ids`) |
| provenance source/licence/attribution | partial (`knowledge_sources`); display form is **D-5**, unresolved |
| `alternativeHeadwords`, `alternativeReadings` | **never persisted** (ETL in-memory only) — not readable |
| `conjugations`, `synonyms`, `antonyms`, `phrases`, `collocations` | **no producer** |
| `userState`, `srsStatus` | storage only; needs an attributable identity (D-13 open) |
| `localizedGlosses`, `isKeigo`, `keigoType`, `hasAudio`, `audioUrl` | **no producer** |

## §4 Decision register as A14 inherits it

| # | Decision | Status | Owner | What unblocks it |
| :-: | :--- | :--- | :--- | :--- |
| D-4 | Public identifier | **PASS — KEEP VERBATIM** | mobile platform | nothing (no code change); opaque alias needs a 5th migration |
| D-5 | Provenance display form | DEFERRED | product/editorial + API | a defined display form |
| D-6 | Localized glosses | DEFERRED | localization gate (13.5C) | a provenance-safe read path |
| D-7 | Keigo on an item | DEFERRED | mobile + lexical graph | shape decision + per-item cost measurement |
| D-8 | Audio | DEFERRED | content/provenance | any dictionary audio producer |
| D-9 | Detail DTO/endpoint | **DEFERRED — BLOCKED by D-5** | API | D-5 resolved **and** a frozen subset contract |
| D-10 | Richer filters | DEFERRED | search/API | a filter contract + a scan-cost measurement |
| D-11 | `warnings` / offline | DEFERRED | mobile client | a producer |
| D-12 | Deep/cursor pagination | DEFERRED (measured) | API | an authorization for index/cursor work |
| D-13 | Rate limiting | DEFERRED — deployment gate | deployment/platform | an authorization to implement T1–T4 (A13 §28) |
| D-14 | `q` cap | **PASS — IMPLEMENTED** (A12), re-verified A13 | API | nothing |

**A14 may implement only decisions that are approved in A14's own brief.** Nothing above is an
implementation authorization by itself.

## §5 Evidence A14 should reuse rather than re-derive

* **Ordering:** `q=hon` on the seeded corpus promotes `de-hon` (romaji-exact, `frequency_rank` 150)
  above `de-nihon` (substring, `frequency_rank` 90) — the discriminating case for rank-vs-frequency.
  `q=a` yields 29 rows in pure tie-break order and pages that are exact slices of it.
* **Pipeline:** `WHERE → COUNT(*) [second scan, exact] → ORDER BY [global 8-rank CASE + tie-break] →
  LIMIT/OFFSET → 1:1 overlay → order-preserving JS pass`. No dedup, no post-limit filtering; the 1:1
  overlay can still reduce emitted items when non-published rows overlap the page.
* **Performance (LOCAL/DISPOSABLE/SYNTHETIC, 100 030 rows):** normal classes 0.6–1.2 s service time;
  offset is a near-flat ~+195 ms penalty; deep offset with a large match set costs a 20 MB disk sort
  (444 ms execution); `limit` is immaterial; serialization ≈ 1 ms / 21 kB per 100 items.
* **Cap cost:** 1 000 latin chars = 4 381 ms count / 9 145 ms service; 1 000 wildcards = 8 380 / 17 059;
  NUL-padded = 4 374 / 9 046.
* **Index feasibility:** `pg_trgm` cannot be created in `PGlite` (GIN unmeasurable → externally
  blocked); a sort-key btree helps **only** offset 0 (263 → 46 ms) and is a small penalty on selective
  queries — recorded as a candidate, never applied.
* **Leakage:** 17-term audit → 0 active; exact key-set assertions make absence structural.

## §6 Testing conventions A14 must keep

* DB-free contract tests and disposable-database live tests stay in **separate files**.
* The live suite skips only when no database is reachable, and always with an explicit reason.
* Never weaken, rename or delete an assertion to obtain green; add rather than relax.
* Prefer extending the existing mobile suites over creating a new gate-shaped test file; A13 added 7
  tests that way (`59 → 64` mocked, `7 → 9` live).
* Every new assertion must be derived from runtime behaviour or a producer — not from a declared type.

## §7 Artifact identity (path + lines + SHA-256; `LOCAL INFORMATIONAL HASH`)

| Artifact | Lines | SHA-256 (first 16) |
| :--- | :-: | :--- |
| `docs/api/MOBILE-DICTIONARY-API-CONTRACT.md` (now with `# A13`) | 1 042 | `3e56b84b8b393fab` |
| `src/app/api/v1/mobile/dictionary/search/route.ts` | 125 | `5523860e48c88329` |
| `src/app/api/v1/mobile/dictionary/search/_lib.ts` | 130 | `b8a575399b8f9986` |
| `src/types/mobileDictionary.ts` | 353 | `aece3af08cb9300d` |
| `tests/mobile-dictionary-search-api.test.ts` | 1 180 | `8d258fb1d049c3c6` |
| `tests/mobile-dictionary-search-api-live.test.ts` | 307 | `a787c36bcd42fd1f` |
| `reports/gates/GATE-A13-MOBILE-DICTIONARY-PRODUCTION-READINESS.md` | — | (new in A13) |
| `reports/gates/A13-TO-A14-HANDOFF.md` | — | (this document) |
| `reports/gates/GATE-A12-MOBILE-DICTIONARY-HARDENING.md` | 840 | `d26026298905ba7e` |
| `reports/gates/GATE-A12-MOBILE-DICTIONARY-CAPABILITY-EXPANSION.md` | 611 | `98ef6106a2868f09` |
| `reports/gates/GATE-A11-MOBILE-DICTIONARY-SEARCH-API.md` | 773 | `c114d3d1fe1d79d0` |
| `reports/gates/A11.5-DURABILITY-MANIFEST.md` | 269 | `3b6a86d92bde76d8` |
| `reports/gates/A11-TO-A12-HANDOFF.md` | 243 | `1040e109067ee03f` |
| `reports/gates/GATE-A11.5-DURABILITY-TRANSITION.md` | 524 | `728c8cfe7fb766c0` |

## §8 Standing constraints that still bind A14

No production contact of any kind. No Vercel/Supabase/env/deploy change. No secret or `DATABASE_URL`
printed or persisted; loopback databases only. No corpus ingestion (Tatoeba/KanjiVG/JMdict/KANJIDIC2);
`data/tatoeba/*` untouched. No 14.4D/14.4E/14.5A/14.5B activity. No schema/migration/index change
without an explicit A14 authorization recorded in the report. No web dictionary behaviour change. No
push unless explicitly authorized. Path-specific staging only, verified with
`git diff --cached --name-only` before committing. Never reset/clean/checkout/cherry-pick/merge/
rebase/amend/force-push. Never delete a prior gate report. Never reconstruct a missing commit; if a
conflict is found, `DOCUMENT CONFLICT` and stop rather than reinterpret.

## §9 What A14 must not do

Implement a detail endpoint before a detail contract is frozen; invent detail fields; localize glosses
without a producer; add auth, rate limiting or cursor pagination without authorization; expose
provenance or internal columns; alter the frozen payload, id semantics or `SearchScript`; treat
`src/types/mobileDictionary.ts` as a specification; claim a commit hash is durable; or describe any
local measurement as a production fact.

## §10 Recommended first moves for A14 (in evidence order)

1. Re-run Gate 0 + integrity (A13 §4 list) and reproduce the regression baseline before changing
   anything.
2. If a detail surface is genuinely required, **freeze a subset contract** over the producible fields
   in §3 (identity, meanings-from-`senses`, kanji from `kanji_entries`, example sentences) and record
   explicitly that keigo needs a shape decision, provenance needs D-5, and the other groups have no
   producer.
3. Escalate D-5 as a product decision — it is the single blocker for D-9.
4. Obtain a decision on the deployment controls (A13 §28 T1–T4) before any claim that the endpoint is
   safe to expose; today it remains **not approved for production exposure**.
