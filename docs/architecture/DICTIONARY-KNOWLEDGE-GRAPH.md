# NihongoBridge Dictionary Knowledge Graph Architecture

**Phase**: 14.4A  
**Status**: APPROVED ARCHITECTURE  
**Target Class**: Takoboto-Grade Lexical Intelligence System  

---

## 1. Primary Architectural Principle & Hierarchy

NihongoBridge establishes a strict knowledge hierarchy that guarantees factual authority, provenance transparency, and complete safety across all user and AI interactions:

```
        ┌────────────────────────────────────────────────────────┐
        │              UPSTREAM / VERIFIED DATA                  │
        │   (JMdict 2023-08, KANJIDIC2, KanjiVG, Tatoeba, etc.)  │
        └───────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
        ┌────────────────────────────────────────────────────────┐
        │                CANONICAL KNOWLEDGE                     │
        │    (dictionary_entries, kanji_entries, sentences)      │
        └───────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
        ┌────────────────────────────────────────────────────────┐
        │              NORMALIZED LEXICAL GRAPH                  │
        │  (Orthographic variants, readings, multi-senses, POS)  │
        └───────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
        ┌────────────────────────────────────────────────────────┐
        │                DERIVED RELATIONSHIPS                   │
        │  (Synonyms, antonyms, collocations, phrases, keigo)   │
        └───────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
        ┌────────────────────────────────────────────────────────┐
        │                 EDITORIAL / CMS OVERLAY                │
        │       (Publication overlay, verified corrections)      │
        └───────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
        ┌────────────────────────────────────────────────────────┐
        │                     SEARCH INDEX                       │
        │   (PostgreSQL GIN, trgm, exact match ranker, script)   │
        └───────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
        ┌────────────────────────────────────────────────────────┐
        │                   LEARNER FEATURES                     │
        │     (Custom lists, user notes, bookmarks, SRS decks)   │
        └───────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
        ┌────────────────────────────────────────────────────────┐
        │              AI RETRIEVAL + EXPLANATION                │
        │   (Grounding against verified graph; NEVER canonical)   │
        └────────────────────────────────────────────────────────┘
```

### Core Invariants:
1. **AI is NEVER Authoritative**: AI models (Anthropic, OpenAI, etc.) must NEVER become canonical data sources. All factual dictionary definitions, readings, kanji breakdowns, and keigo mappings derive strictly from verified upstream databases.
2. **Retrieval-First AI Grounding**: If knowledge exists in the canonical graph, AI explanation tools must cite and ground against the retrieved entity IDs (`de-jmdict-*`, `kj-*`). If knowledge does not exist, the system must explicitly state that the entity is unverified rather than hallucinating lexical facts.
3. **Zero Destruction of Canonical JMdict**: The existing table `dictionary_entries` (206,717 rows, deterministic IDs `de-jmdict-${entSeq}`) remains the foundation. We extend the architecture around it without creating redundant tables or duplicate dictionary engines.

---

## 2. Interconnected Lexical Entity Model

Rather than storing all linguistic relationships in untyped JSON blobs, the NihongoBridge lexical graph decomposes vocabulary into strongly-typed relational entities:

```
Dictionary Entry (de-jmdict-*)
  ├── Headwords & Orthography (主要表記, 別表記, restrictions)
  ├── Readings (On'yomi, Kun'yomi, Jukujikun, Ateji, Nanori)
  ├── Senses & Definitions (English, Tamil, Malayalam)
  ├── Grammatical Class & Parts of Speech (POS)
  ├── JLPT Benchmark (N5–N1) & Frequency Rank
  ├── Kanji Component Decomposition (Kanji → Radical → Primitives)
  ├── Multilingual Translations (ta: தமிழ், ml: മലയാളം)
  ├── Context & Register Profile (Casual, Polite, Business, Honorific, Humble)
  ├── Functional Keigo Transformations (丁寧語, 尊敬語, 謙譲語 I & II)
  ├── Conjugation Table (20+ deterministic forms)
  ├── Synonyms & Antonyms (Typed lexical relations)
  ├── Collocations & Common Combinations (Verb+Noun, Adj+Noun, etc.)
  ├── Idiomatic Phrases & Expressions
  ├── Example Sentences (Tatoeba linked records)
  ├── Learner Overlays (Custom lists, personal notes, bookmarks)
  └── Spaced Repetition (SRS flashcards & review history)
```

---

## 3. Multi-Headword & Reading Representation

### Multi-Headword Support
A single JMdict lexical concept often contains multiple valid Japanese spellings:
* **主要表記 (Primary Headword)**: Highest frequency or canonical kanji/kana spelling (e.g. `水`, `食べる`, `明日`).
* **別表記 (Alternative Spellings)**: Orthographic variants, kana-alone variants, loanword variants (e.g. `明日` has alternatives `あす`, `あした`, `みょうにち`).
* **Historical / Rare Spellings**: Preserved with priority indicators without cluttering primary learner cards.

