# Keigo Model

**Status**: Model IMPLEMENTED · register dimensions PARTIAL · relation data MINIMAL · provenance DEFECTIVE (documented, not repaired)
**Phase**: 14.4F-R §16
**Last updated**: 2026-09-24

---

## 1. What exists (audited at HEAD `19c0b72`)

| Element | Location | State |
| :--- | :--- | :--- |
| `KEIGO_TYPES` — the four categories | `src/types/lexicalGraph.ts:74` | Present |
| `KeigoRelation` interface | `src/types/lexicalGraph.ts:218` | Present |
| `RegisterProfile` interface | `src/types/lexicalGraph.ts:238` | Present, one dimension missing (§3) |
| `REGISTER_LEVELS` | `src/types/lexicalGraph.ts:64` | Present |
| `getKeigoRelations(entryId)` | `kanjiLexicalGraphService.ts:909` | Present — but see §4 |
| `/api/dictionary/entry/[id]` exposure | `api/dictionary/entry/[id]/route.ts` | Present; degrades to `[]` |
| Keigo ETL / canonical data source | — | **ABSENT** |
| `first-party:keigo-architecture:v1` in the registry | — | **ABSENT** — see §5 |

The four categories map exactly onto §16's requirement:

```ts
export const KEIGO_TYPES = [
  "TEINEIGO",     // 丁寧語  — ます / です
  "SONKEIGO",     // 尊敬語  — なさる / 召し上がる
  "KENJOUGO_I",   // 謙譲語 I  — 伺う / 申し上げる
  "KENJOUGO_II",  // 謙譲語 II / 丁重語 — 参る / いたす
] as const;
```

The distinction between 謙譲語 I and 謙譲語 II is the one most often collapsed, and this
model keeps it separate. That is correct and worth preserving: 謙譲語 I lowers the
speaker's action **toward a specific recipient** (who is thereby elevated), whereas
謙譲語 II is courteous **regardless of recipient**. They are not interchangeable, and a
sentence can require one and reject the other.

---

## 2. Required dimensions vs. implemented dimensions

§16 requires: formality, politeness, respect, humility, spoken/written, uchi/soto,
business/general.

| §16 dimension | `RegisterProfile` field | State |
| :--- | :--- | :--- |
| formality | `formality: RegisterLevel` (`CASUAL`·`STANDARD`·`POLITE`·`FORMAL`·`BUSINESS`·`HONORIFIC`·`HUMBLE`) | **IMPLEMENTED** |
| politeness | `politeness: "casual" \| "polite" \| "respectful" \| "humble"` | **IMPLEMENTED** |
| respect | `respectLevel: 0 \| 1 \| 2 \| 3` | **IMPLEMENTED** |
| humility | `humilityLevel: 0 \| 1 \| 2 \| 3` | **IMPLEMENTED** |
| spoken/written | `channel: "spoken" \| "written" \| "both"` | **IMPLEMENTED** |
| business/general | `isBusinessAppropriate: boolean` | **IMPLEMENTED** |
| **uchi/soto** | — | **ABSENT** |

Seven of eight are present. The missing one matters more than its count suggests — see §3.

`RegisterProfile` also carries `contextTags: ControlledContextTag[]`, which supplies
orthogonal information the seven dimensions cannot (dialect, male/female-coded speech,
etc.).

---

## 3. The uchi/soto gap

**`RegisterProfile` has no in-group/out-group dimension.** This is the single most
consequential omission in the keigo model, for two reasons.

### 3.1 It is structurally necessary, not decorative

Uchi/soto (内/外) is not another point on a politeness scale — it is a **relational**
axis that determines *which form is correct*. The speaker's own in-group is "uchi";
everyone else is "soto". The same person can be described with 尊敬語 or 謙譲語
depending solely on whether they are inside or outside the speaker's group.

Consequently 謙譲語 I and 謙譲語 II cannot be fully distinguished without it: both are
humble forms, and the difference between them is precisely how the recipient relates to
the speaker's group.

### 3.2 The error it produces is actively wrong, not merely imprecise

Talking to an outsider about one's own boss, one says 伺う (humble — the boss is uchi,
so the boss is lowered along with the speaker). The superficially "more polite" 尊敬語
is **incorrect** in that position. A model that can only express increasing politeness
will recommend the wrong form with high confidence.

This is why uchi/soto cannot be approximated by raising `politeness` or `respectLevel`:
in the case above, the correct form is *less* elevating in isolation. Without the axis,
the system cannot represent the distinction at all, and any guidance it gives on this
class of sentence will be unreliable.

**Recommendation (not implemented).** Adding e.g.
`groupRelation: "uchi" | "soto" | "neutral"` to `RegisterProfile` is a type-level change
to `src/types/lexicalGraph.ts`, not a schema migration — but it must be accompanied by
real data before it is surfaced, since an unpopulated relation field is worse than no
field. No change has been made, because a half-populated relational field would invite
exactly the overconfident guidance described above.

---

