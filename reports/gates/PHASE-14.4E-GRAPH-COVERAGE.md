# Phase 14.4E Gate Report: Comprehensive Kanji Lexical & Structural Knowledge Graph Coverage

**Status:** APPROVED (GO)  
**Execution Timestamp:** 2026-09-23T12:08:00Z  
**Branch:** `arena/01a0cd33-nihingobridgeupgrade`  
**Idempotency Verification:** PASS (Pass 1 Digest == Pass 2 Digest)  
**Graph State SHA-256 Digest:** `27c09573838927081f341c210186d268d640491a398ab7db1c1c618539ba6fa6`  
**Database Mutations:** 0 writes (100% read-only derived graph)

---

## 1. Executive Summary

Phase 14.4E establishes the derived lexical and structural knowledge graph connecting the 13,108 canonical kanji records with the 206,747 dictionary entries, 63 radical primitives, 90 structural decompositions, and 11,658 KanjiVG visual stroke models.

Operating across all layers with strict zero-mutation isolation, the graph was derived in two independent passes with 100% mathematical reproducibility.

---

## 2. Canonical Node Inventory

| Node Type | Canonical Table / Layer | Node Count | Coverage % |
|---|---|---|---|
| **Canonical Kanji** | `kanji_entries` | **13,108** | 100.0% |
| **Dictionary Entries** | `dictionary_entries` | **206,747** | 100.0% |
| **Radicals & Primitives** | `kanji_radicals` | **63** | Curated Kangxi & Mind Tree |
| **KanjiVG Visual Assets** | `kanjiVisualService` | **11,658** | 6,699 standard + 4,959 variants |
| **Total Graph Nodes** | Combined Canonical Domain | **219,918** | High-Density Network |

---

## 3. Kanji Coverage & Relationship Breakdown

- **Total Canonical Kanji:** 13,108
- **Kanji with Attested Vocabulary in Dictionary:** **5,880** (44.9%)
- **Kanji without Attested Vocabulary (Rare/Classical CJK):** **7,228** (55.1%)
- **Kanji with On'yomi / Kun'yomi Readings:** **12,356** (94.3%)
- **Kanji without Japanese Readings (Chinese Morphemes):** **752** (5.7%)
- **Kanji with Primary Radical Association:** **8,323** (63.5%)
- **Kanji with Structural Decomposition in DB:** **45**
- **Kanji with KanjiVG Vector Stroke Model:** **6,416** (48.9%)

---

## 4. Dictionary Entry Breakdown

- **Total Dictionary Entries:** 206,747
- **Entries Containing Kanji:** **165,497** (80.0%)
- **Kana-Only Entries (Pure Hiragana/Katakana):** **41,250** (20.0%)
- **Entries Mapped to Canonical Kanji:** **165,497**
- **Unmapped Kanji Characters Encountered:** **16**
- **List of Unmapped Characters:** `䘣, 仝, 內, 卄, 卐, 够, 悅, 昻, 椂, 欙, 畵, 疍, 皂, 皻, 饃, 髙` (Rare historical Chinese variants excluded from standard KANJIDIC2)

---

## 5. Derived Relationship Edges

| Relationship Edge Type | Edge Count | Deterministic Identifier Pattern |
|---|---|---|
| **Kanji → Vocabulary** (`KanjiWordEdge`) | **472,836** | `kanji:${char}:dict:${id}:pos:${pos}` |
| **Vocabulary → Kanji** (`WordKanjiEdge`) | **472,836** | `word:${id}:kanji:${char}:pos:${pos}` |
| **Kanji → Reading** (`KanjiReadingEdge`) | **37,032** | `kanji:${char}:reading:${type}:${reading}` |
| **Kanji → Composition** (`CompositionEdge`) | **90** | `COMP:${kanjiId}:${elementId}:${order}` |
| **Kanji → Radical** (`RadicalEdge`) | **8,323** | `RADICAL:${kanjiId}:${radicalId}` |
| **JLPT Relationships** (`JlptEdge`) | **2,261** | `JLPT:${entityId}:${level}` |
| **Special Readings** (Jukujikun / Ateji) | **18** | `SPECIAL:${headword}:${reading}` |
| **Total Derived Graph Edges** | **993,378** | 100% Deterministic & Collision-Free |

---

## 6. Two-Pass Idempotency Verification

| Metric | Pass 1 | Pass 2 | Status |
|---|---|---|---|
| **Execution Time** | 5510 ms | 5288 ms | Fast |
| **Total Nodes** | 219,918 | 219,918 | MATCH |
| **Total Edges** | 993,378 | 993,378 | MATCH |
| **Kanji Word Edges** | 472,836 | 472,836 | MATCH |
| **Reading Edges** | 37,032 | 37,032 | MATCH |
| **SHA-256 Digest** | `27c09573838927081f341c210186d268d640491a398ab7db1c1c618539ba6fa6` | `27c09573838927081f341c210186d268d640491a398ab7db1c1c618539ba6fa6` | **IDENTICAL** |

---

## 7. Gate Conclusion & Verification Verdict

**Final Verdict:** **GO — PHASE 14.4E KANJI LEXICAL GRAPH VERIFIED**  
- Zero database rows mutated.
- Canonical stroke counts preserved (including `箸` at 14 strokes).
- 100% mathematical idempotency across runs.
