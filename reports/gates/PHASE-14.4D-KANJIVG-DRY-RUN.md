# Phase 14.4D: KanjiVG Two-Pass Dry-Run Gate Report

**Execution Date:** 2026-09-23T11:19:43.883Z  
**Source Identifier:** `upstream:kanjivg:2024-08` (`r20240807`)  
**Total Assets Evaluated:** 11658  
**Status:** `PASS — IDEMPOTENCY & ZERO WRITES VERIFIED`

---

## 1. Dry-Run Execution Metrics

| Metric | Run 1 | Run 2 | Verdict |
| :--- | :--- | :--- | :--- |
| **Total SVG Files Evaluated** | 11658 | 11658 | **IDENTICAL** |
| **Primary Standard SVGs** | 6699 | 6699 | **IDENTICAL** |
| **Font/Style Variant SVGs** | 4959 | 4959 | **IDENTICAL** |
| **Valid Visual Assets** | 11658 | 11658 | **IDENTICAL** |
| **Rejected Assets** | 0 | 0 | **IDENTICAL (0)** |
| **Security Violations** | 0 | 0 | **CLEAN (0)** |
| **Stroke Sequence Errors** | 0 | 0 | **CLEAN (0)** |
| **Total Strokes Processed** | 148,236 | 148,236 | **IDENTICAL** |
| **Total Components Processed** | 75,006 | 75,006 | **IDENTICAL** |
| **Cryptographic Digest** | `f3e937f093b4f1ea55da22ac5b3e61d333b193c0775eb195fed2121d9300fade` | `f3e937f093b4f1ea55da22ac5b3e61d333b193c0775eb195fed2121d9300fade` | **MATCH (STRICT IDEMPOTENCY)** |
| **Duration (ms)** | 2172 ms | 2059 ms | Fast Execution |
| **Throughput (files/sec)** | 5367 files/sec | 5662 files/sec | High Throughput |
| **Peak Heap (MB)** | 17.8 MB | 24.8 MB | Bounded (< 128 MB) |
| **Peak RSS (MB)** | 96.5 MB | 113.2 MB | Bounded (< 256 MB) |

---

## 2. Invariant & Safety Checks

1. **Database Unmutated:**
   - `kanji_entries`: Exactly 13,108 rows before, between, and after both runs (0 writes).
   - `dictionary_entries`: Exactly 206,747 rows before, between, and after both runs (0 writes).
2. **SVG Security:**
   - Evaluated against forbidden script tags, event handlers (`on*`), javascript protocols, and external network links.
   - 100% of the 11,658 files passed security audit with 0 violations.
3. **Stroke Sequence Invariant:**
   - All strokes adhere strictly to continuous 1-based order ($1..N$) without gaps or duplicates.
   - All path geometries contain valid SVG path syntax.

---

## 3. Verdict
**Status:** `PASS — PHASE 14.4D DRY RUN COMPLETE`
