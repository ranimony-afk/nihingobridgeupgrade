# Sentence Lexical Matching Architecture

**Status**: IMPLEMENTED and unit-tested (39 tests) · **database-independent**
**Phase**: 14.4F-R §7/§8
**Last updated**: 2026-09-24

> **Scope.** This document and its implementation concern *algorithmic*
> infrastructure only. No sentence corpus is acquired, referenced, or assumed.
> Phase 14.5A (acquisition) remains **BLOCKED**; 14.5B (normalization/linkage)
> remains **NOT AUTHORIZED**. Nothing here advances either.

---

## 1. Problem

Matching canonical dictionary vocabulary inside Japanese sentences naively means,
for every sentence, scanning every dictionary headword. At current corpus size
(206,747 `dictionary_entries`) that is roughly 206,747 `String.prototype.includes`
calls per sentence — O(sentences × dictionary_entries) — and it yields no position
information whatsoever.

The existing `src/etl/sentence/matcher.ts` does exactly this. It also swallows
database errors into an empty match set, making "database unavailable"
indistinguishable from "no vocabulary present". It is **not** the model for this
architecture and must not be reused.

---

## 2. Design: dictionary-driven matching, not segmentation

### 2.1 Why not segment first

Japanese has no word delimiters, so the instinctive pipeline is
*segment → look up tokens*, which requires a morphological analyser (MeCab,
IPADIC, Juman++) plus its dictionary: a large runtime dependency with its own
licence, its own memory footprint, and its own vocabulary that would need
reconciling against the canonical dictionary.

### 2.2 The inversion

The canonical dictionary already enumerates every word the system recognises.
Therefore **a trie built from canonical headwords and readings *is* the
segmentation strategy.**

```
canonical headwords/readings
          ↓
       trie / automaton
          ↓
  single-pass sentence scan
          ↓
    candidate matches
          ↓
longest-match / overlap resolution
          ↓
   dictionary entity IDs
          ↓
surface offsets + match metadata
```

Consequences:

- No external analyser, no segmentation dictionary, no licence obligation.
- Exact dictionary identity by construction — a match *is* a canonical entry.
- Kana/kanji boundaries fall out of the match itself rather than being inferred.
- Works identically for headword surfaces and reading surfaces.

### 2.3 Complexity

Per sentence: **O(n · L)**, where `n` is the sentence's code point count and `L`
is the longest indexed surface (`trie.maxSurfaceLength`). Both are small and
bounded; neither depends on corpus size. Trie construction is O(total surface
length) once, then reused across all sentences via `LexicalMatcher`.

| Approach | Per-sentence cost at 206,747 entries | Positions |
| :--- | :--- | :--- |
| Legacy `includes()` scan | ~206,747 substring scans | none |
| Trie single-pass | O(n · L), e.g. ~10·5 for a short sentence | exact |

### 2.4 Implementation

| File | Role |
| :--- | :--- |
| `src/services/sentence/lexicalMatcher.ts` | Trie build + scan + `LexicalMatcher` |
| `src/services/sentence/offsetContract.ts` | Code point offset contract (§8) |
| `src/services/sentence/types.ts` | `LexicalMatchTarget`, `LexicalMatch`, `ScanOptions` |
| `src/services/sentence/index.ts` | Barrel |

The matcher performs **no I/O** and never touches the database. It is a pure
function of `(targets, sentence)`, hence deterministic and testable in any
environment.

---

## 3. Match modes

| Mode | Behaviour | Use |
| :--- | :--- | :--- |
| `"longest"` (default) | At each position take the deepest recognised surface, emit it, then resume *after* it. Non-overlapping. | "Which vocabulary appears in this sentence?" |
| `"all"` | Emit every recognised surface at every starting position, including nested and overlapping ones. | Indexing, coverage analysis, analytics |

For `日本語` with both `日本` and `日本語` indexed:

```
"longest"  → [日本語]
"all"      → [日本語, 日本]
```

`minSurfaceLength` is a **caller policy**, not an algorithmic judgement. The
default is 1 (emit everything recognised). Corpus-scale callers will normally
want 2, because single-kana surfaces (particles, auxiliary fragments) generate
large volumes of low-value matches. The matcher does not decide this, because
"which short surfaces are noise" is a linguistic policy question that belongs to
the caller and may differ per use case.

---

## 4. Offset contract

See `src/services/sentence/offsetContract.ts` for the full rationale.

```
offsetUnit = unicodeCodePoint
```

### 4.1 The hazard

JavaScript strings are UTF-16 code unit sequences. `.length`, `.slice()`,
`.indexOf()`, and regex `lastIndex` all count **code units**. These coincide with
code points for the entire Basic Multilingual Plane — which includes all kana,
the common kanji ranges, and full-width punctuation. So for ordinary Japanese the
two conventions are indistinguishable, and a UTF-16 offset leaking into a public
API passes every test that uses ordinary vocabulary.

