# Kanji Reading Intelligence & Classification Model

## 1. Overview
The **Kanji Reading Model** establishes rigorous linguistic categorization for Japanese readings across KANJIDIC2 canonical kanji entries and JMdict vocabulary items.

---

## 2. Reading Taxonomy

| Category | Linguistic Definition | Orthographic / Delimiter Marker | Example |
|---|---|---|---|
| **On'yomi (音読み)** | Sino-Japanese phonetic borrowing (Goon, Kan'on, Tōon, Kan'yōon) | Full Katakana strings (`[\u30A0-\u30FF]`) | `ショク` (食), `ニチ` (日), `ガク` (学) |
| **Kun'yomi (訓読み)** | Native Japanese lexical stems with bound okurigana morphemes | Okurigana dot separator (`.`) | `た.べる` (食), `まな.ぶ` (学), `おこな.う` (行) |
| **Nanori (名乗り)** | Historically attested name readings customary in Japanese surnames and given names | Separate non-dictionary classification | `まさ`, `よし`, `あき` |
| **Jukujikun (熟字訓)** | Whole-compound idiomatic readings where individual characters do not bear distinct morphemic syllables | Compound-level lexical association | `今日` (`きょう`), `昨日` (`きのう`), `明日` (`あした`), `大人` (`おとな`), `田舎` (`いなか`), `土産` (`みやげ`) |
| **Ateji (当て字)** | Kanji selected phonetically for foreign or native words without semantic character decomposition | Word-level phonetic association | `寿司` (`すし`), `珈琲` (`コーヒー`), `煙草` (`たばこ`) |
| **Irregular (変則)** | Historical contractions, euphonic shifts (Onbin), or anomalous combinations | Exception cataloging | `時計` (`とけい`), `八日` (`ようか`) |
| **Unknown** | Reading without clear source-documented derivation | Fallback classification | Preserved as `UNKNOWN` rather than guessed |

---

## 3. Okurigana Boundary Preservation & Search Normalization

1. **Storage Canonical Standard:**
   - In `kanji_entries.readingsKun`, all entries strictly preserve okurigana boundary dots:
     - `た.べる`
     - `まな.ぶ`
     - `おこな.う`
     - `み.る`

2. **Search Normalization Standard:**
   - In `KanjiLexicalGraphService.classifyReading()`, the service outputs both forms:
     - `reading`: `た.べる` (preserved for UI display)
     - `normalized`: `たべる` (stripped for dictionary headword matching)
     - `okuriganaStem`: `た`
     - `okuriganaSuffix`: `べる`

3. **Compound Word Matching:**
   - When linking `食べる` to `食`:
     - Headword `食べる` starts with stem `た` and ends with `べる`.
     - Matched reading resolves to `た.べる`.
     - Classification resolves to `KUN`.

---

## 4. Special Reading Handling (Jukujikun & Ateji)
- When a compound like `今日` (`きょう`) is queried:
  - The word-level edge `kanji:今:dict:de-kyou:pos:0` records `readingType: "JUKUJIKUN"` and `matchedReading: "きょう"`.
  - The kanji `今` itself does NOT inherit `きょう` as an individual On'yomi or Kun'yomi reading in `kanji_entries`.
  - This prevents corrupting single-character kanji dictionaries while correctly explaining the reading to learners in context.

---

## 5. Non-Hallucination Policy
- AI models are strictly prohibited from inventing or hypothesizing kanji readings.
- Reading classifications must be derived from:
  1. KANJIDIC2 authoritative reading tags.
  2. JMdict lexical readings and restrictions.
  3. Verified first-party Mind Tree data.
  4. Curated lexical mappings in `KNOWN_SPECIAL_LEXICAL_READINGS`.
