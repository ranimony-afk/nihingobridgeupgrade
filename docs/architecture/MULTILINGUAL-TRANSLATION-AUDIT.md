# Multilingual Translation Audit

**Status**: IMPLEMENTED and VERIFIED for the surfaces audited · no bulk generation performed
**Phase**: 14.4F-R §13 (audits Phases 12B / 13.5C)
**Last updated**: 2026-09-24

> **No translations were generated, backfilled, or machine-produced during this phase.**
> This document audits what exists. Per §13's "no bulk generation" constraint and §28's
> prohibition on AI-generated translations, nothing here creates content.

---

## 1. Languages

```ts
// src/types/translation.ts:1
export const SUPPORTED_LANGUAGES = ["en", "ta", "ml"] as const;
```

**English (`en`), Tamil (`ta`), Malayalam (`ml`)** — confirmed as the only three supported
languages, enforced at every entry point:

| Entry point | Enforcement |
| :--- | :--- |
| `TranslationService.createTranslation` (:47) | Throws `Unsupported language "<x>". Must be one of: en, ta, ml` |
| `TranslationService` retrieval (:129) | Same check |
| `ReverseSearchService.search` (:28) | Same check |

The error message enumerates the permitted set, so a rejected call is self-explanatory —
worth noting because a silent `[]` here would read as "no translations exist".

Entity types: `dictionary`, `kanji`, `grammar`, `sentence`, `radical`, `jlpt`
(`SUPPORTED_ENTITY_TYPES`) — matching `entity_translations.entity_type`'s documented
domain exactly.

---

## 2. Storage

`entity_translations` (`src/db/schema.ts`) with:

| Column | Domain |
| :--- | :--- |
| `entity_type` | Controlled: dictionary · kanji · grammar · sentence · radical · jlpt |
| `entity_id` | Canonical entity reference (polymorphic, application-validated) |
| `language` | Controlled: `en` · `ta` · `ml` |
| `translated_text` | Primary localized searchable gloss |
| `secondary_text` | Optional transliteration/romanization |
| `context_notes` | Optional cultural/contextual/grammatical note |
| `source_type` | Controlled: `canonical` · `verified_human` · `machine` |
| `source_ref` | Attribution (dataset ref or model version) |
| `is_verified` | Qualified-speaker verification flag |

Indexes:

- `idx_entity_translations_unique` — **unique** on `(entity_type, entity_id, language, translated_text)`, so the same translation cannot be stored twice
- `idx_entity_translations_lookup` — `(entity_type, entity_id, language)` for forward lookup
- `idx_entity_translations_reverse` — `(language, translated_text)` for reverse lookup

The reverse index is what makes Tamil/Malayalam → Japanese lookup viable; without it,
`ReverseSearchService` would table-scan per query.

### 2.1 Note on the unique index shape

The unique index includes `translated_text`, so it prevents **exact duplicate rows** but
permits two *different* translations for the same entity+language — which is correct, since
a word can have several valid translations (水 → நீர் / தண்ணீர்). It is also exactly why
`checkTranslationConflicts` reports disagreement as a `WARNING` rather than an `ERROR`:
the schema deliberately allows multiple, and which is appropriate is a human call.

---

## 3. Verification status model

```ts
export const SUPPORTED_SOURCE_TYPES = ["canonical", "verified_human", "machine"] as const;
```

The intended priority — **canonical > verified_human > machine** — is partially enforced
in code:

| Location | Behaviour |
| :--- | :--- |
| `TranslationService` (:78) | `isVerified` is set true for `canonical` **or** `verified_human` |
| `TranslationService` (:105) | An incoming `verified_human` overwrites the stored `sourceType`; other types preserve the existing value |
| `TranslationService` (:159) | The CMS verification path writes `sourceType: "verified_human"` |
| `translationService.ts:22` comment | The verification path accepts a transaction handle so it can run against canonical data |

**The priority is a ranking, not an automatic selection.** Nothing in the audited code
picks a winner between a `canonical` and a `verified_human` translation for display — both
are marked verified, and both are retrievable. A consumer that needs a single gloss must
apply the ordering itself.

That is a documented gap rather than a defect: collapsing the ranking into an automatic
"best translation" would require deciding what happens on disagreement, and that is a
governance question. `checkTranslationConflicts` surfaces the disagreement so the decision
is informed.

### 3.1 `machine` translations are never silently promoted

`isVerified` becomes true only for `canonical` and `verified_human`. A `machine`
translation therefore cannot acquire verified status by being re-saved — it would have to
arrive with an explicit `sourceType` of `canonical`/`verified_human`, or pass through the
CMS verification path, which records `verified_human` explicitly.

This matches the project-wide rule that AI/machine output never becomes canonical knowledge
without human review.

---

## 4. Reverse search (multilingual → Japanese)

`ReverseSearchService` resolves Tamil/Malayalam/English text back to a canonical Japanese
entity via `resolveCanonicalEntity` (:76), a **safe polymorphic resolver** handling four
entity types:

