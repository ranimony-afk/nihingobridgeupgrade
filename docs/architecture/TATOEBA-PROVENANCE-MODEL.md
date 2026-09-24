# Tatoeba Provenance Model

**Status**: SPECIFICATION — source identity registered, artifact provenance UNVERIFIED
**Phase**: 14.5A-R2 (Real-Artifact Rebase, Provenance & Acquisition Foundation)
**Predecessor**: Phase 14.4F — **not present in this repository** (latest verified: 14.4E)
**Last updated**: 2026-09-24
**Blocking gate**: Artifact availability — see `reports/gates/PHASE-14.5A-R2-ARTIFACT-AUDIT.md`

> This document defines the provenance contract for Tatoeba-derived sentences. It records
> what is **already registered** versus what **remains unverified**, so that no consumer
> mistakes a registry assertion for measured evidence.

---

## 1. Provenance Principle

### 1.1 The provenance chain

```
Tatoeba source
      ↓
artifact
      ↓
artifact SHA
      ↓
upstream sentence ID
      ↓
normalized sentence
      ↓
future canonical sentence
```

**Acquisition provenance and canonical persistence are distinct stages.** This model covers
only the chain up to `upstream sentence ID` and its deterministic acquisition
representation. Everything from `normalized sentence` onward belongs to Phase 14.5B and is
**not** authorized.

| Stage | Owner phase | Status |
| :--- | :--- | :--- |
| Tatoeba source | registry (14.1) | **REGISTERED** — version unverified |
| artifact | 14.5A-R3 | **NOT ACQUIRED** |
| artifact SHA | 14.5A-R3 | **NOT MEASURED** |
| upstream sentence ID | 14.5A-R3 | **NOT PRODUCED** |
| normalized sentence | 14.5B | **NOT AUTHORIZED** |
| future canonical sentence | 14.5B/14.5C | **NOT AUTHORIZED** |

### 1.2 Binding rule

Every accepted source sentence must be traceable to:

```
provider  source_id  source_version  source_artifact  source_sha256
source_sentence_id  license  attribution
```

No orphaned sentence records. No provenance inferred after the fact. The Tatoeba sentence ID
is **never lost** and is **never replaced** by a NihongoBridge identifier — internal
identifiers are derived *in addition*, never *instead*.

**A registry entry does not prove that an artifact was acquired.** The registry carries no
checksum, byte size, or record count, and no field in it derives from an inspected file.

---

## 2. Registered Source Identity

Registered at `src/services/knowledge/provenance/registry.ts:125`:

```ts
"upstream:tatoeba:2024-07": {
  id: "upstream:tatoeba:2024-07",
  type: "upstream",
  name: "Tatoeba Multilingual Example Sentences",
  version: "2024-07",
  releaseDate: "2024-07-01",
  uri: "https://tatoeba.org",
  license: "CC-BY-2.0-FR",
  attribution: "Tatoeba Project (tatoeba.org) contributors under Creative Commons BY 2.0 FR",
  description: "Open collaborative collection of natural Japanese example sentences with aligned English translations.",
  domain: "sentence",
  status: "active",
  targetTables: ["example_sentences"],
}
```

Alias (`registry.ts:287`): `"tatoeba:corpus:2024-07" → "upstream:tatoeba:2024-07"`.

### 2.1 Supersession policy — snapshot identity (DECIDED)

Tatoeba publishes **rolling snapshots**, not versioned dataset releases like JMdict's
`2023-08`. The `2024-07` label therefore **cannot** correctly describe a newly acquired
artifact, and must not be reused for it.

When a real artifact is verified, a new identity is registered:

```
upstream:tatoeba:snapshot-<YYYY-MM-DD>-<sha256-prefix>
```

| Property | Requirement |
| :--- | :--- |
| Immutable | never re-pointed at different bytes |
| Artifact-specific | bound to one acquired artifact |
| Date-stamped | from the artifact's own evidence — **never invented** |
| SHA-linked | includes artifact hash prefix, so snapshots cannot collide |
| Not `"latest"` | a moving label is not a provenance identity |

Rules:

