# NihongoBridge — Kanji MindTree M1-C
## Source-backed provenance & artifact verification plan

**Mode:** read-only repository investigation and verification planning
**Report date:** 2026-10-29
**Executive verdict:** **PASS WITH CONDITIONS** for the *planning deliverable*; the corpus-backed gate itself remains **BLOCKED**.
**Decision boundary:** this report authorizes no source acquisition, extraction, transformation, database access, ingestion, or learner-facing integration.

## 1. Executive verdict

This checkout contains useful M1-B synthetic contract work, historical KanjiVG/KANJIDIC2 acquisition manifests and gate reports, source-verification code, and an existing decomposition engine. It does **not** contain the named KanjiVG or KANJIDIC2 source bytes, their extracted working trees, or derived decomposition output. Consequently, none of the historical checksum/count claims was independently re-established against current artifact bytes in this phase. Source-to-graph correctness also remains unreviewed against actual source files.

The plan is ready to inform a separately authorized acquisition and verification phase, subject to the owner decisions in §11. Do not interpret the planning verdict as a source-backed PASS. The M1-B suite establishes only structural behavior for synthetic fixtures, not linguistic or source correctness.

## 2. Workspace identity and preservation

Identity recorded before this investigation:

| Field | Observed value |
|---|---|
| Absolute repository root | `/home/user/nihingobridgeupgrade` |
| Branch | `arena/40788dd5-nihingobridgeupgrade` (`active`) |
| HEAD | `cf7a4c673236af2f507af8529dae0946fbed3bdf` |
| Shallow clone | Yes; `.git/shallow` contains HEAD, and only one commit is locally visible |
| Remotes | `origin` fetch/push: `https://github.com/ranimony-afk/nihingobridgeupgrade.git` |
| Upstream | None configured for this branch |
| Initial full status | Exactly the three pre-existing M1-A/M1-B paths below were untracked; no staged or tracked modifications |
| Report destination before writing | `reports/kanji-mindtree/M1-C-SOURCE-PROVENANCE-AND-ARTIFACT-VERIFICATION-PLAN.md` absent; no ignore rule matched it |

The three M1 files were present and their current hashes match the latest M1-B evidence available from the prior phase. They were not changed in M1-C.

| Path | Current SHA-256 | Previous M1-B SHA-256 |
|---|---|---|
| `src/lib/kanji/structuralEvidenceGraph.ts` | `dea648033980490a321f0ebdd387b2c211161007adb79c44481a2d610b46f3db` | same |
| `tests/kanji-mindtree-contract.test.mjs` | `3a80755e662688e01a7331f02606268b7047794089943516ed54fb83896614ee` | same |
| `docs/architecture/KANJI-MINDTREE-M1-A-CONTRACT.md` | `b11652986bb80a9f4aa4872e79317240dd0560b1aff87e6df7f0a35f60e4ff2c` | same |

The current M1 scoped fingerprint is `90fb7ec128c02178be34655df74703b997d357e3786cff2dd1e61865fe1088da` (the same sorted-path/hash method and value recorded at M1-B close). The earlier pre-M1-B fingerprint and hashes differ because those files were intentionally hardened in M1-B; they are not evidence of unexpected M1-C edits. The shallow history prevents a full historical commit audit in this checkout.

**Preservation plan:** add only this report. Keep the three existing untracked M1 files intact. No code, data, schemas, scripts, manifests, tests, package files, or existing reports are to be modified for M1-C.

## 3. Current gate and contract review

### 3.1 What M1-B actually validates

The M1-B module is a dependency-free runtime validator for an unknown graph value and caller-supplied expected pins (`src/lib/kanji/structuralEvidenceGraph.ts:1-20, 30-118`). It checks the v2 top-level/provenance shape, node and edge shapes, allowed fields, string and array bounds, exact scalar syntax for glyph/non-null component characters, exact duplicate identities, deterministic framed edge IDs, relation kinds/endpoints, occurrence ownership/parent/component constraints, per-glyph order uniqueness, negative zero, and cycles in containment and variant relations (`:254-290, 296-415, 635-704`). It rejects unknown fields, including graph-level editorial/AI overlay fields. Its canonicalizer validates first, orders nodes and edges by ID, recursively sorts object keys, and returns JSON text (`:648-670`).

