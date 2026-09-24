# Grammar ETL Contract

**Status**: EXISTING pipeline audited · contract DEFINED (Phase 14.6A)
**Phase**: 14.6A
**Last updated**: 2026-09-24

> This document constrains how grammar records enter the canonical store. It does
> **not** describe a corpus acquisition: no grammar corpus is fetched, authored,
> or scheduled by this phase.

---

## 1. Existing pipeline (audited)

```
src/etl/grammar/
├── types.ts         GrammarPatternInput, CanonicalGrammarPattern, JLPT helpers
├── fixture.ts       small first-party pilot set  (NOT a corpus)
├── transformer.ts   input -> canonical
├── loader.ts        canonical -> grammar_patterns
└── pipeline.ts      orchestration
```

Plus `src/services/grammar/grammarService.ts` for reads.

The pipeline is **fixture-driven**. There is no external grammar source configured, so
there is nothing to download, and `data/` contains no grammar artifact.

---

## 2. Contract: stage boundaries

```
GrammarPatternInput          (source-shaped, untrusted)
        ↓  validate
        ↓  transform            → CanonicalGrammarPattern  (+ optional JlptEvidence)
        ↓  derive relations     → GrammarRelation[]
        ↓  load                 → grammar_patterns  +  (future) relation store
CanonicalGrammarPattern
```

Each stage is a pure function of its input. Loading is the only stage permitted to perform
I/O.

---

## 3. Validation rules

A candidate record is rejected — never silently coerced — when:

| Condition | Reason code |
| :--- | :--- |
| `slug` missing or blank | `MISSING_SLUG` |
| `title` missing or blank | `MISSING_TITLE` |
| `structure` missing or blank | `MISSING_STRUCTURE` |
| `meaning` missing or blank | `MISSING_MEANING` |
| `jlptLevel` present but not `N5`–`N1` after normalization | `INVALID_JLPT_LEVEL` |
| `sourceRef` missing | `MISSING_PROVENANCE` |
| `sourceRef` not a registered source id | `UNREGISTERED_SOURCE` |
| duplicate `slug` within a batch | `DUPLICATE_SLUG` |

`normalizeJLPTLevel` (existing) is permissive — it accepts `5`, `n5`, `N5`. That
permissiveness is confined to the **parse** step; the resulting value must still be a
member of `VALID_JLPT_LEVELS` before it is stored. Normalizing an unrecognizable string
must fail, not default.

**Identifier rules.** `id` is deterministic and derived from `slug` (or the upstream
sequence when one exists), never a UUID or timestamp. The same input record must always
produce the same id, so re-running the pipeline is idempotent.

---

## 4. Provenance rules

Every record must carry a registered source reference. The pipeline must reject:

```
"latest"    "unknown"    "manual"    "AI"    ""    undefined
```

as `sourceRef` values. These are the four strings that most often appear in practice as
provenance placeholders, and each is indistinguishable from a real source id at read time.

Where provenance is genuinely unknown, the record is loaded with
`requiresReview: true` — an explicit, visible state — rather than a plausible-looking
placeholder.

`first-party:grammar-core:v1` is registered in the provenance registry and is the correct
reference for the existing pilot fixture. AI-generated enrichment must be
`authority: "ai_suggested"` with a `generatedBy` model identifier, and is never
learner-visible.

---

## 5. JLPT ingestion rule

Because `grammar_patterns.jlpt_level` is `NOT NULL`, ingestion is the point where
fabrication pressure is highest. The contract:

1. The transformer produces `JlptEvidence`, not a bare string.
2. Any level whose basis cannot be stated is `basis: "unattested"`.
3. An unattested level **may** be stored (the column requires a value) but the record is
   flagged `requiresReview: true` and `hasVerifiedJlpt()` returns false, so the level is
   not surfaced as authoritative.
4. **No level may be inferred** from pattern complexity, frequency, or similarity to
   another pattern. Those are not evidence.

This is a deliberate departure from "the column is NOT NULL so we must fill it": the column
is filled, but the *claim* is not upgraded.

---

## 6. Relationship derivation

Relations are derived into `GrammarRelation[]` with:

- a closed `relation` type (§12's nine categories);
- a required `rationale`;
- a deterministic `id` from `generateGrammarRelationId(from, relation, to)`;
- full `GrammarProvenance`.

Idempotency requirement: re-deriving relations from the same inputs must yield an identical
set of ids, so a re-run inserts zero new edges. Edges are stored directionally; each
direction is written explicitly.

**No AI-generated canonical grammar facts.** An AI-proposed relation is admissible only as
`authority: "ai_suggested"` with `requiresReview: true`, and must be reviewed before it can
be exposed.

---

## 7. Load semantics

| Condition | Behaviour |
| :--- | :--- |
| Record id absent | Insert |
| Record id present **and** all fields identical | Skip (counted as no-op) |
| Record id present, fields differ | Update **only** if incoming authority is `canonical` or `verified_human` |
| Incoming authority is `ai_suggested` | Never overwrite a canonical record |
| Batch contains duplicates by `slug` | Reject the batch before any write |

The last rule matters: a batch that would insert the same `slug` twice must fail *before*
the first write, not partway through, or the store is left partially written.

---

## 8. Storage status — no schema change proposed here

Relations have no table today. Two options exist and **neither is authorized**:

1. Add a `grammar_pattern_relations` table (would require a schema proposal under §21).
2. Keep relations in a derived/file-backed layer until they are needed.

Per §21, no migration is performed and no proposal is written speculatively. The typed
model in `src/types/grammar.ts` is usable in-memory today, and the storage decision is
deferred until a consumer actually requires persistence.

---

## 9. Testing contract

Pure-function surface (testable without a database): JLPT normalization and rejection,
relation-type guarding, deterministic relation ids, learner-visibility gating,
`hasVerifiedJlpt` semantics, and validation reason codes.

Database-dependent surface (`grammar-engine.test.ts`, currently 9 skipped): load
idempotency, duplicate-slug batch rejection, and authority-based overwrite rules. These
cannot run in an environment without a seeded canonical database, and are recorded as
skipped rather than deleted or converted to passes.
