# Provenance Quality Contract

**Status**: IMPLEMENTED (`src/services/dataquality/provenanceChecks.ts`) · audited defects documented, not repaired
**Phase**: 14.4F-R §20
**Last updated**: 2026-09-24

---

## 1. The rule

> **A knowledge record must be traceable to a registered source. If it is not, the
> correct representation is `requires_review` — never a plausible-looking substitute.**

Four strings are explicitly forbidden as provenance:

```
latest      unknown      manual      AI
```

They are forbidden *structurally* (`PROVENANCE_PLACEHOLDERS`), not by convention,
because each is indistinguishable from a genuine source id at read time.

`"latest"` deserves particular attention: it **looks like a version pin** while
guaranteeing the opposite. A record pinned to `latest` silently follows whatever upstream
becomes, so the same reference string can denote different bytes on different days. For a
provenance registry specifically, this defeats the entire purpose of registration.

---

## 2. Two questions, two checks

A source reference must answer two independent questions:

| Question | Check | Failure code |
| :--- | :--- | :--- |
| Is the reference **well-formed**? | `checkProvenanceRef` (`checks.ts`) | `MISSING_PROVENANCE`, `PLACEHOLDER_PROVENANCE` |
| Does the reference **resolve**? | `checkSourceRegistration` | `UNREGISTERED_SOURCE` |

This separation matters because the second failure is the common one. Writing a
plausible-looking source id is easy; the id only becomes checkable against the registry.
A well-formed reference that resolves to nothing is exactly as untrustworthy as a
placeholder, and it is *harder to notice*.

`checkSourceRegistration` skips absent and placeholder references, so one defect is never
reported under two codes.

---

## 3. Verified status must be earned

`checkStatusProvenanceConsistency` enforces:

| Status | Requires |
| :--- | :--- |
| `published` / `verified` | A non-empty, non-placeholder `sourceRef` that **resolves** in the registry |
| `requires_review` | Nothing further |
| `draft` / `unverified` | Nothing further |

Codes: `VERIFIED_WITHOUT_PROVENANCE`, `VERIFIED_WITH_PLACEHOLDER_PROVENANCE`,
`VERIFIED_WITH_UNREGISTERED_SOURCE` — all `ERROR`.

The governing principle from §20: **unknown provenance is never silently upgraded to
verified.** Status is a claim, and a claim that outruns its evidence is a defect
regardless of whether the underlying content happens to be correct.

---

## 4. Audited defect — keigo records reference an unregistered source

**Measured at HEAD `19c0b72`.**

Every record in `VERIFIED_KEIGO_MAP` (`kanjiLexicalGraphService.ts:922–947`) carries:

```ts
sourceRef: "first-party:keigo-architecture:v1",
verificationStatus: "published",
```

| Claim | Evidence |
| :--- | :--- |
| `first-party:keigo-architecture:v1` is registered | **No** — 0 occurrences in `provenance/registry.ts` |
| Registered `first-party:*` sources | **7**, none of them keigo: `dictionary-core:v1`, `grammar-core:v1`, `jlpt-mock:v1`, `kana:v1`, `kanji-corpus:v1`, `kanji-mindtree:v1`, `sentences-core:v1` |
| Claimed status | `published` — i.e. presented as verified, learner-visible content |

This is **`VERIFIED_WITH_UNREGISTERED_SOURCE`**: content marked published while citing a
source that does not exist in the registry.

Two resolutions exist, and choosing between them is a governance decision:

1. **Register the source** — if `first-party:keigo-architecture:v1` is a real first-party
   editorial source, add it to the registry with licence and attribution. The affected
   records are then legitimately published.
2. **Downgrade the records** — if no such source exists, the records' status must become
   `requires_review`, because their content is not traceable.

Neither has been applied here. The compounding factor is that the variable is *named*
`VERIFIED_KEIGO_MAP` — the name asserts verification the provenance chain does not
substantiate, so the defect is easy to overlook by reading code alone.

---

## 5. Registry completeness

`checkRegistryCompleteness` validates the registry itself:

| Code | Severity | Condition |
| :--- | :--- | :--- |
| `SOURCE_MISSING_LICENSE` | ERROR | No licence recorded |
| `SOURCE_MISSING_ATTRIBUTION` | ERROR | No attribution recorded |
| `SOURCE_MISSING_VERSION` | ERROR | No version |
| `SOURCE_PLACEHOLDER_VERSION` | ERROR | Version is `latest`/`unknown`/`manual`/`ai`/… |
| `SOURCE_MISSING_RELEASE_DATE` | WARNING | No release date |

Missing licence is an `ERROR` rather than a warning because a source whose licence is
unknown **cannot be lawfully redistributed**, and that determination cannot be deferred
to distribution time. Missing release date is only a `WARNING`: a snapshot without a date
is still identified by version, though it cannot be dated.

### 5.1 Registration is not acquisition

A registry entry records that a source **is known and its licence documented**. It is
*not* evidence that any data was ever acquired.

This distinction is load-bearing in this repository. At HEAD, the registry lists
`upstream:tatoeba:2024-07`, `upstream:jmdict:2023-08`, `upstream:jmdict:2024-07`,
`upstream:kanjivg:2024-04`, and `upstream:kanjivg:2024-08` — while `data/` does not exist
and no Tatoeba artifact has ever been committed (verified: 0 commits under
`data/tatoeba`). Any report that treated a registry entry as proof of presence would be
wrong.