The current graph has one `provenance` object with `sourceRef`, `sourceVersion`, `declaredContentDigest`, `license`, and `attribution`, plus one `transformationVersion`; the expected-pin object has the same source strings and transformation pin (`:57-92`). The validator checks SHA-256 syntax and equality with caller-supplied pin strings (`:376-401`). `declaredContentDigest` is metadata: the module receives no source bytes and computes no hash. The v1 canonicalizer likewise computes no cryptographic digest; these limitations are explicitly documented (`docs/architecture/KANJI-MINDTREE-M1-A-CONTRACT.md:103-113`).

### 3.2 What it does not validate

M1-B does not establish source identity, release/tag authenticity, source artifact path/size, observed artifact bytes, decompression or extraction integrity, source-license text, a verified output digest, coverage, mapping correctness, review approval, or that any graph statement is linguistically correct. It does not bind the graph to a source file inventory, code commit, configuration, dependency set, or exact derived output. A proxy may run reflection traps during inspection; exceptions are caught, but the validator is not a sandbox (contract `:54-77`).

The expected pin itself is a caller input, not an independent trust anchor. A well-shaped digest string equal to a caller-supplied string proves neither that bytes were hashed nor that the supplied value came from the source maintainer.

### 3.3 Synthetic-only evidence

All 21 tests in `tests/kanji-mindtree-contract.test.mjs` use explicitly synthetic records (file header and fixture setup at `:1-60`). They exercise strict object/array handling, Unicode scalars, exact identity and reference rules, typed edges, cycles, deterministic issues/serialization, resource bounds, digest-string semantics, and isolation. They do not read KANJIDIC2 or KanjiVG bytes. They cannot establish source coverage, glyph/component mapping, variants, semantics, etymology, or a canonical Kanji truth. The suite is source-isolated but is not a corpus acceptance test.

### 3.4 Can the current contract represent the required provenance?

**Not without conflation.** The single source reference/version/digest and one transformation version cannot distinctly identify both KanjiVG and KANJIDIC2 inputs, the KanjiVG archive and generated index, each extracted SVG/XML artifact, a code/config/dependency identity, and a derived graph output. It has no evidence-claim coverage or separate technical/human review status. Putting multiple files/releases into one `sourceRef` or digest string would obscure which bytes support which record. Keep that contract limitation explicit; do not repair it in M1-C.

### 3.5 Existing content classes and behavior

Keep these four classes separate:

1. **First-party learner-authored/curated content:** `src/data/kanji.ts` declares `first-party:kanji-mindtree:v1`, an in-repository authoring statement, meanings/readings/mnemonics, elements, and compositions (`:1-30, 89-103, 139-158, 234-237`). A static count finds 33 `KANJI` rows (33 distinct characters), 54 `ELEMENTS` rows plus one `EXTRA_ELEMENTS` row, and 71 `COMPOSITION` entries. These are code declarations, not evidence of external source correctness. The shallow clone cannot establish their full authoring history. The provenance registry calls this proprietary first-party data (`src/services/knowledge/provenance/registry.ts:164-178`).
2. **Source-derived structural evidence:** the KanjiVG-derived evidence described below; it must remain distinct from first-party data and from canonical learning rows.
3. **Editorial review/publication state:** not part of the M1-B graph contract and not verified here.
4. **AI explanatory overlays:** noncanonical and outside the graph; synthetic overlay rejection is only a shape test, not content approval.

Current learner behavior already uses first-party records: `KnowledgeService.ensureSeeded()` imports and seeds `ELEMENTS`, `KANJI`, and `COMPOSITION` (`src/services/knowledge/knowledgeService.ts:11-18, 131-202`); `buildMindTree()` and `getKanjiDetail()` assemble learner views (`:405-420, 559-574`); `/api/kanji/[character]` serves the detail (`src/app/api/kanji/[character]/route.ts:6-28`) and the Kanji detail page fetches it (`src/app/kanji/[character]/page.tsx:139-156`). M1-C makes no change to that behavior.

## 4. Repository source/artifact inventory

### 4.1 Current byte state

The following paths were checked directly and are absent:

- `data/kanjivg-r20240807.tar.gz`
- `data/kanjivg-index.json`
- `data/kanjivg/`
- `data/kanjidic2.xml`, `data/kanjidic2.xml.br`, and `data/kanjidic2.xml.gz`
- `data/kanji-decomposition/`

