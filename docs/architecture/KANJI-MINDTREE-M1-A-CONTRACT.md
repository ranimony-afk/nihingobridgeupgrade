# Kanji MindTree — M1-B Structural Evidence Contract

**Status:** M1-B local, synthetic-only contract hardening; no corpus integration or learner activation
**Contract:** `nihongobridge-kanji-structure@2`
**Canonicalization:** `nihongobridge-canonical-json@1`
**Last updated:** 2026-10-29

## M1-B verdict and boundary

**M1-B verdict: PASS for the hermetic Node runtime/contract scope only.** The
unknown-input validator, deterministic canonical JSON, and expanded synthetic
suite are isolated in `src/lib/kanji/structuralEvidenceGraph.ts` and
`tests/kanji-mindtree-contract.test.mjs`. TypeScript static type-checking was
not available in this checkout, so this is not a type-check verdict. It is not
source-backed acceptance, a production readiness claim, or approval to
integrate data.

The existing learner-oriented models remain in place: `MindNode`, `MindEdge`,
`MindTree` and `KnowledgeService.buildMindTree()` in
`src/services/knowledge/knowledgeService.ts`, plus `KanjiMindTreeModel` in
`src/services/knowledge/kanjiLexicalGraphService.ts`. The structural-evidence
module does not replace or adapt those services and is not wired into an API,
database, page, SRS, CMS, or learner feature. The Phase 14.4F decomposition
engine and its artifact/database-dependent tests are untouched and are not
part of this gate.

## Contract shape

The graph has exactly these top-level fields: `contractVersion`,
`canonicalizationVersion`, `transformationVersion`, `provenance`, `nodes`, and
`edges`. Unknown fields are rejected, including editorial or AI overlay
fields. Provenance has exactly `sourceRef`, `sourceVersion`,
`declaredContentDigest`, `license`, and `attribution`. The expected-pin input
has those same provenance pins plus `transformationVersion`.

| Node / relation | Structural meaning |
|---|---|
| `glyph` | One exact scalar `character`, with an opaque node ID. It is a root, not itself a component. |
| `component` | A reusable exact `identity` key and an explicitly present `character` that is either one scalar or `null`. |
| `occurrence` | One appearance, with its own ID, owning `glyphId`, `componentId`, exact `renderedAs`, required `position` (`null` means no position claim), and non-negative safe-integer `orderIndex`. Repeated components have distinct occurrence IDs and distinct order indexes within a glyph. |
| `contains` | Parent → child. The source is a glyph or occurrence and the target is an occurrence. Every occurrence has exactly one containing parent; parent and child occurrences must share a glyph. |
| `instance_of` | Occurrence → component. Its target matches `componentId`, and every occurrence has exactly one such edge. |
| `variant_of` | Component → distinct component identity. Neither identity is folded into the other; equal character text alone does not merge identities. |

Every edge ID must equal the deterministic, length-framed ID from
`deriveStructuralRelationId(type, from, to)`. Framing prevents delimiter-bearing
endpoint IDs from colliding. IDs, identities, characters, and rendered forms
are not normalized or inferred.

Containment describes only a parent-child assertion in a represented graph.
It does **not** claim an IDS decomposition, semantic or phonetic contribution,
historical origin, etymology, or pedagogical mnemonic.

## Shape, Unicode, and reference rules

- Records must be ordinary plain data objects (or null-prototype records),
  with enumerable data properties only. Custom prototypes, accessors, symbol
  keys, and unknown fields fail closed. Arrays must be dense ordinary arrays
  with no accessors, symbols, or extra properties.
- The validator inspects property descriptors and does not call getters. A
  hostile JavaScript `Proxy` can still run its own reflection traps when
  inspected; thrown reflection errors are caught and reduced to a stable
  failure. This is not a sandbox for executing adversarial objects. Prefer
  data parsed from JSON or otherwise materialized as plain data.
- Strings are preserved exactly: no NFC/NFKC normalization, compatibility
  folding, trimming, or coercive conversion. Glyph and non-null component
  characters must be exactly one Unicode scalar, excluding C0/C1 controls and
  Unicode noncharacters. This is a syntax rule, not a Kanji repertoire check.
  The contract intentionally makes no claim that an accepted scalar is Kanji,
  is supported by a source, or exists in `kanji_entries`.