1. **Retain** `upstream:tatoeba:2024-07` for historical provenance — do not rewrite its
   meaning, do not delete it. Mark it **superseded**.
2. The alias `tatoeba:corpus:2024-07 → upstream:tatoeba:2024-07` becomes historical with it.
3. Registering a new identity is **not** silent substitution of another release — it is an
   explicit, documented decision, which is what the prior phase specifications required.
4. State the basis for the date component (filename, release metadata, or retrieval date) in
   the acquisition manifest.

This mirrors the multi-version convention already established in the registry, which carries
parallel entries for JMdict (`2023-08` / `2024-07`), KANJIDIC2 (`2023-08` / `2024-07`), and
KanjiVG (`2024-04` / `2024-08`).

### Verification status of each field

| Field | Status | Note |
| :--- | :--- | :--- |
| `id` | **REGISTERED** | Stable; do not rename (§4) |
| `type` | **REGISTERED** | `upstream` |
| `name`, `description` | **REGISTERED** | — |
| `domain`, `targetTables`, `status` | **REGISTERED** | — |
| `license` | **REGISTERED** | `CC-BY-2.0-FR` |
| `attribution` | **REGISTERED** | Satisfies the §24 attribution requirement |
| `version` | **ASSERTED, UNVERIFIED** | No artifact to confirm against (§3: never invent the version) |
| `releaseDate` | **ASSERTED, UNVERIFIED** | As above |
| `uri` | **ASSERTED, UNREACHABLE** | Host blocked in this environment |

**Per §4**: retained unchanged; not duplicated (§2C); not deleted. Corrections are permitted
**only with explicit evidence**, which does not currently exist.

---

## 3. Artifact Provenance (Per-Sentence)

Once an artifact exists, every accepted sentence binds to:

| Field | Source | Current value |
| :--- | :--- | :--- |
| `provider` | Tatoeba | Tatoeba |
| `source_id` | registry | `upstream:tatoeba:2024-07` |
| `source_version` | **artifact** | **UNVERIFIED** |
| `source_artifact` | file record | **NO ARTIFACT** |
| `source_sha256` | computed | **NOT COMPUTED** |
| `source_sentence_id` | source row | **NOT AVAILABLE** |
| `license` | registry | `CC-BY-2.0-FR` |
| `attribution` | registry | Tatoeba Project (CC BY 2.0 FR) |
| `acquired_at` | acquisition run | **N/A** |

**§16 compliance**: `PHASE-14.5A-TATOEBA-ACQUISITION-MANIFEST.json` was **not created**.
§16 requires "only measured/verified information" and "No placeholder values in the final
manifest." With no artifact, every substantive field would be a placeholder. Emitting the
file would be fabrication (§0).

---

## 4. Acquisition Manifest Shape (R2)

When an artifact exists, the manifest is generated **only from evidence** and in the shape
required by the phase specification:

```json
{
  "phase": "14.5A-R2",
  "source":      { "sourceId": "...", "version": "...", "license": "...", "attribution": "..." },
  "artifact":    { "path": "...", "sha256": "...", "sizeBytes": 0 },
  "format":      { "delimiter": "...", "encoding": "...", "bom": false, "columnCount": 0 },
  "counts":      { "rawRecords": 0, "japaneseRecords": 0, "nonJapaneseRecords": 0 },
  "validation":  { "accepted": 0, "warnings": 0, "rejected": 0 },
  "relationships": { "linked": 0, "oneToMany": 0, "manyToOne": 0, "untranslated": 0 },
  "digest":      { "pass1": "...", "pass2": "...", "identical": true },
  "license":     { "id": "CC-BY-2.0-FR" },
  "attribution": { "text": "..." },
  "reproducibility": {},
  "safety":      { "databaseWrites": 0, "schemaMigrations": 0, "productionAccess": 0 }
}
```

Every measured field must be evidence-backed. Placeholders (`TBD`, `UNKNOWN`, `<sha>`, `0`)
are **prohibited** for measured fields.

**Current status: WITHHELD** — no artifact exists, so every measured field would be a
placeholder. Emitting the file would be fabrication.