The current `data/` directory contains Tatoeba artifacts and `test-checkpoint.json`, not the KanjiVG/KANJIDIC2 files. `git ls-files data` likewise lists no KanjiVG/KANJIDIC2/decomposition artifact. No LFS pointer for these named paths is present in the tree; the `git-lfs` executable is not installed. The tracked manifests, source code, reports, and tests are metadata/code, not substitutes for source bytes. `reports/kanji-mindtree/` did not exist before this report. No decomposition gate report was found under `reports/gates/`; decomposition scripts and tests are present.

No outside pages or remote URLs were fetched. URLs below are repository-recorded locations only; their current contents and current release identities were not checked online.

### 4.2 KanjiVG

The tracked manifest reports KanjiVG `r20240807`, tag commit `a4b51d966d832544c371d566f9c84174e4beff3b`, Codeload archive `kanjivg-r20240807.tar.gz`, archive SHA-256 `a0cbc5c950d5c68bf3b6b24468ebdb8a829e62f04a4f44e1c7e98bade2597dcd`, and generated `kanjivg-index.json` SHA-256 `43e9d0b71f7288e72bb6a74bdaa52498fe381a1045925789e62695fc863cf6d0` (`reports/gates/PHASE-14.4D-KANJIVG-ACQUISITION-MANIFEST.json:1-39`). It records 11,658 SVGs: 6,699 primary files and 4,959 variant-named files; the index has 6,699 primary keys (`:18-39`). These are **manifest claims, not measurements in this checkout**.

The 2026-09-29 execution report says the release tag/commit was rechecked, archive/index digests and counts were re-derived, and the `COPYING`/`README.md` license evidence was inspected (`reports/gates/PHASE-14.4D-CONTROLLED-KANJIVG-INGESTION.md:25-47`). The manifest also says a previous archive digest `678a15b1…` and index digest `0fcf17e8…` were superseded (`manifest.json:41-54`). Treat all as historical assertions until bytes and upstream identity are independently re-established.

**Inventory ambiguity to resolve:** the same manifest labels `uncompressedFileCount` as 11,658 (`:24`), while its re-pin narrative says 11,670/11,670 repository blobs were verified (`:44`). The latter may count non-SVG support files, but that is not established here. Record separately the exact total archive entries by type, SVG count, support-file count, symlinks/hardlinks, and the index inventory; do not silently equate them.

The repository-described index is generated by upstream `make-index.py`; the independent verifier regenerates a JSON object from sorted five-hex-character SVG filenames to arrays of matching filenames (`scripts/verify-kanjivg-acquisition.ts:56-78`). The expected root, filename pattern, archive/index sizes and digests, and count assertions are in the verifier (`:22-43, 89-165`). The index is a secondary inventory artifact, not source bytes and not a decomposition graph.

**Verifier limitation:** `verify-kanjivg-acquisition.ts` recomputes archive/index hashes and inventory from local bytes, but its own “source repository identity” finding is only a non-empty-file-list marker (`:144-147`); that finding alone does not prove a tag resolves to the named commit. A historical report separately claims a remote tag/commit check (`PHASE-14.4D-CONTROLLED-KANJIVG-INGESTION.md:29-31`). Additionally, the helper checks a published corpus file count (`verify-kanjivg-acquisition.ts:167-173`), not byte-for-byte equality of every extracted SVG against its archive member. The decomposition engine also checks archive/index hashes and corpus count (`scripts/ingest-kanji-decomposition.ts:487-514`) while reading individual files from `data/kanjivg/`; it does not there establish per-file equality with archive members. A future gate must bind every derived input file to the verified archive inventory and observed per-file bytes.

### 4.3 KANJIDIC2

The tracked manifest identifies release date `2023-08-20`, database version `2023-232`, file version `4`, 13,108 records, decompressed XML size 15,643,593 bytes, and `SHA256` `260e6119fcc78cde438de7d7f8227d1c13260469d10ae36a01d866c61f7cc781` (`reports/gates/PHASE-14.4B-KANJIDIC2-ACQUISITION-MANIFEST.json:1-15`). Its `SHA256` field is for the **decompressed XML**, not the compressed archive. The manifest archive URL points at a mutable `blob/main` path (`:6-7`); the later acquisition report says that URL was not used as an immutable contract and instead records a pinned mirror commit/blob.