**Registration ≠ acquisition.** Phase 14.5A remains **BLOCKED** on exactly this
distinction.

---

## 6. Artifact identity

`checkArtifactIdentity` requires, for every acquired artifact:

| Field | Requirement |
| :--- | :--- |
| `sourceId` | Registered source |
| `filename` | As acquired |
| `bytes` | **Measured**, positive |
| `sha256` | **Measured**, 64 lowercase hex |
| `acquiredAt` | ISO-8601 |
| `acquiredWith` | Tool and version, e.g. `curl/8.5.0` |
| `extractedSha256` | Required for `.bz2`/`.gz`/`.xz`/`.zip` (see below) |

Codes: `ARTIFACT_MISSING_FIELD`, `ARTIFACT_SHA256_MALFORMED`, `ARTIFACT_BYTES_INVALID`,
`ARTIFACT_MISSING_EXTRACTED_SHA256`.

### 6.1 Why both digests

For a compressed artifact, the compressed digest identifies the **download** and the
extracted digest identifies the **parsed bytes**. Only the second can detect a
decompression that yielded different content than a previous run — a changed extraction
tool, a different decompressor version, or corruption introduced during extraction all
leave the compressed digest intact.

The extracted digest being absent is a `WARNING` (not an error) because the compressed
digest alone still pins the download; the artifact is identified, just not fully.

A **malformed** digest is an `ERROR` because a digest that cannot be compared against
anything provides no identity at all — it is strictly worse than no digest, since it
looks like verification.

### 6.2 Digests must be measured, never inherited

A digest copied from a prior report describes what someone believed was present, not what
is on disk. This is the same failure mode as reusing a historical claim without the
artifact: the identity is asserted at one remove. Every digest must be recomputed from
the bytes actually present.

---

## 7. Snapshot identity

The project convention (decided, not proposed):

```
upstream:<provider>:snapshot-<YYYY-MM-DD>-<sha256-prefix>
```

`SNAPSHOT_ID_REGEX` enforces the shape; `checkSnapshotId` reports violations as
`SNAPSHOT_ID_MALFORMED`.

Two rules the format cannot enforce, and which therefore remain editorial obligations:

1. **The date must be evidenced** — derived from the artifact or from documented upstream
   metadata. It is never invented to fit the pattern.
2. **Unsupported registry metadata ⇒ `UNVERIFIED`.** If a snapshot's date cannot be
   substantiated, the correct state is `UNVERIFIED`. The identifier is not adjusted to
   make the situation look resolved.

### 7.1 Supersession retains

A new snapshot **supersedes** rather than replaces. The prior entry is retained with
`status: "superseded"`; it is never rewritten or deleted.
`checkSupersessionRetention` warns (`SUPERSEDED_SOURCE_INCOMPLETE`) when a retained
superseded entry lacks `version`/`releaseDate`, since an undatable historical record
cannot explain the data it produced.

The retained `upstream:tatoeba:2024-07` entry is the live example: it stays, marked
superseded, regardless of what a future snapshot is named.

---

## 8. Remediation is not part of detection

None of these checks repair anything. Per `DATA-QUALITY-FRAMEWORK.md` §1, automatic
repair destroys the evidence needed to diagnose a defect — and for provenance
specifically, a silently "fixed" reference is indistinguishable from a fabricated one.

Prohibited, explicitly:

| Operation | Why |
| :--- | :--- |
| Registering a missing source automatically | Registration is a licensing decision |
| Rewriting a source id to the nearest registered one | Invents a provenance relationship |
| Upgrading `requires_review` → `published` | The exact failure §20 names |
| Replacing a placeholder with a plausible id | Converts a visible gap into an invisible one |
| Recomputing a digest to match an expected value | Inverts verification; the artifact defines the digest, not the reverse |
| Deleting a superseded entry | Destroys the historical record |

---

## 9. Where the checks apply

| Subject | Checks |
| :--- | :--- |
| `dictionary_entries` | `checkProvenanceRef`, `checkSourceRegistration` |
| `kanji_entries` / `kanji_radicals` / `kanji_composition` | `checkProvenanceRef`, `checkSourceRegistration` |
| `grammar_patterns` | `checkProvenanceRef`, `checkSourceRegistration` |
| `entity_translations` | `checkProvenanceRef`, `checkSourceRegistration` |
| Keigo relations | `checkStatusProvenanceConsistency` (source of §4) |
| `knowledge_sources` (the registry) | `checkRegistryCompleteness` |
| Artifact acquisitions | `checkArtifactIdentity`, `checkSnapshotId`, `checkSupersessionRetention` |

---

## 10. Relationship to the Tatoeba blocker

This contract is what makes the 14.5A blocker **verifiable** rather than merely asserted.
The claim "no artifact is present" is not an opinion about the data — it is the
`checkArtifactIdentity` result of an empty acquisition set, corroborated by zero commits
touching `data/tatoeba` in repository history.

Conversely, it is also what will make the *resolution* checkable. When an artifact is
supplied, verification means: measured size, measured compressed digest, measured
extracted digest, recorded acquisition tool, registered source, evidenced snapshot date,
and a provenance chain from each parsed record back to those bytes. A record that cannot
be traced through that chain is `requires_review`, however plausible its content.

See `TATOEBA-PROVENANCE-MODEL.md` and
`reports/gates/PHASE-14.5A-NEXT-SESSION-HANDOFF.md` for the acquisition-side policy.