### Reading Classification
Readings are classified using linguistic taxonomy rather than a binary ON/KUN toggle:
* **音読み (On'yomi)**: `onyomi_goon` (呉音), `onyomi_kanon` (漢音), `onyomi_toon` (唐音), `onyomi_kanyon` (慣用音).
* **訓読み (Kun'yomi)**: `kunyomi_standard`, `kunyomi_okurigana`, `kunyomi_special`.
* **Special Lexical Readings**:
  * `jukujikun` (熟字訓): Special compound reading assigned to the word as a whole (e.g. `今日` → `きょう`, `煙草` → `たばこ`).
  * `ateji` (当て字): Phonetic kanji assignment without semantic connection (e.g. `珈琲` → `コーヒー`).
  * `nanori` (名乗り): Name readings used in personal/topographical names.
  * `irregular`: Morphological anomalies documented in JMdict.

---

## 4. Kanji Architecture & Mind Tree Decomposition

Each kanji referenced by dictionary headwords connects to the Kanji Knowledge Engine:

```
Kanji Character (e.g. 学)
  ├── Radical (e.g. 子 - Radical #39)
  ├── Primitives / Components (e.g. 子, 冖, ⺍)
  ├── Composition Structure (top_bottom, left_right, enclosure, etc.)
  ├── Stroke Count & Stroke Order Data (KanjiVG SVG paths)
  ├── On'yomi & Kun'yomi Readings
  ├── JLPT Level & Jōyō Grade
  └── Mind Tree (Interactive Visual Tree)
        学 (study / learn)
        ├── ⺍ (crown / small)
        ├── 冖 (cover / roof)
        └── 子 (child)
              └── Related Vocabulary:
                    * 学生 (がくせい - student)
                    * 学校 (がっこう - school)
                    * 学ぶ (まなぶ - to learn)
```

**Verification Rule**: Mind tree decomposition is derived strictly from verified structural tables (KANJIDIC2 and KanjiVG). AI is permitted to generate learner mnemonics explaining a verified decomposition, but AI is forbidden from inventing decomposition primitives.

---

## 5. Multilingual Translation Architecture

NihongoBridge provides multi-script localization supporting Indian languages alongside English and Japanese:

* **Primary Tier**: English (`en`), Tamil (`ta`), Malayalam (`ml`), Japanese (`ja`).
* **Future Expansion Tier**: Hindi (`hi`), Telugu (`te`), Kannada (`kn`), French (`fr`), German (`de`), Spanish (`es`).

### Translation Lifecycle & Editorial Promotion
To prevent uncurated machine translations from corrupting canonical records, translations follow a verified state machine:
```
[Machine Translation Proposal]
        │
        ▼
   [CMS Review]
        │
        ▼
[Human Verified Specialist]
        │
        ▼
  [Published to Learner API]
```

---

## 6. Synonyms, Antonyms, Collocations & Phrases

### Synonym Relationships
Synonyms are strongly typed by linguistic register and degree of equivalence:
* `EXACT_SYNONYM`: Full semantic interchangeability (e.g. `買う` ↔ `購入する` in appropriate context).
* `NEAR_SYNONYM`: Shared core meaning with subtle nuance differences (e.g. `見る` vs `眺める`).
* `FORMAL_SYNONYM`: Formal/written equivalent (e.g. `言う` → `申し上げる`).
* `INFORMAL_SYNONYM`: Casual/colloquial equivalent (e.g. `食べる` → `食う`).
* `WRITTEN_SYNONYM`: Literary/documentary style.
* `SPOKEN_SYNONYM`: Conversational style.
* `CONTEXTUAL_SYNONYM`: Synonymous only under specific predicate contexts.

### Antonym Relationships
* `DIRECT_ANTONYM`: Absolute opposites (e.g. `高い` ↔ `低い`, `大きい` ↔ `小さい`).
* `GRADABLE_OPPOSITE`: Opposites along a scale (e.g. `熱い` ↔ `冷たい`).
* `RECIPROCAL_OPPOSITE`: Relational/transactional reversals (e.g. `買う` ↔ `売る`, `教える` ↔ `教わる`).
* `CONTEXTUAL_ANTONYM`: Opposites in specific domain contexts.

### Collocations & Phrases
Captures natural, high-frequency word combinations essential for fluent production:
* `verb + noun`: `薬を飲む` (take medicine), `写真を撮る` (take a photo).
* `adjective + noun`: `深い関係` (deep relationship).
* `noun + verb`: `事故が起きる` (an accident occurs).
* `fixed_expression`: `よろしくお願いします`, `お世話になっております`.

---

## 7. Context System & Controlled Taxonomy

Every dictionary entry supports standardized contextual labels. Arbitrary string tags are prohibited in favor of the controlled taxonomy:

* **Formality**: `formal`, `informal`, `standard`
* **Channel**: `spoken`, `written`
* **Domain**: `business`, `academic`, `casual`, `literary`, `technical`, `medical`, `legal`, `internet`, `slang`, `archaic`
* **Sociolinguistic / Pragmatic**: `polite`, `humble`, `honorific`, `childrens_speech`, `female_coded`, `male_coded`, `dialect`

---

## 8. Data Model Layering & Separation of Concerns

Before adding any persistent table or model, the architecture mandates classifying the entity into one of seven distinct layers:

1. **Layer 1: Canonical Knowledge**: `dictionary_entries`, `kanji_entries`, `example_sentences`. Read-only to learners.
2. **Layer 2: Derived Relationships**: `synonym_relations`, `antonym_relations`, `collocation_relations`, `keigo_relations`. Populated by verified ETL pipelines.
3. **Layer 3: Editorial / CMS**: `cms_content_items`, `cms_content_versions`, `cms_audit_log`. Draft/review overlay.
4. **Layer 4: User-Generated Content**: `user_custom_lists`, `user_custom_list_items`, `user_lexical_notes`, `bookmarks`. Private by default, referencing canonical IDs.
5. **Layer 5: Search & Index Infrastructure**: Trigram indexes, tsvectors, cached autocomplete lexicons.
6. **Layer 6: Learner Lifecycle & SRS**: `srs_cards`, `srs_decks`, `srs_reviews`, `xp_events`.
7. **Layer 7: AI Retrieval & Grounding**: Context formatters, grounders, evaluation benchmarks. Transient generation only.