The 2026-09-28 acquisition report historically asserts mirror `Jitendex/edrdg-dictionary-archive` commit `9cb709b87f43c7bceb494eefbe7f8b8f42744502`, Git blob SHA-1 `e6e448946b29480a765f167e9ee1cc3fc9314c6b`, Brotli archive size 895,754 bytes and SHA-256 `175d4fe7b846fb0ab140d5f341bc07c66c8eb9dc4f970c2fa97b1e9d7d6497eb`, and the XML values above (`reports/gates/PHASE-14.4B-KANJIDIC2-ACQUISITION-FOUNDATION.md:23-35`). The expected values are also in `src/etl/kanji/kanjidic2Contract.ts:20-40`. The report says it recomputed archive/XML bytes, checked header versions and streamed 13,108 entries; it also says acquisition output was transient and no XML was committed (`:48-66`). These are reproducible-looking historical claims, but current bytes are absent, so this report did not re-run those measurements.

A provenance plan must separate EDRDG's authoritative release identity from the Jitendex mirror/transport identity, and verify the pinned mirror commit/tree/blob plus measured compressed bytes, Brotli output, XML bytes, header version and record count. Do not use the manifest's mutable URL as the artifact identity.

### 4.4 Historical evidence, not present verification

The manifests have status strings `verified`, and prior reports use “PASS/GO” language. Those strings establish what the repository records, not what exists now. `docs/architecture/PROVENANCE-QUALITY-CONTRACT.md:119-173` itself distinguishes source registration from acquisition and says artifact digests must be measured from bytes actually present. Current artifact status for both source families is therefore **ABSENT; observed digest unavailable; historical expected-digest claim unverified in this checkout**.

The historical KANJIVG coverage report claims 6,413 matched, 6,695 missing, and 286 source-only characters against a 13,108-character baseline (`reports/gates/PHASE-14.4D-KANJIVG-COVERAGE.md:11-38`). The decomposition gate tests lock numerous additional output counts (`tests/kanji-decomposition-gates.test.ts:187-225`). They are useful hypotheses for re-establishment, not current measurements or acceptance targets. No KanjiVG/KANJIDIC2 checksum, inventory, or graph output is verified in M1-C.

## 5. What each source can establish; mapping limits

The repository's KanjiVG architecture describes SVG root/group/path structure and stroke IDs/types (`docs/architecture/KANJIVG-VISUAL-MODEL.md:40-50`). The current parser reads a filename/root codepoint, path data/IDs/types and `kvg:element`, `kvg:position`, `kvg:radical`, `kvg:part`, and `kvg:number` attributes (`src/etl/kanji/kanjiVgParser.ts:157-180, 182-242`). That is visual/source markup, not proof that each shape is a semantic radical, phonetic element, historical component, or etymology.

The parser flattens `<g>` tags and returns component records without parent links (`kanjiVgParser.ts:206-242`). The visual transformer deduplicates by `element:position` (`src/etl/kanji/kanjiVgTransformer.ts:139-150`), so that path is not suitable as-is for an occurrence-preserving graph. The separate 14.4F engine has a stack walk that does preserve group parent indices, group IDs, stroke membership and selected `kvg:*` attributes (`scripts/ingest-kanji-decomposition.ts:521-568, 569-659`); however, that remains a transformation interpretation and needs actual-source review. It maps only explicit `kvg:phon` to role `phonetic`, otherwise `structural` (`:798-818`), which must not be presented as an independently verified linguistic judgment.