They diverge only for **supplementary-plane** characters, each occupying two
UTF-16 code units:

| Character | Code points | UTF-16 units |
| :--- | :--- | :--- |
| `普` `通` `日` `本` `語` | 1 each | 1 each |
| `𠮷` (U+20BB7, CJK Ext. B) | **1** | **2** |
| `👍` (U+1F44D) | **1** | **2** |
| `👨‍👩‍👧` (ZWJ sequence) | **5** | **8** |

A highlighter that slices `"𠮷野家"` at UTF-16 `[0,1)` returns a lone high
surrogate — a malformed string. The bug is invisible until such text appears.

### 4.2 Rules

1. **Every offset crossing a module or API boundary is a code point offset.**
   Field names use `start`/`end`/`length`; `end` is exclusive.
2. **Convert at the boundary, never inside.** Use
   `codePointIndexToUtf16Index` immediately before a native `slice`, and
   `utf16IndexToCodePointIndex` immediately after a native index-returning call.
3. **Use `codePointSlice`** rather than `String.prototype.slice` when slicing by
   contract offsets.
4. **Normalize before scanning.** Any NFC/NFKC normalization must be applied
   *before* both trie construction and scanning, so offsets describe the string
   that was actually scanned. The matcher never normalizes.
5. **Clamp, do not throw.** Conversion helpers clamp out-of-range and negative
   inputs, because offsets often arrive from untrusted boundaries.

### 4.3 Emoji and ZWJ sequences

Emoji are handled as code points: `👍` is 1, and `"水👍水"` yields matches at
code points 0 and 2. A ZWJ family sequence is **multiple** code points (5 for
`👨‍👩‍👧`), because ZWJ (U+200D) is itself a code point.

This is a documented boundary: **this contract is code points, not grapheme
clusters.** Grapheme segmentation requires `Intl.Segmenter`, differs by locale,
and is the right tool for cursor movement or truncation — not for lexical match
offsets. Consumers needing grapheme-aware display must segment separately.

### 4.4 Serialization and UI

- **API**: `start`, `end`, `length` serialize as plain integers with the unit
  documented in the response contract. Do not emit a parallel UTF-16 field; a
  second offset convention is how the ambiguity returns.
- **UI**: convert once, at the render boundary, using the helpers. Highlighting
  must slice via `codePointSlice` or convert to UTF-16 first.
- **Diagnostics**: `describeOffsetDivergence(text)` reports whether a string is
  affected — useful for data-quality probes over ingested corpora.

---

## 5. Determinism

Guarantees, all covered by tests:

- Scanning is a pure function of `(text, trie, options)`.
- Results are sorted by `start` ascending, then `length` **descending**, then
  `entryId`, then `surface` — so homograph ties never depend on input order.
- Trie construction is insertion-order independent: reversing the target list
  produces byte-identical results.
- Repeated scans of the same input produce identical output.

---

## 6. Testing

`tests/sentence-lexical-matching.test.ts` — **39 tests, all passing, no database
required.**

Coverage includes: exact headword matching with offsets; longest-match at a
shared prefix; `"all"` mode surfacing nested matches; multi-word sentences;
reading-surface matching; non-fabrication of conjugated forms; determinism and
insertion-order independence; homograph tie ordering; `minSurfaceLength`;
provenance field propagation; UTF-16 ↔ code point round-trips at every boundary;
Clamping; surrogate-pair-safe slicing; `𠮷` in a headword; offsets after a
surrogate pair; emoji interleaving; mixed ASCII/Japanese; and a linear-scaling
guard against accidental O(n²).

Fixtures are hand-built test targets — **not** upstream data, and not a claim
that any sentence corpus exists.

---

## 7. Boundary with 14.5B

This module provides the matcher. It does **not**:

- acquire or read sentence data;
- define the raw/normalized boundary (see `PHASE-14.5A-SCHEMA-NECESSITY.md` and the
  handoff brief);
- persist anything;
- decide the staging schema.

When 14.5B is authorized, the intended flow is:

```
raw sentence text (preserved verbatim)
        ↓
normalization policy applied  →  normalized text  (offsets refer to THIS)
        ↓
LexicalMatcher.scan(normalized text, trie built from canonical entries)
        ↓
LexicalMatch[]  (code point offsets + canonical entryIds)
        ↓
staging model  →  [schema decision]  →  persistence
```

Two known limitations to carry forward:

1. **Inflection.** The trie matches surface forms, not lemmas. `食べ` does not
   match `食べる` unless `食べ` is itself an indexed surface. Resolving
   conjugation requires stem/auxiliary rules and is explicitly out of scope here —
   the matcher must not fabricate a match it cannot justify from an exact surface.
2. **Homographs.** Multiple entries may share a surface. All are returned; the
   matcher never selects one as "correct" without evidence. Disambiguation is a
   later concern, and must remain deterministic and evidence-based (see the
   reading invariant: a kanji's *possible* readings are not evidence of the
   reading used in context).
