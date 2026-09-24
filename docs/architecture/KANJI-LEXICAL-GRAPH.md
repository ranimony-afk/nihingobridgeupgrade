# Kanji Lexical & Structural Knowledge Graph Architecture

## 1. Architectural Role & Boundary
The **Kanji Lexical & Structural Knowledge Graph** forms Layer 3 and Layer 4 of the NihongoBridge knowledge platform:
1. **Upstream Source Data:** KANJIDIC2 (`upstream:kanjidic2:2023-08`), JMdict (`upstream:jmdict:2023-08`), KanjiVG (`upstream:kanjivg:2024-08`).
2. **Canonical Knowledge:** Relational baseline in PostgreSQL (`kanji_entries`, `dictionary_entries`, `kanji_radicals`, `kanji_composition`).
3. **Normalized Lexical Graph:** Pure in-memory and indexed join layer linking kanji to words, readings, and radicals.
4. **Derived Relationships:** Multi-headword compounds, Jukujikun, Ateji, prefixes, suffixes, neighbors, and Mind Tree hierarchies.
5. **Editorial / CMS Overlay:** Review workflows and proposed translation overrides.
6. **Search / Index Layer:** Full-text and vector retrieval engine.
7. **Learner / AI Layer:** Non-authoritative interactive learning and grounded tutoring.

---

## 2. Deterministic Graph Topology

### 2.1 Nodes (219,918 Total Canonical Nodes)
- **Kanji Nodes (13,108):** Canonical kanji entities identified by `kanji-${character}` or baseline keys.
- **Dictionary Nodes (206,747):** Canonical JMdict and first-party vocabulary entries identified by `de-jmdict-${entSeq}` or `de-${slug}`.
- **Radical Nodes (63):** Canonical Kangxi and Mind Tree primitive radicals.
- **Visual Asset Nodes (11,658):** KanjiVG vector SVG representations.

### 2.2 Relationship Edges (993,378 Total Derived Edges)
All relationship edges follow strict deterministic identity schemas:
- **Kanji → Word (`KanjiWordEdge`):**
  - Pattern: `kanji:${character}:dict:${entryId}:pos:${position}`
  - Properties: `position` (0-based character index in headword), `totalKanji`, `readingType` (`ON`, `KUN`, `SPECIAL`, `JUKUJIKUN`, `ATEJI`, `IRREGULAR`), `matchedReading`, `isSolo`, `isPrefix`, `isSuffix`, `jlptLevel`, `isCommon`.
- **Word → Kanji (`WordKanjiEdge`):**
  - Pattern: `word:${entryId}:kanji:${character}:pos:${position}`
  - Properties: Ordered sequence of kanji characters with exact character positions.
- **Kanji → Reading (`KanjiReadingEdge`):**
  - Pattern: `kanji:${character}:reading:${type}:${reading}`
  - Properties: `readingType`, `hasOkurigana`, `okuriganaStem`, `okuriganaSuffix`, `sourceRef`.
- **Kanji → Component (`CompositionEdge`):**
  - Pattern: `COMP:${kanjiId}:${elementId}:${orderIndex}`
  - Properties: `role` (semantic, phonetic, positional), `renderedAs`.
- **Kanji → Radical (`RadicalEdge`):**
  - Pattern: `RADICAL:${kanjiId}:${primaryRadicalId}`

---

## 3. Query & Navigation Contracts

### 3.1 Compound Discovery
The service enables multidimensional compound queries without altering full-text search relevance:
- **Words beginning with X:** `getKanjiCompounds("食", { position: "prefix" })` (e.g. `食事`, `食物`)
- **Words ending with X:** `getKanjiCompounds("食", { position: "suffix" })` (e.g. `朝食`, `夕食`)
- **Words containing X and Y:** `getKanjiCompounds("食", { coOccurringWith: "事" })` (e.g. `食事代`, `食事会`)
- **Words by reading:** `getReadingVocabulary("食", "たべる")` (e.g. `食べる`, `食べ比べる`)

### 3.2 Kanji Mind Tree
Provides the conceptual navigational hierarchy for future rich UI:
```
漢字 (e.g. 食)
├── Radical: 飠 / 食 (Radical 184)
├── Components: 𠆢, 良, 艮
├── Stroke Count: 9 (Vector SVG timing via KanjiVG)
├── Stroke Order Diagram: Static SVG with numbered quadrant grid
├── Animated Stroke SVG: CSS-animated keyframe stroke generation
├── On'yomi: ショク, ジキ
├── Kun'yomi: た.べる, く.う
├── JLPT: N5 (Grade 2, Frequency rank 320)
├── Vocabulary:
│   ├── N5: 食べる, 食事, 食堂
│   ├── N4: 朝食, 昼食, 夕食
│   ├── N3: 食卓, 軽食, 食欲
│   └── N2/N1: 断食, 蚕食, 摂食
├── Compounds:
│   ├── Prefix: 食事, 食品, 食用
│   └── Suffix: 給食, 定食, 洋食
└── Neighbors: 飲, 館, 飯 (Shares radical / structural family)
```

---

## 4. Architectural Invariants
1. **Zero Database Schema Changes:** No tables or migrations added. The graph is computed via deterministic runtime joins and in-memory indexed structures.
2. **Zero Database Mutation:** All graph operations are strictly read-only.
3. **Canonical Authority Preservation:** KANJIDIC2 stroke counts, meanings, and sourceRefs are never modified by KanjiVG or JMdict data.
4. **Non-Destructive Discrepancy Policy:** Edge-case kanji like `箸` preserve their canonical 14 strokes in the database while exposing alternative counts cleanly.
5. **No AI Hallucination:** Graph relationships are derived strictly from authoritative source data and deterministic lexical rules.