| Candidate fact / mapping | Evidence class | Plan and limitation |
|---|---|---|
| KanjiVG filename codepoint and root `kvg:element` | Filename/root attribute directly encoded; equality check is deterministic | Preserve filename, exact codepoint, inner root literal and raw SVG hash. Reject mismatches; do not synthesize a root from a KANJIDIC2 record. |
| Stroke path ID, path geometry, `kvg:type`, source ordering | Direct source attributes/sequence; ordering checks are deterministic transformation | Retain source file and path IDs, exact `d`, source ordinal and checked order. Stroke order is visual evidence only; it is not a component decomposition claim. |
| Nested element-group containment | Parent/child nesting is directly encoded in SVG markup; mapping to typed graph edges is deterministic only when the XML tree is faithfully parsed | Preserve group IDs, parent group IDs, order and raw group path. Require review for malformed, ambiguous or unusual nesting. Do not infer an IDS tree or semantic hierarchy. |
| Component identity from `kvg:element` | Literal directly encoded; cross-glyph identity is transformation policy | Keep source literal and occurrence distinct. A shared component identity key needs an explicit exact mapping rule. Do not merge on rendered shape, Unicode normalization, or character text alone. |
| Position, `kvg:radical`, `kvg:phon`, `kvg:part`, `kvg:number`, variant markers | Attribute values directly encoded; role/category mapping is derived | Retain raw values alongside any controlled mapped value. Radical marking is classification, not containment. `kvg:phon` may support a source-asserted phonetic label but not historical origin. Unknown values remain unmapped/review-required. |
| Filename-suffix KanjiVG “variants” vs `kvg:variant` / `kvg:original` | Distinct direct source signals; interpreting as one `variant_of` meaning is unsupported without a rule | Keep style/calligraphic filename variants separate from marked element variants and from Unicode identity variants. Human review decides any crosswalk; never fold records by default. |
| KANJIDIC2 glyph identity and codepoint | `<literal>` and UCS `<cp_value>` fields directly encoded; matching to a KanjiVG glyph is a deterministic exact-key join after source validation | Preserve exact scalar/codepoint values and report missing/extra/ambiguous joins. KANJIDIC2 is a dictionary/cross-check source, not a component-decomposition source. |
| KANJIDIC2 readings, meanings, grades, stroke counts, radical indices, variant values | Source dictionary fields directly encoded; transformations can classify by their field tags | Use readings/meanings only in their separate dictionary domain. Radical indices are not component trees. Keep `var_type` and raw `value`; a coded variant value is not automatically a Unicode character or graph edge. |
| Etymological, semantic-component, pedagogical claims | Unsupported by these structural fields alone | Requires separate documented scholarly/human evidence and review; never infer from graph validity or AI text. |

KANJIDIC2's parser types include UCS/JIS codepoints, radical indices, variants, readings, meanings and nanori (`src/etl/kanji/types.ts:73-112`); parser functions handle `<literal>`, `<cp_value>`, `<rad_value>`, `<variant>`, readings and meanings (`src/etl/kanji/xmlParser.ts:78-127, 162-200, 207-279`). None of these fields encodes KanjiVG group nesting or proves etymology.

### Unicode, variants, and missing-source policy

- Preserve exact source strings and scalar sequences. Do not NFC/NFKC-normalize or compatibility-fold source identity. The current M1 glyph field permits one Unicode scalar; it cannot represent a base-plus-variation-selector sequence as one glyph identity. If IVS/sequence identity is in scope, define it before source mapping (for example, a sequence-valued identity plus the exact scalar list) and version the contract.
- Supplementary-plane scalars are representable by M1's scalar string, but the current KanjiVG filename/parser assumptions use four/five hex digits (`kanjiVgParser.ts:170-175`; acquisition verifier `:130-142`). Verify the supported source inventory rather than infer coverage from the validator's Unicode capacity.
- Compatibility ideographs remain distinct exact codepoints. Reconciliation to another form requires explicit reviewed mapping evidence; no canonicalization may silently merge them.
- The existing decomposition engine calls `.normalize("NFC")` while resolving component identity (`scripts/ingest-kanji-decomposition.ts:742-750`), although it retains raw `elementLiteral`. That may make identity keys collide for distinct raw strings. Any future M1 mapping must preserve exact literals and, if a normalization-based lookup is separately approved, record both exact input and normalization/mapping rule.
- For a glyph present in one source but absent in another, record source-specific `present`, `absent`, `not-applicable`, or `ambiguous` classifications. Preserve a real source-only record where allowed; do not fabricate an SVG, reading, or graph relationship to close a coverage gap.

## 6. Proposed provenance and digest model (design only)

Use separate records/identifiers rather than overload the current single-source graph provenance:

| Entity | Minimum fields / meaning |
|---|---|
| **Source identity** | Stable source ID; source name; authoritative home/release URL; release date/tag/version/commit; license identifier and source-specific qualification; required attribution; source status and confidence. For KANJIDIC2, distinguish EDRDG as source from the mirror used to transport bytes. |
| **Source artifact identity** | Artifact ID; source ID; exact path/name; media/encoding/compression; measured byte length; `declaredDigest`, `expectedDigest`, `observedDigest`; acquisition/mirror identity; acquisition timestamp/tool; extracted/member artifact identities. Archive, index, decompressed XML and each SVG must not share one artifact digest. |
| **Transformation identity** | Transformation spec ID/version; source-code revision or exact source-tree digest; configuration/mapping-table digest; runtime and dependency-lock identity; invocation parameters. Do not use a free-form version string as the only transformation identity. |
| **Derived artifact identity** | Exact output path/format; exact output byte length and `derivedDigest`; all input artifact IDs/digests; transformation identity; deterministic rebuild result. This is the hash of the emitted bytes, not a source digest. |
| **Evidence claim** | Claim type/scope; which exact source artifacts and fields support it; coverage denominator/numerator; unmapped, rejected and ambiguous counts; structural interpretation limits; verification result and evidence links. |
| **Review status** | Draft/reviewed/approved/published/rejected plus reviewer, timestamp and decision notes. Keep this human process separate from checksum, source-identity and rebuild verification. AI explanatory overlays remain separate, noncanonical records. |

