# Production canonical Kanji data gap — record-level report

Date: 2026-11-02
Evidence class: **operator-supplied production query results** (this engagement opened no
production connection) + **repository inspection at `c52ea82`**.

---

## 1. Supplied production evidence

| Table | Production count | Repository-derived expectation | Delta |
|---|---:|---:|---:|
| `kana_entries` | 208 | 208 (`buildKanaDataset()`) | 0 |
| `kanji_entries` | 33 | 45 (33 Mind Tree + 12 corpus) | **−12** |
| `kanji_radicals` | 55 | 55 Mind Tree (+8 corpus when the corpus is provisioned) | 0 |
| `kanji_composition` | 71 | 71 Mind Tree (+19 corpus edges) | 0 |

| `source_ref` | Production count |
|---|---:|
| `first-party:kanji-mindtree:v1` | 33 |
| `first-party:kanji-corpus:v1` | **0 rows displayed** |

**Qualification (required by the engagement):** the missing 12 corpus records are treated
as a confirmed gap *only if the supplied provenance result was complete and unfiltered*.
The result as reported contains no `first-party:kanji-corpus:v1` row and no other
`source_ref`; if a `GROUP BY` filter, row limit or UI truncation hid rows, the conclusion
would change. This report records the qualification rather than resolving it. The
independent `GROUP BY source_ref` query in the runbook (§4) is the check that settles it.

**Not claimed:** matching counts are not proof of semantic correctness, referential
integrity, uniqueness, or application behaviour. Only `kanji_entries` and
`kanji_radicals` were counted by kind; `kanji_composition` has no `source_ref` column, so
its provenance attribution is inferred from its `kanji_id`/`element_id` values, which were
not read in production.

---

## 2. The exact 12-record gap

All twelve exist in the repository, in `src/etl/kanji/fixture.ts`
(`PILOT_KANJI_ENTRIES`, line 126), each declaring `sourceRef: "first-party:kanji-corpus:v1"`.
They are absent from production, not absent from source.

| # | Character | Canonical id | Strokes | JLPT | Primary element | Composition edges | Element present in the 55? |
|---|---|---|---:|---|---|---:|---|
| 1 | `道` | `kanji-road` | 12 | N5 | `el-shinnyou` | 2 | **no** |
| 2 | `新` | `kanji-new` | 13 | N5 | `el-kin` | 3 | **no** |
| 3 | `話` | `kanji-talk` | 13 | N5 | `el-gen` | 2 | yes |
| 4 | `水` | `kj-mizu` | 4 | N5 | `el-mizu` | 1 | yes |
| 5 | `火` | `kj-hi` | 4 | N5 | `el-hi` | 1 | yes |
| 6 | `心` | `kanji-heart` | 4 | N4 | `el-kokoro` | 1 | yes |
| 7 | `紙` | `kanji-paper` | 10 | N4 | `el-ito` | 1 | yes |
| 8 | `晴` | `kanji-clear-weather` | 12 | N4 | `el-hi2` | 2 | yes |
| 9 | `結` | `kanji-bind` | 12 | N3 | `el-ito` | 2 | yes |
| 10 | `念` | `kanji-thought` | 8 | N3 | `el-kokoro` | 1 | yes |
| 11 | `観` | `kanji-observe` | 18 | N2 | `el-me` | 1 | yes |
| 12 | `鑑` | `kanji-discern` | 23 | N1 | `el-kane` | 2 | yes |

Totals: **12 headwords, 19 composition edges**, plus the **8 elements** in
`PILOT_RADICALS` (`fixture.ts:10`): `el-shinnyou` ⻌, `el-kubi` 首, `el-kin` 斤,
`el-shita-tongue` 舌, `el-ao` 青, `el-kichi` 吉, `el-miru` 見, `el-kan-inspect` 監.
None of the eight ids exists in the 55-element Mind Tree dataset.

### 2.1 Source-file provenance

| Fact | Location |
|---|---|
| 12 headwords + nested composition, provenance `first-party:kanji-corpus:v1` | `src/etl/kanji/fixture.ts:126` (entries), `:10` (elements) |
| 33 headwords, 55 elements, 71 edges, provenance `first-party:kanji-mindtree:v1` | `src/data/kanji.ts:103` (`KANJI`), `:30` + `:235` (`ELEMENTS` + `EXTRA_ELEMENTS`), `:158` (`COMPOSITION`) |
| Transformer that produces the rows the ETL would insert | `src/etl/kanji/transformer.ts:202` (`validateAndTransformKanjiData`) |
| The 45-row first-party baseline assumption | `scripts/ingest-kanjidic2.ts:404-410` |
| Per-row provenance column (non-null) | `src/db/schema.ts:549` (`kanji_entries`), `source_ref` at `:563` |