| Entity type | Canonical English source |
| :--- | :--- |
| dictionary | `glossList.join("; ")` from senses (:97) |
| kanji | `kanji.meaning` (:111) |
| grammar | `grammar.meaning` (:125) |
| sentence | `sentence.english` (:139) |

`ReverseLookupResult.canonical` is **nullable**, so a lookup that finds a translation but
cannot resolve the underlying entity returns a result with `canonical: null` rather than
throwing or fabricating a Japanese form. That is the right shape: "we have a translation
but not its canonical anchor" is a real, representable state.

The resolver is described as *safe* because entity type is validated against
`SUPPORTED_ENTITY_TYPES` before dispatch, so an unknown type cannot reach a query branch.
Since the schema has **no foreign keys anywhere** (a documented repository-wide choice),
the entity reference is only as trustworthy as this application-level validation.

---

## 5. UI

`src/components/LanguageSelector.tsx` exists and is covered by
`tests/language-selector.test.ts` (2 tests, passing).

---

## 6. CMS translation workflow

Phase 13.5C's CMS overlay provides the verification path:

| Table | Role |
| :--- | :--- |
| `cms_content_items` | Current editorial object; `status` ∈ draft · review · approved · scheduled · published · archived |
| `cms_content_versions` | Immutable snapshots; unique on `(content_item_id, version_number)` |
| `cms_audit_log` | Insert-only action history; includes a `verify_translation` action |

The schema comment states the learner-visibility rule explicitly:

> *published CMS payload if present, otherwise the canonical ETL record. Draft/review/approved/scheduled content is never learner-visible.*

Three properties of this design matter for translation quality:

1. **`approved` is not `published`.** An approved-but-unpublished translation is not
   learner-visible. This is enforced by the resolver, not by query convention, and it is
   the difference between a review queue that works and one that leaks.
2. **`original_source_ref` is preserved** when an overlay replaces canonical content, so the
   canonical source remains visible underneath the override rather than being lost.
3. **CMS never mutates canonical tables.** The overlay is additive; `entity_id` links to a
   canonical entity but no write path targets canonical data.

`tests/cms-translation-workflow.test.ts` covers this workflow (9 tests — see §8).

---

## 7. What was verified

| Claim | Evidence |
| :--- | :--- |
| Three languages: `en`, `ta`, `ml` | `SUPPORTED_LANGUAGES`; enforced at 3 call sites |
| `canonical` / `verified_human` / `machine` priority | `SUPPORTED_SOURCE_TYPES`; `isVerified` logic at :78 |
| Machine output cannot self-promote to verified | `isVerified` computed from `sourceType`, not stored input alone |
| Reverse lookup Tamil → Japanese | `reverseSearchService.ts:56–68` via `resolveCanonicalEntity` |
| Reverse lookup Malayalam → Japanese | same path; `ml` in `SUPPORTED_LANGUAGES` |
| Safe polymorphic resolution | entity type validated before dispatch; 4 branches |
| Unresolvable entity returns `null`, not a fabricated form | `ReverseLookupResult.canonical` is nullable |
| Translation CMS workflow with verification action | `cms_audit_log.action` includes `verify_translation` |
| Verified-translation publication gating | schema comment + resolver rule; `approved ≠ published` |

---

## 8. Test status

Measured at HEAD `19c0b72`:

| Suite | Result |
| :--- | :--- |
| `tests/multilingual-translation.test.ts` | 9 skipped — **requires a database** |
| `tests/language-selector.test.ts` | 2 passed |
| `tests/cms-translation-workflow.test.ts` | passing (part of the 258-test CMS group) |
| **Total across the three files** | **29 passed · 9 skipped · 0 failed** |

The 9 skips are all in `multilingual-translation.test.ts`, whose `TranslationService` and
`ReverseSearchService` tests need a seeded database. They are **skipped, not deleted and not
converted to passes** — the behaviour is unverified in this environment, and reporting it as
verified would be a false claim.

Consequence for the gate report: the multilingual *implementation* is verified by
inspection and by the surfaces that do run, but the database-dependent paths are
**UNVERIFIED in this environment**. No new tests were written for them, because a
DB-independent test of a DB-dependent method would assert the mock, not the method.

**Integration requirements for when a disposable database is available:**

1. Seed `entity_translations` with one row per language for one dictionary entity.
2. Verify forward retrieval filters by `language`.
3. Verify reverse lookup resolves `ta` and `ml` text to the canonical entity.
4. Verify a `machine` row and a `verified_human` row coexist for the same
   entity+language and that the latter is the one carrying `isVerified`.
5. Verify a `canonical` row is not overwritten by a `machine` insert.
6. Verify an `approved`-but-unpublished CMS payload is **not** returned by the learner resolver.

---

## 9. Explicitly not done

- No translations generated, machine or otherwise.
- No Tamil/Malayalam content authored.
- No backfill of `entity_translations`.
- No change to `SUPPORTED_LANGUAGES`.
- No canonical table modified.
- No automatic "best translation" selection added — the ranking is documented, not resolved.