Digest terms for any future record:

- **`declaredDigest`** — digest text claimed by a manifest, caller or prior report. Metadata only.
- **`expectedDigest`** — digest established independently of the artifact being checked, with its trust source/procedure recorded (for example a release/commit/blob identity independently resolved and attested). A copied test constant is not, by itself, an independent expectation.
- **`observedDigest`** — digest recomputed from the exact artifact bytes read in the authorized verification run.
- **`derivedDigest`** — digest computed from the exact output artifact bytes after transformation.
- **`canonicalGraphDigest`** — optional digest of the exact UTF-8 bytes of a formally specified canonical graph serialization. It is not interchangeable with archive, extracted-input or derived-file digests.

A match is meaningful only after byte length and `observedDigest` are measured and compared with a separately grounded `expectedDigest`. Equality of two declared values is not verification.

### Canonical graph serialization proposal

The current `nihongobridge-canonical-json@1` returns `JSON.stringify` output after sorting graph nodes/edges by ID and object keys (`src/lib/kanji/structuralEvidenceGraph.ts:648-670`). It does not specify a byte encoding or compute a hash. Before any canonical graph digest is used, publish and test a complete versioned specification (proposed new `nihongobridge-canonical-json@2`):

1. Validate the exact schema first. Missing required fields, unknown fields, accessors, invalid numeric values and invalid graph invariants produce **no** serialization/digest. Required `null` remains explicit JSON `null`; absent/undefined is invalid, never silently omitted.
2. Serialize the validated graph projection only. Sort top-level and nested object keys by UTF-16 code-unit ordinal comparison. Sort `nodes` and `edges` by exact ID with the same ordinal comparison; duplicate IDs are invalid. Preserve any future semantically ordered arrays exactly and require a version change if array rules change.
3. Preserve all source strings exactly; no Unicode normalization or compatibility folding. Escape JSON quote, reverse solidus and control characters by a single documented escape table; escape unpaired surrogate code units as lowercase `\uXXXX`; emit other Unicode scalar values directly. Reject NaN, infinities, unsafe integers and negative zero; only contract-allowed safe integer values serialize.
4. Encode the resulting JSON text as UTF-8, with no BOM and no trailing newline. `canonicalGraphDigest = SHA-256(UTF-8(serialized text))`.

This constrained JSON profile can be implemented with the existing runtime's sorting/serialization plus built-in `node:crypto`/UTF-8 APIs, without adding a dependency, but exact escaping and byte-level test vectors must be checked across supported runtimes before relying on it. A canonical graph digest would identify a graph projection only; the exact derived JSON files still get their own `derivedDigest`.

## 7. Coverage and acceptance design

No corpus acceptance percentages or record thresholds are set here. Historical counts are provisional until independently reproduced. For each future run, publish the measured inventory and classification counts before evaluating any owner-set threshold.