- Component identity and rendered form are bounded, non-empty exact strings.
  Opaque IDs are bounded, non-empty strings. All references must resolve to
  the correct node kind. Duplicate node IDs, exact glyph characters, component
  identities, edge IDs, directed relationships, and per-glyph occurrence order
  are rejected. `-0` is rejected as an order index rather than treated as `0`.
- `contains` and `variant_of` are checked for graph-wide directed cycles using
  iterative traversal; no recursive call-depth dependence is used.

## Resource bounds and deterministic outputs

One graph is limited to 100,000 nodes and 200,000 edges. Individual records
are limited to 32 own fields. String limits are: node ID 512 UTF-16 code
units, edge ID 1,200, component identity 4,096, rendered form 4,096,
position 256, each provenance string 4,096, and transformation version 256.
Oversized graph arrays are rejected before element traversal. The implementation
uses O(V + E) graph storage/traversal, plus sorting for deterministic output;
these limits are contract bounds, not a wall-clock or memory guarantee for a
host process.

Validation returns stable issue codes and generic, index-independent paths
(such as `$.nodes[].id`); arbitrary unknown field names and hostile exception
text are not echoed. Issues sort by code, then path, then message. Results do
not expose input array indexes, map iteration order, or object key order.
Validation does not mutate the caller's graph.

Canonical JSON v1 validates first, sorts nodes and edges by ID, recursively
sorts object keys using ordinal string comparison, and serializes with
`JSON.stringify`. It preserves string code points exactly. Canonicalization is
versioned; changing these rules requires a new canonicalization version. This
function returns serialized text only: **it does not compute a cryptographic
hash**.

## Provenance and digest assurance

A caller supplies expected policy pins. The validator checks the graph's
`declaredContentDigest` is lowercase 64-character SHA-256 hex and exactly
matches the caller's expected pin, along with the other provenance and
transformation strings. The name `declaredContentDigest` is deliberate:
well-formed syntax and string equality prove neither that bytes were hashed,
nor which artifact was hashed, nor that the digest is authentic. The module
has no source bytes, hash implementation, artifact acquisition, or independent
trust anchor. A verified source digest requires a separately authorized and
reproducible acquisition/derivation procedure.

## Content-class separation and existing code

1. **Canonical learning content** remains in the existing canonical tables and
   first-party data. This work makes no schema, migration, or row changes.
2. **Structural evidence** is a separate typed graph. It is not automatically
   canonical learning content and is not persisted or published here.
3. **Editorial and AI-assisted explanations** are noncanonical overlays and
   are not graph fields or relation types. Unknown overlay fields are rejected
   by this contract. No model call, editorial service, or CMS behavior is
   implemented or changed.

The proposed editorial lifecycle and existing CMS transitions are outside
this contract. No statement here changes Phase 26F containment gates, SRS
behavior, or release criteria.

## Verification scope and remaining gates

`tests/kanji-mindtree-contract.test.mjs` contains 21 synthetic-only tests for
shape and hostile-input handling, Unicode exactness, identities and references,
typed relations, containment/variant cycles (including a deep acyclic graph),
resource bounds, issue determinism, canonical serialization, digest semantics,
and module isolation. The reproducible targeted command is:

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test tests/kanji-mindtree-contract.test.mjs
node --experimental-strip-types --check src/lib/kanji/structuralEvidenceGraph.ts
```

The first command passes all 21 tests; the second passes Node's syntax check.
Neither performs TypeScript static type-checking. `node_modules` and a global
`tsc` are absent, and dependencies were not installed. Broad Vitest and
artifact/database-dependent suites were not run. Synthetic structural validity
is not linguistic or source-backed correctness.

No KANJIDIC2, KanjiVG, or derived decomposition artifact was present in the
inspected checkout. No corpus, database, schema, service, route, UI, SRS,
Phase 26F gate, or deployment integration was performed. Remaining gates
include independent source-artifact acquisition and checksum verification,
source-specific mapping/coverage and license review, any approved
schema/service integration, existing artifact/database-dependent tests in an
authorized environment, and separate learner/release acceptance. None is
implied by the M1-B local verdict.

**Smallest next step:** obtain explicit approval for a separately scoped,
source-backed provenance/artifact verification plan; do not feed this validator
production data or enable learner-facing behavior as part of M1-B.