---

## 5. Deterministic Internal Identity (R2 identity contract)

When implemented, internal identifiers derive **only** from stable source attributes:

```
tatoeba:<sentence_id>
```

| Property | Requirement |
| :--- | :--- |
| Same source record ⇒ same ID | required |
| Repeated execution ⇒ identical ID | required |
| Random UUIDs for source identity | **prohibited** |
| Timestamp-based primary identity | **prohibited** |
| Ordering-dependent IDs | **prohibited** |

Note the pre-existing Phase 4 convention `es-tat-<id>`
(`src/etl/sentence/transformer.ts`) — a namespace decision for 14.5B, not 14.5A.

---

## 6. Deterministic Digest (R2)

```
Pass 1 digest  ==  Pass 2 digest        ← mandatory; independent runs, same immutable artifact
```

Canonical serialization: fixed field order, `\x1f` separator, `\n` terminator, **no Unicode
normalization in 14.5A** (§9 — exact source text), sort key `sentenceId` ascending,
SHA-256.

Forbidden inputs to a digest: object iteration order, filesystem enumeration order, database
order without `ORDER BY`, timestamps, random UUIDs, process IDs, environment-dependent fields.

**Current state: NOT COMPUTED.** No artifact ⇒ no digest. See final gate report gates 12–15.

---

## 7. Licence & Attribution Obligations (R2)

`CC-BY-2.0-FR` is **retained**. Attribution must remain available for future API/UI
exposure:

```
Tatoeba — CC-BY-2.0-FR — upstream:tatoeba:2024-07
Tatoeba Project (tatoeba.org) contributors under Creative Commons BY 2.0 FR
```

Constraints:

- Attribution metadata must **not** be removed or rewritten.
- Tatoeba data must not be merged into first-party records in a way that makes attribution
  impossible.
- Content must not be redistributed in violation of the licence.
- Sentence text is **untrusted external data**: never rendered as raw HTML; escape before
  any future highlighting.

---

## 8. Relationship Provenance (§11)

Each relationship edge preserves:

```
source sentence ID   target sentence ID
source language      target language
relationship type    provenance
```

Fabricating translations is prohibited; `english = japanese` is prohibited (§10). A Japanese
sentence with no translation remains **explicitly untranslated**. "No provenance may be
inferred after the fact" (§14).

---

## 9. Provenance Model Verdict

```
Source identity       REGISTERED and retained (registry.ts:125) — not duplicated
Licence/attribution   REGISTERED — satisfies the attribution obligation
Artifact provenance   UNVERIFIED — no artifact exists
Per-sentence binding  NOT PRODUCED — no records processed
Deterministic digest  NOT MEASURED
Acquisition manifest  WITHHELD (no placeholder values permitted for measured fields)
```

The provenance *contract* is fully specified and the source identity is intact. The
provenance *evidence* cannot exist until a real artifact is acquired. Four required
provenance fields (provider, source_id, license, attribution) are satisfiable today; every
measured field depends entirely on the artifact. Per the phase's §25, unavailable
measurements are reported as **NOT MEASURED** — not zero, which would imply a
measured-empty artifact.

### The distinction this model turns on

| Claim | Evidence strength |
| :--- | :--- |
| `upstream:tatoeba:2024-07` is a registered source identity | **Registered** (`registry.ts:125`) |
| Its licence is `CC-BY-2.0-FR` with a defined attribution string | **Registered** |
| Its `version` / `releaseDate` values are correct | **Asserted, unverified** |
| A Tatoeba artifact was ever acquired into this repository | **NO EVIDENCE** |

**Provenance registration does not imply artifact acquisition.** The registry carries no
checksum, byte size, or record count, and no field in it derives from an inspected file.

### Why the manifest is withheld rather than emitted with nulls

The phase specification prohibits placeholder values for measured fields, and prohibits
inventing SHA-256 values, record counts, and relationship counts. A manifest containing
nulls or zeros would assert measurements that were never taken — indistinguishable, to a
downstream consumer, from a measured-empty corpus. Withholding the file keeps the absence of
evidence explicit.