| Acceptance area | Proposed measurable check | Threshold source/status |
|---|---|---|
| Source identity | Verify official release/tag and immutable commit/tree/blob; independently verify mirror path and transport artifact | Historical IDs in §4 are claims to re-establish; no current acceptance value verified |
| Artifact inventory | Enumerate archive members, types, paths, lengths and hashes; count SVG/XML/index/support files; reject traversal, absolute paths, duplicate paths, unsafe link entries and unexpected roots | Exact counts must be re-derived from verified bytes. Zero duplicate identities and exact archive-to-extracted inventory equality are invariants derived from the verified inventory, not present measurements |
| KanjiVG index | Parse JSON strictly; verify keys and listed files against the archive inventory; regenerate with pinned upstream `make-index.py` semantics and compare exact bytes | Index expected digest/key count are historical. Regeneration equality is a deterministic invariant once the source revision is verified |
| KANJIDIC2 | Verify pinned mirror commit/blob, compressed archive bytes, decompression, XML bytes, header release/file/database versions, record balance and exact `<literal>` count; compare declared XML digest with measured XML bytes | 13,108 and digest/size values are historical assertions; re-establish before treating as expected values |
| Character reconciliation | Compare exact UCS scalar sequence and exact literal across source inventories; classify intersection, KVG-only, KANJIDIC2-only, malformed, duplicate and ambiguous cases; preserve source-specific absences | No normalization. Counts derived from verified inventories; any coverage percentage threshold awaits owner decision |
| Source-to-graph mapping | For every emitted glyph/component/occurrence/edge retain artifact ID, filename, group ID, parent group, exact source literal, source order and transformation rule; count unmapped and rejected source groups | Zero dangling/duplicate graph identities follows contract invariants; minimum mapping coverage is not set and awaits owner decision |
| Graph invariants | Apply the M1 validator to actual proposed outputs; separately audit source-to-output references, typed-edge semantics, exact occurrence preservation, cycles and duplicate relationships | Synthetic M1 tests are not this gate. No corpus-derived graph is presently validated |
| Determinism | Rebuild twice from the same immutable inputs, code/config/dependency/runtime identity in isolated temporary locations; compare exact derived bytes and per-file `derivedDigest` values | Byte-identical output is the reproducibility invariant; environment/tool pin details await owner approval |
| Review sample | Select at least one verified instance from each requested stratum: ordinary glyph, repeated same visual component, filename/marked variant, unsupported/absent case, and ambiguous nesting/identity. Preserve source snippets/paths for human review without redistributing source in this planning phase | Sample members must be selected after inventory; reviewer count/sign-off authority and any larger sample size await owner decision |
| License/attribution | Verify notice/license files from actual source bytes, retain attribution/qualifications, classify output/redistribution and share-alike obligations; keep per-source notices in combined outputs | Technical presence check is not legal clearance; redistribution decision awaits owner/qualified counsel |

No glyph absent from one source may be treated as a failed record without a documented applicability rule; no missing relationship may be guessed. Reports must show all unresolved and rejected cases rather than hide them in an aggregate pass percentage.

## 8. Licensing and attribution

Repository records identify both KANJIDIC2 and KanjiVG as CC BY-SA 3.0 and record EDRDG attribution for KANJIDIC2 and Ulrich Apel/KanjiVG attribution for KanjiVG (`src/etl/kanji/kanjidic2Contract.ts:29-33`; `reports/gates/PHASE-14.4D-KANJIVG-ACQUISITION-MANIFEST.json:8-10`). The KANJIDIC2 contract also records a source-specific qualification that many non-English translations are separately copyrighted and not covered (`kanjidic2Contract.ts:29-33`). The KanjiVG historical report says its archive `COPYING` and `README.md` provided the CC BY-SA 3.0 and attribution evidence (`PHASE-14.4D-CONTROLLED-KANJIVG-INGESTION.md:41-47`). Those actual files are absent now; the license conclusions are repository-recorded historical claims, not current inspection of authoritative license bytes.

Keep these decisions separate:

- **Technical verification:** artifact bytes, release identity, hash, extraction and output reproducibility.
- **Source provenance:** who supplied each file and what source field it supports.
- **License interpretation:** whether an extracted or transformed structure is an adaptation and what notices/share-alike terms attach.
- **Product redistribution:** whether combined source-derived evidence may be stored, served, bundled or combined with proprietary first-party content.

Do not issue legal clearance. Owner/qualified legal review must determine (a) applicable CC BY-SA 3.0 notice and attribution wording, (b) whether modified SVGs, extracted group graphs, indexes or combined datasets are adapted material, (c) share-alike scope and distribution obligations, (d) treatment of KANJIDIC2 non-English translations and third-party material, (e) compatibility and separation from proprietary first-party data, and (f) license/attribution display at file, API, application and export boundaries.

## 9. Security, determinism, and reproducibility risks

