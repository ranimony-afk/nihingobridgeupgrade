# Grammar Knowledge Model

**Status**: EXISTING foundation audited · relationship/provenance layer DESIGNED (Phase 14.6A)
**Phase**: 14.6A
**Last updated**: 2026-09-24

---

## 1. What already exists (audited, not assumed)

| Artifact | Location | State |
| :--- | :--- | :--- |
| `grammar_patterns` table | `src/db/schema.ts:730` | Present. `id`, `slug` (unique), `title`, `structure`, `meaning`, `explanation`, `formation`, `jlpt_level` (**NOT NULL**), `common_mistakes`, `tags`, `source_ref` |
| ETL types + JLPT helpers | `src/etl/grammar/types.ts` | Present: `GrammarPatternInput`, `CanonicalGrammarPattern`, `VALID_JLPT_LEVELS`, `isValidJLPTLevel`, `normalizeJLPTLevel` |
| ETL fixture | `src/etl/grammar/fixture.ts` | Present — a **small first-party pilot set**, not a corpus |
| ETL pipeline | `src/etl/grammar/{loader,transformer,pipeline}.ts` | Present |
| Service | `src/services/grammar/grammarService.ts` | Present |
| Tests | `tests/grammar-engine.test.ts` | **9 tests, all SKIPPED** — require a seeded database |

So grammar is **PARTIALLY IMPLEMENTED**: schema, ETL scaffolding, service, and a small
first-party fixture exist; there is no large corpus, no relationship model, and no
provenance model beyond a `source_ref` string.

**This phase authors no grammar corpus** (per §11: "Do not invent a large grammar corpus").

---

## 2. Gap this model closes

The canonical row expresses *what a pattern is*. It does not express:

- **where a JLPT level came from** — `jlpt_level` is `NOT NULL`, so a level is
  structurally required even when no evidence exists;
- **how patterns relate** — no similar/contrast/variant edges exist;
- **how much authority a record carries** — a `source_ref` string cannot
  distinguish canonical, human-verified, and AI-suggested content;
- **register and structural constraints** — beyond a free-text `structure`.

`src/types/grammar.ts` (Phase 14.6A) adds these as typed layers.

---

## 3. The JLPT problem, stated precisely

`jlpt_level` is `NOT NULL` in the database. That is a structural pressure to write
*something* for every pattern. Combined with a corpus of unverified provenance, it is
precisely how fabricated classifications enter a system.

The model therefore separates **the stored value** from **its evidentiary basis**:

```ts
interface JlptEvidence {
  level: JLPTLevel;
  basis:
    | "registered_source"   // traceable to a registered source id
    | "official_list"       // published JLPT pattern list
    | "corpus_frequency"    // derived from corpus frequency evidence
    | "editorial"           // a human editor decided
    | "unattested";         // asserted with no traceable source
  sourceId?: string;
  note?: string;
}
```

Rules:

1. `basis: "unattested"` is **admissible but never verified**. Such a record is
   flagged for review and its level must not be surfaced as authoritative.
2. `hasVerifiedJlpt()` returns false for `null` **and** for `unattested` — absence of
   evidence and unverifiable evidence are treated identically for surfacing purposes.
3. A `NOT NULL` database column is **not** evidence. Nothing in the ingestion path may
   promote a stored value to verified without a `basis`.

This mirrors the invariant already applied elsewhere in the project: a kanji's *possible*
readings are not evidence of the reading used in context, and a sentence's *linked*
vocabulary level is not a sentence-level JLPT classification.

---

## 4. Authority model

```ts
type GrammarAuthority = "canonical" | "verified_human" | "ai_suggested";
```

`ai_suggested` exists so AI output has a legitimate place to live that is **visibly** not
canonical. It is never learner-visible.

`isLearnerVisible(record)` fails closed:

| Condition | Learner-visible |
| :--- | :--- |
| `authority === "ai_suggested"` | **No** |
| `requiresReview === true` | **No** |
| otherwise | Yes |

This preserves the project-wide rule that AI must never become canonical knowledge.

---

## 5. Relationship model (§12)

Nine controlled relation types:

```
similar  contrast  preceded_by  followed_by  requires
often_confused_with  formal_variant  casual_variant  keigo_variant
```

The set is **closed** (`GRAMMAR_RELATION_TYPES`, with `isGrammarRelationType` as a guard).
An open string type would let unchecked categories into a canonical graph, and would make
"what relationships exist?" unanswerable without a data scan.

```ts
interface GrammarRelation {
  id: string;                    // deterministic
  fromPatternId: string;
  toPatternId: string;
  relation: GrammarRelationType;
  rationale: string;             // REQUIRED
  provenance: GrammarProvenance;
}
```

Design decisions:

- **`rationale` is required.** An unexplained edge is not admissible. A relation without a
  stated reason cannot be reviewed, and an unreviewable edge in a canonical graph is a
  liability.
- **Edges are stored directed, even for symmetric relations.** `contrast` is symmetric in
  meaning, but both directions are written explicitly so no query has to guess, and no
  consumer has to know which relations happen to be symmetric.
- **Deterministic ids** via `generateGrammarRelationId(from, relation, to)` producing
  `gr:<from>:<relation>:<to>`. Re-deriving the same edge yields the same id, so ingestion is
  idempotent and cannot create duplicates. No UUIDs, no timestamps, no ordering dependence.

---

## 6. Register and restrictions

Register is modelled as **separate axes**, not one scale — politeness, medium, and
business-appropriateness are independent, and collapsing them loses distinctions that
matter for learner guidance.

```ts
interface GrammarRestrictions {
  precedingForm?: string;   // e.g. "Verb て-form"
  followingForm?: string;
  attachesTo?: string[];
  excludes?: string[];      // conditions under which it is ungrammatical
}
```

`excludes` matters as much as `precedingForm`: a pattern's *ungrammatical* contexts are
where learner errors concentrate, and they are what `common_mistakes` can only describe
informally.

---

## 7. Provenance

Every record and every edge carries `GrammarProvenance`:

```ts
interface GrammarProvenance {
  authority: GrammarAuthority;
  sourceRef: string;        // registered source id
  generatedBy?: string;     // model/version, only when ai_suggested
  requiresReview: boolean;
}
```

Per the project-wide provenance rule, `"latest"`, `"unknown"`, `"manual"`, and `"AI"` are
**not** acceptable substitutes for a real source reference. Where provenance is genuinely
unknown, the correct representation is `requiresReview: true` — not a plausible-looking
placeholder that later reads as verified.

---

## 8. Testability note

`tests/grammar-engine.test.ts` is **9 tests, all skipped**, because it requires a seeded
canonical database. The helpers in `src/types/grammar.ts`
(`isGrammarRelationType`, `generateGrammarRelationId`, `isLearnerVisible`,
`hasVerifiedJlpt`) are pure functions and are unit-testable without a database — the same
separation applied to the dictionary/kanji route tests in 14.4F-R.

---

## 9. Explicitly out of scope

- Authoring a grammar corpus.
- Assigning JLPT levels to patterns without a `basis`.
- Migrating `grammar_patterns` to add relationship or provenance columns — that would
  require a schema proposal and explicit authorization (§21), and has **not** been
  proposed or performed.
- Grammar-based sentence matching (depends on 14.5B).
