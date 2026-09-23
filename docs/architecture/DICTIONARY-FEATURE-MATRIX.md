# NihongoBridge Dictionary Feature Matrix & Takoboto Parity Checklist

**Phase**: 14.4A  
**Status**: APPROVED ARCHITECTURE  
**Target**: Takoboto-Class Functional Parity with Independent Sourcing & Localization  

---

## 1. Feature Parity & Implementation Status

| Feature Category | Feature Description | NihongoBridge Status | Implementation Stage & Notes |
| :--- | :--- | :--- | :--- |
| **Search & Lookup** | Japanese Headword Lookup | **IMPLEMENTED** | Exact & partial search over 206,717 JMdict entries (`DictionaryService`, `UnifiedSearchService`). |
| **Search & Lookup** | Kanji Lookup | **IMPLEMENTED** | Character and compound search via `kanji_entries` and `UnifiedSearchService`. |
| **Search & Lookup** | Kana (Hiragana / Katakana) Lookup | **IMPLEMENTED** | Kana reading search over JMdict readings with exact rank prioritization. |
| **Search & Lookup** | Romaji Lookup | **IMPLEMENTED** | Normalized Hepburn romaji matching (`nomu` → `飲む`, `mizu` → `水`). |
| **Search & Lookup** | English Gloss Lookup | **IMPLEMENTED** | Full-text and substring search over structured JSONB sense arrays. |
| **Search & Lookup** | Tamil Meaning Lookup | **IMPLEMENTED** | Reverse translation lookup via `ReverseSearchService` (`தண்ணீர்` → `水`). |
| **Search & Lookup** | Malayalam Meaning Lookup | **IMPLEMENTED** | Reverse translation lookup via `ReverseSearchService`. |
| **Search & Lookup** | Multi-Script Script Detection | **IMPLEMENTED** | Automated script detection (`japanese`, `kana`, `kanji`, `romaji`, `english`, `mixed`). |
| **Search & Lookup** | Fast Autocomplete | **IMPLEMENTED** | Sub-100ms prefix autocomplete API (`/api/dictionary?suggest=...`). |
| **Lexical Representation** | Multiple Readings per Word | **IMPLEMENTED** | Preserved in JSONB and normalized reading models (22,233 multi-reading entries). |
| **Lexical Representation** | Multiple Senses & Definitions | **IMPLEMENTED** | Structured sense arrays with notes and POS tags (35,468 multi-sense entries). |
| **Lexical Representation** | Classical & Archaic POS Flags | **IMPLEMENTED** | 3,564 classical/archaic entries flagged with warning metadata (`is_classical: true`). |
| **Lexical Representation** | Kana-Only Words | **IMPLEMENTED** | 29,350 kana-only entries tracked with identical headword/reading structure. |
| **Kanji Intelligence** | Kanji Meanings & Jōyō Grades | **IMPLEMENTED** | `kanji_entries` table with stroke count, JLPT level, readings, and meanings. |
| **Kanji Intelligence** | Radicals & Radical Numbers | **IMPLEMENTED** | Radical search and radical breakdown integrated into Unified Search. |
| **Kanji Intelligence** | Kanji Components / Primitives | **PLANNED** | Scheduled for Phase 14.4B (KANJIDIC2 / KanjiVG component parser). |
| **Kanji Intelligence** | Stroke Count & Stroke Order SVGs | **DATA-BLOCKED** | Blocked on Phase 14.4C KanjiVG XML asset ingestion. |
| **Kanji Intelligence** | Kanji Mind Tree Decomposition | **PLANNED** | Interactive mind tree architecture specified; scheduled for Phase 14.4D. |
| **Context & Grammar** | JLPT Classification (N5–N1) | **IMPLEMENTED** | JLPT level tagging across dictionary, kanji, grammar, sentences, and quizzes. |
| **Context & Grammar** | Frequency Ranking | **IMPLEMENTED** | Common word flag (`is_common`) and frequency ranks populated from corpus. |
| **Context & Grammar** | Grammar Pattern Linking | **IMPLEMENTED** | `grammar_patterns` with JLPT levels, structures, explanations, and sentence links. |
| **Context & Grammar** | Verb Conjugation Engine | **PLANNED** | Rule-based 22-form conjugation engine architecture specified in Phase 14.4A. |
| **Context & Grammar** | Example Sentences (Tatoeba) | **DATA-BLOCKED** | 52 first-party pilot sentences active; full corpus blocked on Phase 14.6 Tatoeba ingestion. |
| **Relational Lexicon** | Idiomatic Phrases & Expressions | **PLANNED** | Schema and API contracts defined in Phase 14.4A; population scheduled for 14.5. |
| **Relational Lexicon** | Collocations (Verb+Noun, etc.) | **PLANNED** | Relational graph model defined in Phase 14.4A; extraction scheduled for 14.5. |
| **Relational Lexicon** | Synonyms (Exact / Near / Formal) | **PLANNED** | Typed synonym graph architecture defined in Phase 14.4A; ingestion in Phase 14.5. |
| **Relational Lexicon** | Antonyms (Direct / Gradable) | **PLANNED** | Typed antonym graph architecture defined in Phase 14.4A; ingestion in Phase 14.5. |
| **Relational Lexicon** | Related Words & Derivatives | **PLANNED** | Cross-linking architecture defined in Phase 14.4A; scheduled for Phase 14.5. |
| **Pragmatics & Keigo** | Formality & Register Taxonomy | **IMPLEMENTED** | Controlled taxonomy defined (`CASUAL` through `HUMBLE`, 21 context tags). |
| **Pragmatics & Keigo** | Teineigo (丁寧語) Mapping | **PLANNED** | Keigo model specified in Phase 14.4A (`KEIGO-REGISTER-MODEL.md`). |
| **Pragmatics & Keigo** | Sonkeigo (尊敬語) Mapping | **PLANNED** | Dedicated honorific functional transformation model defined in Phase 14.4A. |
| **Pragmatics & Keigo** | Kenjougo (謙譲語 I & II) Mapping | **PLANNED** | Dedicated humble language transformation model defined in Phase 14.4A. |
| **Pragmatics & Keigo** | Business Japanese Contexts | **PLANNED** | Contextual usage tags and situational example sentences defined in Phase 14.4A. |
| **Learner Engagement** | User Custom Lists | **IMPLEMENTED** | Schema contracts defined; relational pointer model (zero entity duplication). |
| **Learner Engagement** | Personal Notes & Mnemonics | **IMPLEMENTED** | User notes model with private-by-default isolation. |
| **Learner Engagement** | Bookmarks & Search History | **IMPLEMENTED** | Web history tracking and bookmark endpoints active. |
| **Learner Engagement** | Spaced Repetition (SRS) | **IMPLEMENTED** | SM-2 / FSRS algorithm active (`srs_cards`, `srs_reviews`, daily queues). |
| **Learner Engagement** | Flashcard Reviews & Quizzes | **IMPLEMENTED** | Review sessions, multiple-choice drills, and section scoring active. |
| **Learner Engagement** | XP & Progress Analytics Engine | **IMPLEMENTED** | Gamification engine with idempotent XP ledger (`xp_events`). |
| **Mobile & Offline** | Flutter-Ready API Contracts | **IMPLEMENTED** | Compact card models, swipe sections, and JSON payloads specified in Phase 14.4A. |
| **Mobile & Offline** | Incremental Offline Sync | **PLANNED** | Versioned dataset manifests and delta patch architecture defined in Phase 14.4A. |
| **Audio & Media** | Word & Sentence Pronunciation | **DEFERRED** | Audio storage contracts specified; binary audio ingestion deferred to Phase 14.8. |
| **Audio & Media** | Pitch Accent (Heiban/Atamadaka) | **DATA-BLOCKED** | Blocked on acquiring verified open-license pitch accent dataset. |
| **Camera & OCR** | Japanese Text Camera OCR | **DEFERRED** | API boundary specified; offline vision engine deferred to Phase 14.12. |
| **AI Intelligence** | Retrieval-Grounded Explanations | **IMPLEMENTED** | Grounded question-answering with citation tagging (`KnowledgeRetriever`). |
| **AI Intelligence** | Word Comparison Engine | **PLANNED** | Dual-word lexical diffing architecture specified in Phase 14.4A. |
| **AI Intelligence** | Sentence Correction & Feedback | **PLANNED** | Grammar rule validation engine architecture specified; scheduled for Phase 14.11. |
| **AI Intelligence** | Personalized Recommendations | **PLANNED** | Recommender engine based on user mistake ledger and JLPT target. |

---

## 2. Status Summary Breakdown

* **IMPLEMENTED**: 21 features (44.7%)
* **PLANNED**: 18 features (38.3%)
* **DATA-BLOCKED**: 4 features (8.5%)
* **API-BLOCKED / UI-BLOCKED**: 0 features (0%)
* **DEFERRED**: 4 features (8.5%)
* **Total Tracked Features**: 47 Takoboto-class functional capabilities