1. **Extracted-tree substitution:** the current source identity functions validate archive/index hashes and corpus counts but do not establish every working SVG's byte equality with its archive member (`verify-kanji-decomposition.ts:194-198, 223-252`; engine `:487-514`). Bind every file used by a transform to a verified archive member and observed digest.
2. **Source identity overclaim:** the KanjiVG acquisition helper's repository check is a non-empty archive listing, not a tag/commit proof (`scripts/verify-kanjivg-acquisition.ts:144-147`). Verify tag object, commit, tree and blob identity independently and record the method/output.
3. **Parser robustness:** existing SVG parsing is regex-based (`src/etl/kanji/kanjiVgParser.ts:182-242`; decomposition group walk `scripts/ingest-kanji-decomposition.ts:569-659`). A future source-backed transform must validate well-formed XML, nesting closure, namespaces, entity behavior, group/stroke IDs and unsafe external references using a reviewed parser/security boundary; do not treat regex checks alone as a complete XML security model.
4. **Occurrence loss / identity collision:** the visual transformer deduplicates by element plus position (`kanjiVgTransformer.ts:139-150`). The decomposition engine's normalization-based lookup (`ingest-kanji-decomposition.ts:742-750`) may also merge exact-distinct literals. Preserve group occurrence identity and exact strings before any entity resolution.
5. **Digest ambiguity:** archive, extracted source, index, derived files, state metadata and canonical graph projection have different byte identities. Label each; do not call a caller pin or canonical JSON string an observed source digest.
6. **Historical report dependence:** reports and duplicated test constants can repeat one mistaken value. Record the independent expected-digest trust source, measured bytes, tool/runtime, and verification transcript. Current one-commit shallow history limits independent chronology.
7. **Rebuild drift:** parser/runtime, map table, code revision, ordering, line endings and JSON escaping can affect derived bytes. Pin them and verify exact output bytes twice.
8. **Tar/archive safety:** before any future extraction, validate member paths/types, reject traversal, absolute paths, links and duplicate names, impose decompression/size limits, and extract to an isolated fresh directory. No extraction was performed in M1-C.
9. **Existing gate hazards:** the decomposition run targets a DB by default unless explicitly classified and deletes staging/previous output paths (`scripts/ingest-kanji-decomposition.ts:684-710, 1056-1097, 1124-1172`). Its gate test removes fixed paths during setup/teardown (`tests/kanji-decomposition-gates.test.ts:167-175`) and invokes the engine/CLI (`:179-185, 269-274`). These were inspected statically and not run.

## 10. Non-goals and prohibited actions honored

No source was acquired, downloaded, extracted, ingested or transformed. No database, Supabase, production resource, secret value, deployment system or network endpoint was accessed. No package was installed; package manifests and lockfiles were untouched. No ingestion, decomposition, broad Vitest, artifact-dependent or database-dependent test ran. No schema, canonical data, service, route, UI, editorial workflow, SRS/Phase 26F gate, branch, remote, commit, PR, merge or deployment was changed.

The existing M1-B test was run because static inspection established it imports only Node test/assert/read-file APIs and the isolated validator; it contains no write or service call. It does not read source artifacts.

## 11. Required owner decisions before a separate acquisition phase

1. Authorize a bounded acquisition plan specifying the permitted source endpoints/mirrors and whether the KANJIDIC2 archive mirror is acceptable alongside EDRDG's release identity.
2. Decide whether both sources are required for M1 structural evidence, or whether KANJIDIC2 is only an identity/coverage cross-check.
3. Approve a multi-artifact provenance schema and transformation/output identity model; decide whether M1 graph v2 is adequate as a validation projection or must be extended in a separately versioned change.
4. Decide the supported glyph identity domain: scalar vs IVS/sequence identities, compatibility ideographs, supplementary planes and source-only glyphs. Require exact string preservation and explicit mapping for any equivalence.
5. Decide how source `kvg:element`, raw component identities, repeated occurrences, variant file suffixes and `kvg:original` map into graph node/edge identity without merging distinct evidence.
6. Approve the canonical byte serialization/digest specification before publishing canonical graph digests.
7. Set any minimum coverage/review thresholds only after verified inventory; none is proposed by this report.
8. Name technical verifier and human reviewer roles, legal reviewer, review evidence retention and source attribution display/distribution policy.
9. Decide whether outputs are temporary audit artifacts or may later be retained/persisted; this report authorizes neither retention nor integration.

## 12. Smallest safe next step

Obtain owner approval for a narrowly scoped **read-only-after-acquisition** verification protocol covering (i) source endpoint and immutable source identities, (ii) exact files to acquire and storage location, (iii) trusted expected-digest sources, (iv) safe archive handling, and (v) the acceptance transcript/output to retain. Only after that separate authorization should a future phase acquire bytes and recompute observed identities. Do not start acquisition or ingestion from this report.

## 13. Reproducible checks and evidence citations

The only runtime test run in M1-C was:

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test tests/kanji-mindtree-contract.test.mjs
```

**Result:** 21 tests passed, 0 failed. No M1-C source-backed test exists yet. No other test command ran. All source/gate scripts cited above were read statically only.