## 4. Relation data: minimal, hardcoded, and marked published

Measured at HEAD: `getKeigoRelations` does not read canonical data. It selects the
dictionary row, then answers from a **hardcoded in-service literal**:

```ts
// kanjiLexicalGraphService.ts:922
const VERIFIED_KEIGO_MAP: Record<string, Array<Omit<KeigoRelation, "id">>> = {
  "食べる": [ /* ... いただく, KENJOUGO_I ... */ ],
  "行く":   [ /* ... */ ],
};
```

| Measurement | Value |
| :--- | :--- |
| Keys in the map | **2** (`食べる`, `行く`) |
| Lines 922–947 | the entire map |
| Storage | none — compiled into the service |
| ETL populating it | none |

### 4.1 Coverage against §16's example set

§16 names: 行く/来る → 伺う/参る · 食べる → いただく · する → いたす · 聞く → 伺う/お聞きする.

| §16 example | Covered |
| :--- | :--- |
| 行く → 伺う/参る | partially (行く present) |
| 食べる → いただく | yes |
| 来る → 伺う/参る | **no** |
| する → いたす | **no** |
| 聞く → 伺う/お聞きする | **no** |

Coverage is **2 of the 5 verbs**. The map is also keyed by **headword**, so it matches
only when the lookup happens to pass that exact string — the relations are not reachable
by entry id, by keigo form, or from the keigo word back to the standard word.

### 4.2 Architectural issue

A relation table hardcoded in a service file is not canonical data. It cannot be
versioned with the data, queried, audited, or translated, and it is invisible to the
ETL that owns the dictionary. Its `id` field is even omitted from the literal
(`Omit<KeigoRelation, "id">`), so ids are synthesised at read time rather than being
stable identifiers.

This is recorded, not repaired: moving it into canonical data needs a storage decision
and an ETL, and generating the missing three verbs' relations would be authoring keigo
facts without a verified source.

---

## 5. Provenance defect

Every record in `VERIFIED_KEIGO_MAP` carries:

```ts
sourceRef: "first-party:keigo-architecture:v1",
verificationStatus: "published",
```

**`first-party:keigo-architecture:v1` is not registered in the provenance registry.**

| Measurement | Value |
| :--- | :--- |
| Occurrences of `keigo-architecture` in `provenance/registry.ts` | **0** |
| Registered `first-party:*` sources | **7**: `dictionary-core:v1`, `grammar-core:v1`, `jlpt-mock:v1`, `kana:v1`, `kanji-corpus:v1`, `kanji-mindtree:v1`, `sentences-core:v1` |
| `keigo-architecture:v1` among them | **No** |

So the records reference a source that does not exist in the registry, while
simultaneously asserting `verificationStatus: "published"` — i.e. they are presented as
learner-visible verified content.

Per `PROVENANCE-QUALITY-CONTRACT.md`, an unregistered `sourceRef` is an invalid
provenance reference, and per §20 the correct representation of unverifiable provenance
is `requiresReview`, never a `published` status. Two resolutions exist — register the
source in the registry, or downgrade the records' status — and choosing between them is
a governance decision, so neither has been taken here.

Compounding factor: the variable is *named* `VERIFIED_KEIGO_MAP`. The name asserts
verification that the provenance chain does not substantiate.

---

## 6. Transformation requirements (for when data exists)

Each keigo transformation must carry, at minimum:

| Requirement | Field | Rationale |
| :--- | :--- | :--- |
| source | `sourceRef` | Must resolve in the registry (§5) |
| context | `contextUsage` | 伺う is not universally "polite visit"; the host/superior situation matters |
| register | `keigoType` + `directionality` | Which of the four categories, and in which direction |
| relationship | `standardEntryId` ↔ `keigoEntryId` | Bidirectional reachability (§4.1) |
| exceptions | `notes` | e.g. いただく as "receive" vs "humble eat" |

`contextUsage` exists and is required in spirit, but nothing enforces it — a record
with an empty context is representable and would be shown as universal.

**Never imply universal validity.** 行く → 参る is not a substitution that may be
applied wherever 行く appears; 参る is humble and therefore wrong for describing an
outsider's action. The UI must present keigo as *conditional on context*, and a record
without recorded context must be presented as such rather than as a general rule.

---

## 7. Directionality

`directionality` is `"speaker_lowering" | "listener_elevating" | "neutral_courteous"`.
This is a good model because it captures that keigo operates by *lowering* one party as
well as by elevating another — a relationship that the `respectLevel`/`humilityLevel`
numerics alone can express only indirectly. A consumer should not attempt to derive
directionality from those numerics; they are independent descriptions.

---

## 8. Out of scope

- Authoring keigo relations for 来る / する / 聞く — that is data creation without a verified source.
- Adding `groupRelation` — needs a type change *and* real data (§3).
- Migrating the hardcoded map into canonical storage — needs a storage decision.
- Re-registering or renaming the provenance source (§5) — a governance decision.
- Any change to `dictionary_entries` — canonical, immutable.