---

## 3. Duplicate and conflict analysis

| Question | Answer | Evidence |
|---|---|---|
| Do any of the 12 characters collide with the 33 Mind Tree headwords? | **No** | Character sets are disjoint (Mind Tree: 明休林森好男花茶語聞時間雪電海洗汗灯持招息取見走待字安室箱箸員買峠) |
| Do any of the 12 characters collide with an existing *element*? | **Three do** — `水` (`el-mizu`), `火` (`el-hi`), `心` (`el-kokoro`) | Different table (`kanji_radicals`), different unique constraint; no conflict, but the same character legitimately appears as both headword and element |
| Do any ids collide? | **No** — `kanji-road`, `kanji-new`, `kanji-talk`, `kj-mizu`, `kj-hi`, `kanji-heart`, … are all absent from `KANJI` | `src/data/kanji.ts:103` |
| Are there conflicting definitions for the same character? | **Not in the repository.** `箸` (14 strokes, Mind Tree) is the documented Mind Tree-vs-KANJIDIC2 conflict and is unaffected by this dataset | `tests/kanjivg-canonical-attachment-gates.test.ts` (箸 assertions) |
| Is the existing 55 / 71 consistent with the 33? | **Yes** — every one of the 71 edges resolves to one of the 33 headwords and one of the 55 elements; all 33 `primaryRadicalId` values resolve; all 71 edge ids are unique | repository analysis of `src/data/kanji.ts` |
| Would the 12 rows be consistent with the 55 / 71? | **No, not on their own** — 2 primary elements and 8 distinct edge elements are outside the 55 | §2 table |

**Consequence:** the 12 headwords are not an independently insertable unit. Provisioning
them alone would create 12 headwords whose `primary_radical_id` (no FK, `schema.ts:559`)
points at rows that do not exist, and either no decomposition at all or 19 edges whose
`element_id` (no FK, `schema.ts:573`) dangles. The tool provisions **12 + 8 + 19** as one
transactional dataset, taking the foundation to 45 / 63 / 90.

---

## 4. Root cause

Two provisioning notions coexisted and disagree:

1. **Bootstrap** (`KnowledgeService.ensureSeeded()`) writes only `src/data/kanji.ts` →
   33 / 55 / 71. This is what produced the observed production state.
2. **Verification/ingestion** (`scripts/ingest-kanjidic2.ts:404`) and the CI suites
   (`tests/kanjidic2-canonical-ingestion.test.ts:74`, `tests/kanjivg-canonical-attachment-gates.test.ts:247-248`)
   require 45 first-party rows, produced in tests by
   `ensureSeeded()` + `runKanjiETLPipeline()`.

No production-reachable path performs the second step: `runKanjiETLPipeline()` has **no
`src/` importer** (only `tests/*` and `scripts/*`), `fixtureSetup.ts:40` refuses
`NODE_ENV=production`, and `scripts/ingest-kanjidic2.ts` is loopback-only and requires the
45 rows to exist already.

The old bootstrap guard made this invisible: `ensureSeeded()` returned early whenever
`kana_entries` was non-empty, so **any** database with kana rows was treated as fully
seeded, regardless of Kanji completeness. That single-table assumption is removed in this
change (`knowledgeService.ts:180` now decides from the Kanji tables and throws
`CanonicalBootstrapStateError` on a partial foundation instead of silently returning).

Severity: the gap is a **content completeness** defect, not a corruption or leak. Nothing
suggests the 33 existing rows are wrong. Consequences are user-visible but bounded —
see §5.

---

## 5. Unverified items (explicit)

1. **Production schema equivalence.** The deployed schema was not read. The tool refuses to
   run when `kanji_entries` is absent, but column-level drift (types, constraints,
   triggers) is unverified.
2. **Provenance completeness of the supplied query** (§1 qualification).
3. **Whether any of the 12 characters exist in production under another `source_ref`.**
   The supplied result shows only Mind Tree rows; a character could still exist under an
   `upstream:` reference. The provisioner detects this at run time and refuses
   (`PLAN_BLOCKED`, "kanji character X already exists under id Y").
4. **Radical and composition attribution in production.** Only counts were supplied;
   the assumption that the 55/71 are exactly the Mind Tree rows is an inference from
   counts + the bootstrap code path.
5. **Linguistic review status of the 12 corpus records for production use.** They are the
   repository's curated pilot corpus, unchanged, with the repository's own provenance
   declaration. This report does not assert they passed a production editorial review.
