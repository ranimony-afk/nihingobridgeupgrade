# NihongoBridge — Complete Arena.ai Build Prompt Sequence
### Data Pipelines · API Routes · Test-Taking UI · Full Platform Roadmap

---

## HOW TO USE THIS DOCUMENT

Run each prompt block in Arena.ai **in sequence**. Each phase builds on the previous.
- Copy the prompt exactly into Arena.ai
- Save each output into the corresponding repo (`nihongobridge-etl`, `nihongobridge-api`, etc.)
- Do not skip phases — later prompts reference schemas and types from earlier ones

---

# ═══════════════════════════════════════════════
# PHASE 1 — DATABASE SCHEMA
# Target repo: nihongobridge-knowledge
# ═══════════════════════════════════════════════

## PROMPT 1.1 — Core Schema (Dictionary, Kanji, Grammar)

```
You are a senior database architect. Build a production-grade PostgreSQL schema for NihongoBridge, a Japanese language learning platform. 

Generate complete Drizzle ORM schema files (TypeScript) for these modules:

MODULE 1: Dictionary
Table: dictionary_entries
- id (uuid, PK)
- word (text, not null)
- kana (text)
- romaji (text)
- furigana (jsonb) -- {base: string, ruby: string}[]
- meanings (jsonb) -- {lang: string, value: string, pos: string}[]
- jlpt_level (enum: N5,N4,N3,N2,N1,NONE)
- part_of_speech (text[])
- pitch_accent (jsonb)
- frequency_rank (integer)
- synonyms (uuid[])
- antonyms (uuid[])
- example_sentence_ids (uuid[])
- grammar_ids (uuid[])
- kanji_ids (text[])
- audio_url (text)
- tags (text[])
- source (text) -- 'jmdict', 'custom'
- source_id (text)
- created_at, updated_at (timestamps)
- is_active (boolean, default true)

MODULE 2: Kanji
Table: kanji_entries
- id (uuid, PK)
- character (char(1), unique, not null)
- unicode (text)
- onyomi (text[])
- kunyomi (text[])
- meanings (jsonb) -- {lang: string, value: string}[]
- jlpt_level (enum)
- grade (integer 1-9)
- frequency_rank (integer)
- stroke_count (integer)
- radicals (text[])
- components (text[])
- svg_animation_url (text)
- stroke_order_url (text)
- example_word_ids (uuid[])
- similar_kanji (text[])
- lookalikes (text[])
- mnemonics (jsonb) -- {source: string, text: string}[]
- source (text) -- 'kanjidic2'
- created_at, updated_at

MODULE 3: Grammar
Table: grammar_patterns
- id (uuid, PK)
- pattern (text, not null) -- e.g. "〜てから"
- pattern_plain (text) -- searchable ASCII
- meaning (jsonb) -- {lang: string, value: string}[]
- formation (text)
- formation_diagram (jsonb)
- jlpt_level (enum)
- examples (jsonb) -- {jp: string, reading: string, translations: {lang: string, value: string}[]}[]
- common_mistakes (text)
- related_pattern_ids (uuid[])
- notes (text)
- audio_url (text)
- tags (text[])
- source (text)
- created_at, updated_at

MODULE 4: Sentences
Table: sentences
- id (uuid, PK)
- japanese (text, not null)
- furigana_html (text)
- translations (jsonb) -- {lang: string, value: string}[]
- audio_url (text)
- jlpt_level (enum)
- grammar_ids (uuid[])
- vocabulary_ids (uuid[])
- tags (text[])
- source (text) -- 'tatoeba', 'custom'
- source_id (text)
- created_at, updated_at

Also generate:
1. All Drizzle ORM relations
2. Index definitions for search performance (GIN indexes for JSONB, text search indexes)
3. Enums file
4. Migration file (drizzle-kit compatible)
5. TypeScript type exports

Output as separate files:
- schema/dictionary.ts
- schema/kanji.ts
- schema/grammar.ts
- schema/sentences.ts
- schema/enums.ts
- schema/relations.ts
- drizzle.config.ts
```

---

## PROMPT 1.2 — JLPT, Tests, SRS, User Progress Schema

```
Continue the NihongoBridge PostgreSQL/Drizzle ORM schema. Build these modules:

MODULE 5: JLPT Tests & Practice
Table: practice_tests
- id (uuid, PK)
- title (text)
- level (enum: N5,N4,N3,N2,N1)
- test_type (enum: mock_full, section_only, quick_drill, adaptive)
- sections (jsonb) -- {type: string, time_minutes: number, question_ids: uuid[]}[]
- total_time_minutes (integer)
- difficulty_score (float)
- tags (text[])
- is_published (boolean)
- created_by (uuid, FK users)
- created_at, updated_at

Table: questions
- id (uuid, PK)
- test_id (uuid, FK practice_tests, nullable -- standalone questions)
- section_type (enum: vocabulary, grammar, reading, listening)
- question_jp (text)
- question_en (text)
- stimulus (jsonb) -- passage or audio metadata
- options (jsonb) -- {id: string, text_jp: string, text_en: string}[]
- correct_answer (text)
- explanation_jp (text)
- explanation_en (text)
- vocabulary_ids (uuid[])
- grammar_ids (uuid[])
- audio_url (text)
- image_url (text)
- difficulty (integer 1-5)
- jlpt_level (enum)
- time_limit_seconds (integer)
- tags (text[])
- source (text) -- 'original', 'generated'
- is_active (boolean)
- created_at, updated_at

Table: test_sessions
- id (uuid, PK)
- user_id (uuid, FK users)
- test_id (uuid, FK practice_tests)
- started_at (timestamp)
- completed_at (timestamp)
- time_spent_seconds (integer)
- answers (jsonb) -- {question_id: uuid, selected: string, time_taken: number}[]
- score_total (float)
- score_by_section (jsonb)
- passed (boolean)
- review_mode (boolean, default false)

MODULE 6: SRS (Spaced Repetition)
Table: srs_cards
- id (uuid, PK)
- user_id (uuid, FK users)
- item_type (enum: word, kanji, grammar, sentence)
- item_id (uuid)
- ease_factor (float, default 2.5)
- interval_days (integer, default 1)
- repetitions (integer, default 0)
- next_review_at (timestamp)
- last_reviewed_at (timestamp)
- total_reviews (integer)
- correct_count (integer)
- mistake_count (integer)
- average_time_ms (integer)
- confidence (enum: again, hard, good, easy)
- deck_id (uuid, FK srs_decks, nullable)
- created_at, updated_at

Table: srs_decks
- id (uuid, PK)
- user_id (uuid)
- name (text)
- description (text)
- jlpt_level (enum)
- card_count (integer)
- is_public (boolean)
- created_at, updated_at

MODULE 7: User Progress
Table: users
- id (uuid, PK)
- email (text, unique)
- username (text, unique)
- display_name (text)
- avatar_url (text)
- target_level (enum)
- current_level (enum)
- study_languages (text[]) -- ['en','ta','ml','hi']
- streak_days (integer, default 0)
- last_study_date (date)
- xp_total (integer, default 0)
- created_at, updated_at

Table: user_progress
- id (uuid, PK)
- user_id (uuid, FK users)
- item_type (enum)
- item_id (uuid)
- status (enum: not_started, learning, reviewing, mastered)
- accuracy (float)
- study_count (integer)
- last_studied_at (timestamp)
- notes (text)

Table: user_bookmarks
- id (uuid, PK)
- user_id (uuid)
- item_type (enum)
- item_id (uuid)
- collection_name (text)
- created_at

MODULE 8: Media Library
Table: media_assets
- id (uuid, PK)
- filename (text)
- file_type (enum: audio, image, svg, pdf, video)
- mime_type (text)
- url (text)
- storage_path (text)
- size_bytes (integer)
- duration_ms (integer, nullable -- for audio)
- related_item_type (text)
- related_item_id (uuid)
- language (text, default 'ja')
- voice_id (text) -- TTS voice used
- created_at

Generate:
1. All schema files
2. Relations between all modules including Phase 1 schemas
3. Full migration
4. Seed data templates for N5 level (5 words, 5 kanji, 3 grammar patterns, 2 questions)
```

---

# ═══════════════════════════════════════════════
# PHASE 2 — ETL DATA PIPELINES
# Target repo: nihongobridge-etl
# ═══════════════════════════════════════════════

## PROMPT 2.1 — JMdict ETL Pipeline

```
Build a complete Python ETL pipeline for nihongobridge-etl repository.

Task: Parse and import JMdict (Japanese-English dictionary) XML into PostgreSQL.

Requirements:
1. Download handler: fetch JMdict_e.xml.gz from edrdg.org/pub/Nihongo/JMdict_e.gz with retry logic and checksum verification
2. XML Parser: use lxml for streaming parse of large XML (do not load full file into memory)
3. Transformer: map JMdict entry structure to nihongobridge dictionary_entries schema:
   - <ent_seq> → source_id
   - <keb> → word (first kanji element)
   - <reb> → kana
   - <pos> tags → part_of_speech (normalize JMdict POS codes to readable labels)
   - <gloss xml:lang="eng"> → meanings[lang=en]
   - <misc> tags → tags
   - <ke_inf> → tags (irregular kanji, etc.)
   - Map JMdict dial/field tags to our tag system
4. JLPT level enrichment: cross-reference jlpt-vocab-lists (N5-N1 word lists from OpenJLPT) to set jlpt_level
5. Frequency enrichment: load innocentcorpus frequency data to set frequency_rank
6. Deduplication: check existing records by source_id before insert
7. Batch upsert: use PostgreSQL COPY or batch INSERT with ON CONFLICT DO UPDATE
8. Progress tracking: tqdm progress bars, estimated time, checkpoint/resume on failure
9. Validation report: output JSON report with counts, errors, skipped, warnings
10. License preservation: embed JMdict CC BY-SA 3.0 attribution in source field

Output files:
- etl/parsers/jmdict_parser.py
- etl/transformers/jmdict_transformer.py
- etl/loaders/dictionary_loader.py
- etl/enrichers/jlpt_enricher.py
- etl/enrichers/frequency_enricher.py
- etl/pipelines/jmdict_pipeline.py (orchestrator)
- etl/utils/db.py (async SQLAlchemy connection pool)
- etl/utils/downloader.py (with retry + checksum)
- etl/config.py (env-based config with pydantic-settings)
- requirements.txt
- .env.example
- README.md with run instructions

Use: Python 3.11+, asyncio, SQLAlchemy 2.0 async, asyncpg, pydantic-settings, lxml, tqdm, httpx
```

---

## PROMPT 2.2 — KANJIDIC2 + KanjiVG ETL Pipeline

```
Build ETL pipelines for kanji data in nihongobridge-etl:

PIPELINE 1: KANJIDIC2
Source: kanjidic2.xml from edrdg.org
Parse fields:
- <literal> → character
- <cp_value cp_type="ucs"> → unicode
- <grade> → grade
- <stroke_count> (first) → stroke_count
- <variant type="jis208"> etc → similar_kanji
- <freq> → frequency_rank
- <jlpt> → jlpt_level (remap: 4=N5,3=N4,2=N3,1=N2)
- <reading r_type="ja_on"> → onyomi (array)
- <reading r_type="ja_kun"> → kunyomi (array, strip okurigana dot notation)
- <meaning xml:lang="en"> → meanings[lang=en]
- <meaning xml:lang="fr"> → meanings[lang=fr]
- Enrich with N1 kanji from OpenJLPT (KANJIDIC2 only goes to N2)

PIPELINE 2: KanjiVG
Source: kanjivg-20160426-all.zip from GitHub (KanjiVG/kanjivg)
- Extract individual SVG files per kanji
- Parse stroke order from SVG path data
- Upload SVGs to MinIO/local storage, set svg_animation_url in kanji_entries
- Generate stroke order JSON array from SVG paths

PIPELINE 3: KRADFILE / RADKFILE
Source: radkfile and kradfile from edrdg.org
- Build kanji→radicals mapping
- Build radical→kanji reverse index
- Store in kanji_entries.radicals field

PIPELINE 4: Cross-linking
After all kanji imported:
- For each kanji, find related dictionary entries containing that kanji
- Update kanji_entries.example_word_ids with top 5 most frequent words

Output:
- etl/pipelines/kanjidic_pipeline.py
- etl/pipelines/kanjivg_pipeline.py
- etl/pipelines/radicals_pipeline.py
- etl/pipelines/kanji_crosslink_pipeline.py
- etl/parsers/kanjidic_parser.py
- etl/parsers/kanjivg_parser.py
- etl/storage/minio_client.py
- etl/run_all.py (master runner with --pipeline flag)

Include Docker Compose file with PostgreSQL + MinIO for local development.
```

---

## PROMPT 2.3 — Tatoeba Sentence ETL + TTS Audio Generation

```
Build two ETL pipelines for nihongobridge-etl:

PIPELINE 1: Tatoeba Sentences
Source: downloads.tatoeba.org/exports/
Files needed:
- sentences.csv (id, lang, text)
- links.csv (translation links between sentences)
- tags.csv

Steps:
1. Filter Japanese sentences (lang='jpn')
2. Find linked English, Tamil, Hindi, Malayalam sentences via links.csv
3. Build sentence objects: {jp, translations: [{lang, value}]}
4. Generate furigana HTML using fugashi + ipadic-neologd:
   pip install fugashi[unidic] 
   For each sentence, tokenize and wrap kanji readings in <ruby> tags
5. Tag with JLPT level: if all vocabulary is N5, tag N5, etc. (use jlpt word lists)
6. Extract vocabulary_ids and grammar_ids via pattern matching
7. Deduplicate by japanese text hash
8. Batch import to sentences table
9. Output: top 1000 sentences per JLPT level as JSON for seed files

PIPELINE 2: TTS Audio Generation
Use edge-tts (Microsoft Edge TTS, free, no API key):
pip install edge-tts

For each sentence in the database:
1. Generate audio: 
   edge-tts --voice ja-JP-NanamiNeural --text "{sentence}" --write-media {id}.mp3
2. For listening test dialogues use alternating voices:
   Female: ja-JP-NanamiNeural
   Male: ja-JP-KeitaNeural
3. Store audio files in MinIO: /audio/sentences/{id}.mp3
4. Update sentences.audio_url in database
5. Rate limit to 10 requests/second to avoid throttling
6. Checkpoint: skip already-generated audio
7. Generate audio for all dictionary words too (pronunciation guides)

Output:
- etl/pipelines/tatoeba_pipeline.py
- etl/pipelines/tts_pipeline.py
- etl/enrichers/furigana_enricher.py
- etl/enrichers/jlpt_tagger.py
- etl/utils/tts_client.py

Add to requirements.txt: fugashi, unidic-lite, edge-tts, pydub
```

---

## PROMPT 2.4 — Question Paper Generator (Original JLPT-style)

```
Build an original question generation pipeline for nihongobridge-etl.
IMPORTANT: Generate only original questions from our own knowledge base. Do NOT reproduce copyrighted JLPT exam content.

GENERATOR 1: Vocabulary Questions (文字・語彙)
Types to generate:
a) Reading selection: given kanji word, pick correct reading from 4 options
   - Source: dictionary_entries where jlpt_level = target
   - Distractors: other words with similar kanji or similar readings
b) Meaning selection: given Japanese word, pick correct English/Tamil meaning
c) Fill-in-the-blank: sentence with blank, pick correct word
   - Source: sentences table filtered by level

GENERATOR 2: Grammar Questions (文法)
Types:
a) Sentence completion: choose correct grammar pattern for blank
   - Source: grammar_patterns + sentences with grammar_ids tagged
b) Error identification: 4 sentences, find the grammatically incorrect one
c) Sentence ordering: arrange jumbled sentence parts

GENERATOR 3: Reading Comprehension (読解)
Types:
a) Short passage (100-200 chars): 2 questions
b) Medium passage (300-500 chars): 3 questions
c) Information retrieval: "what does the notice say about X"
- Generate passages using sentence combinations from sentences table
- Questions test: main idea, specific detail, vocabulary in context, author's intent

GENERATOR 4: Listening (聴解)
Types:
a) Dialogue: 2-speaker conversation, 1 question
b) Monologue: 1 speaker, 1 question
c) Quick response: short utterance, choose best reply
- Generate scripts from sentence combinations
- Auto-generate audio via edge-tts
- Store script as transcript in questions.stimulus

For each generator:
- Accept level parameter (N5-N1)
- Accept count parameter
- Validate generated questions with a quality check function
- Output to questions table
- Mark source='generated'

Output:
- etl/generators/vocabulary_question_gen.py
- etl/generators/grammar_question_gen.py
- etl/generators/reading_question_gen.py
- etl/generators/listening_question_gen.py
- etl/generators/test_assembler.py (assembles full mock test from generated questions)
- etl/generators/quality_checker.py

test_assembler.py should:
- Accept level, test_type (full_mock, section_drill)
- Pull questions by section, difficulty, avoiding recent repeats for user_id
- Assemble practice_tests record and insert to DB
- Return test_id
```

---

# ═══════════════════════════════════════════════
# PHASE 3 — API ROUTE HANDLERS
# Target repo: nihongobridge-api (or nihongobridge-web/app/api)
# ═══════════════════════════════════════════════

## PROMPT 3.1 — Dictionary & Kanji API

```
Build production-grade Next.js 14 App Router API route handlers for NihongoBridge.
Use: TypeScript, Drizzle ORM, PostgreSQL, Redis for caching, Zod for validation.
All responses follow: { data: T, meta: { page, limit, total }, error?: string }

ROUTE GROUP: /api/dictionary

GET /api/dictionary/search
Params: q (string), level (N5-N1), pos (part of speech), limit (default 20), page
- Full-text search across word, kana, romaji, meanings
- Use PostgreSQL tsvector with Japanese + English config
- Also search via Meilisearch if MEILISEARCH_URL env is set
- Cache results in Redis for 1 hour (key: dict:search:{hash of params})
- Return: dictionary_entries[] with furigana, meanings, audio_url
- Include X-Cache header (HIT/MISS)

GET /api/dictionary/[id]
- Fetch single entry by UUID
- Populate: example_sentences (3), related kanji, grammar patterns
- Cache: 24 hours

GET /api/dictionary/autocomplete
Params: q (string, min 1 char), limit (default 10)
- Fast prefix search on word and kana fields
- Response time target: <100ms
- Cache: 30 minutes

GET /api/dictionary/random
Params: level (optional), limit (default 1)
- Return random entries for flashcard/quiz use

POST /api/dictionary/bulk
Body: { ids: string[] } (max 100)
- Fetch multiple entries at once for SRS review sessions

ROUTE GROUP: /api/kanji

GET /api/kanji/[character]
- Single kanji by character (e.g. /api/kanji/水)
- Return full kanji data including svg_animation_url, stroke order
- Include: example_words (5), similar_kanji details

GET /api/kanji/search
Params: q, level, grade, stroke_min, stroke_max, radical, limit, page
- Search by meaning (English), reading (on/kun), or radical

GET /api/kanji/by-radical/[radical]
- All kanji containing this radical

GET /api/kanji/level/[level]
- All kanji for a JLPT level, paginated

GET /api/kanji/[character]/quiz
- Return quiz data: character, hide readings/meaning based on quiz_type param

Also build:
- middleware/rateLimit.ts (100 req/min per IP, 1000 for authenticated)
- middleware/cache.ts (Redis wrapper with TTL)
- lib/db.ts (Drizzle client singleton)
- lib/search.ts (Meilisearch + PostgreSQL fallback)
- types/api.ts (all response types)
- utils/pagination.ts

Include OpenAPI 3.0 JSDoc comments on every route for auto-documentation.
```

---

## PROMPT 3.2 — Test Engine API

```
Build the Practice Test API for NihongoBridge. This is the core engine for timed JLPT-style tests.

ROUTE GROUP: /api/tests

POST /api/tests/start
Body: { level: string, test_type: string, section?: string, user_id: string }
- Call test_assembler to get or create a test
- Create test_session record with started_at
- Return: { session_id, test_id, sections[], first_question, time_remaining_seconds }
- Session state stored in Redis: tests:session:{session_id}

GET /api/tests/session/[sessionId]
- Return current session state
- Include: current_question, answers_so_far, time_elapsed, time_remaining
- Validate session belongs to requesting user

POST /api/tests/session/[sessionId]/answer
Body: { question_id: string, selected: string, time_taken_ms: number }
- Record answer in Redis session state
- Return: { next_question?, section_complete?, test_complete?, time_remaining }
- Do NOT reveal correct answer during test (only in review mode)

POST /api/tests/session/[sessionId]/complete
- Finalize session: calculate scores, persist to test_sessions table
- Score calculation:
  - Vocabulary section: max 60 points
  - Grammar+Reading: max 60 points  
  - Listening: max 60 points
  - Total: 180, pass threshold: 90 (with minimum per section)
- Update user XP: +10 per completed test, +2 per correct answer
- Update user_progress for all items in the test
- Return: { score_total, score_by_section, passed, accuracy, time_spent, review_url }

GET /api/tests/session/[sessionId]/review
- Return full test with correct answers, explanations, user's answers
- Only available after session is complete
- Highlight mistakes, show grammar/vocab links for each question

GET /api/tests/history
Params: user_id, level, limit, page
- User's past test sessions with scores and trends

GET /api/tests/[testId]/questions
Params: section (optional), page, limit
- List questions in a test (admin/preview use)

GET /api/tests/analytics/[userId]
- Return: accuracy by level, accuracy by section type, streak, weak areas
- Weak areas: question types with <60% accuracy in last 20 attempts
- Recommend: next study focus based on weak areas

ROUTE GROUP: /api/listening

GET /api/listening/[questionId]/audio
- Stream audio file from MinIO/storage
- Support Range requests for seek
- Cache-Control: public, max-age=86400

POST /api/listening/generate
Body: { script: DialogueLine[], voice_config: VoiceConfig }
- Generate audio via edge-tts (server-side)
- Store in MinIO, return audio_url
- Admin only route

Build also:
- lib/scoring.ts (score calculation logic)
- lib/session.ts (Redis session management)
- lib/xp.ts (XP and streak logic)
- types/test.ts
```

---

## PROMPT 3.3 — SRS, User Progress & Grammar API

```
Build remaining API routes for NihongoBridge:

ROUTE GROUP: /api/srs

GET /api/srs/due
Params: user_id, limit (default 20), deck_id (optional)
- Return cards due for review (next_review_at <= now())
- Order by: overdue first, then by ease_factor ascending
- Include full item data (word/kanji/grammar details)

POST /api/srs/review
Body: { card_id: string, confidence: 'again'|'hard'|'good'|'easy', time_taken_ms: number }
- Apply SM-2 algorithm:
  again: interval=1, ease-=0.2
  hard: interval=interval*1.2, ease-=0.15
  good: interval=interval*ease, ease unchanged
  easy: interval=interval*ease*1.3, ease+=0.15
- Clamp ease between 1.3 and 2.5
- Update next_review_at = now() + interval days
- Return: { next_review_at, interval_days, cards_remaining_today }

POST /api/srs/add
Body: { user_id, item_type, item_id, deck_id? }
- Add item to user's SRS queue
- Check for duplicates

GET /api/srs/stats/[userId]
- Return: due_today, studied_today, mastered_total, streak, accuracy_30d

ROUTE GROUP: /api/grammar

GET /api/grammar/search
Params: q, level, limit, page
- Search grammar patterns by pattern text or meaning

GET /api/grammar/[id]
- Single grammar pattern with all examples

GET /api/grammar/level/[level]
- All patterns for a JLPT level

GET /api/grammar/[id]/quiz
- Generate 4-option quiz for this grammar pattern
- Uses sentences tagged with this grammar_id as correct, others as distractors

ROUTE GROUP: /api/user

GET /api/user/[userId]/dashboard
- Return: streak, XP, level, due_cards_count, recent_test_scores, bookmarks_count, 
  recent_activity (last 7 days), recommended_next_study

POST /api/user/[userId]/bookmark
Body: { item_type, item_id, collection_name }

DELETE /api/user/[userId]/bookmark/[bookmarkId]

GET /api/user/[userId]/bookmarks
Params: item_type, collection_name, page

ROUTE GROUP: /api/search (global)

GET /api/search
Params: q, types (comma-separated: word,kanji,grammar,sentence), level, limit
- Unified search across all content types
- Returns grouped results: { words: [], kanji: [], grammar: [], sentences: [] }
- Uses Meilisearch multi-index search

Also build:
- lib/srs.ts (SM-2 algorithm implementation)
- lib/search-index.ts (Meilisearch indexing functions)
- middleware/auth.ts (Supabase JWT verification)
```

---

# ═══════════════════════════════════════════════
# PHASE 4 — TEST-TAKING UI COMPONENTS
# Target repo: nihongobridge-web
# ═══════════════════════════════════════════════

## PROMPT 4.1 — Test Engine Core UI

```
Build a complete JLPT-style test-taking UI for NihongoBridge using Next.js 14, TypeScript, and Tailwind CSS.

Design language:
- Japanese aesthetic: clean, minimal, ink-on-paper feeling
- Colors: near-white #FAFAF7 background, charcoal #1C1C1E text, accent red #C0392B (vermilion, like a hanko stamp)
- Font: Noto Sans JP for Japanese text, Inter for UI
- No clutter — every element serves the test-taking focus

COMPONENT 1: TestSession (app/test/[sessionId]/page.tsx + components)

Full page layout:
┌────────────────────────────────────┐
│ [Level Badge] N3 Mock Test  [Timer]│
│ Section: Reading  Q 4/12  ████░░  │
├────────────────────────────────────┤
│                                    │
│   [Question Display Area]          │
│                                    │
│   [Answer Options A B C D]         │
│                                    │
│   [Previous] [Flag] [Next →]       │
└────────────────────────────────────┘

Sub-components:
- TestTimer: countdown with color shift (green→yellow→red at 20% remaining), pause on listening audio, store elapsed in localStorage for recovery
- QuestionDisplay: renders question_jp with furigana toggle, supports passage display for reading sections
- AnswerOptions: 4 radio-style options (Japanese text), keyboard shortcut 1-4, highlight on hover/select
- SectionNav: breadcrumb showing sections, current position
- ProgressBar: animated fill, shows section progress
- FlagButton: bookmark question for review
- TestHeader: level badge, test type, question counter

State management (Zustand store):
- currentQuestion, answers map, flaggedQuestions set, timeElapsed, sessionId
- Auto-save to localStorage every 10 seconds (recovery on reload)
- Sync to API on answer

COMPONENT 2: ListeningQuestion
- Audio player: custom styled, NO scrubbing on first play (authentic JLPT)
- Play button: large, unmissable
- Auto-play when question loads with 3-second countdown
- Show transcript toggle (for review mode only)
- Speaker indicators for dialogue questions
- Replay limit (configurable, default 2 for N3+)

COMPONENT 3: ReadingPassage
- Passage on left (60%), questions on right (40%) on desktop
- On mobile: passage collapses, sticky "View Passage" button
- Furigana toggle (show/hide ruby text)
- Text size controls (+/-)
- Passage text in Noto Sans JP, 1.6 line height for readability
- Highlight mode: user can highlight passage text

Generate all TypeScript interfaces, hooks, and Zustand store.
Include responsive styles for mobile (390px) and tablet (768px).
```

---

## PROMPT 4.2 — Test Results & Review UI

```
Build the Test Results and Review UI for NihongoBridge:

COMPONENT 1: TestResults (app/test/[sessionId]/results/page.tsx)

Layout:
┌─────────────────────────────────┐
│  🎌 Test Complete               │
│                                 │
│  Total Score: 142/180           │
│  ████████████░░░ 79%            │
│  Status: PASS ✓                 │
│                                 │
│  ┌────────┬────────┬────────┐   │
│  │ Vocab  │Grammar │Listen  │   │
│  │ 52/60  │ 48/60  │ 42/60  │   │
│  │  87%   │  80%   │  70%   │   │
│  └────────┴────────┴────────┘   │
│                                 │
│  Time: 01:42:33 / 02:00:00     │
│  Accuracy: 78.8%                │
│                                 │
│  [Review Mistakes] [Study Weak] │
│  [New Test] [Share Result]      │
└─────────────────────────────────┘

Features:
- Animated score counter (counts up from 0)
- Section breakdown cards with mini bar charts
- Pass/fail with level-appropriate visual (green check / red X with encouraging message)
- Weak areas detected: list grammar/vocab items answered wrong 2+ times
- XP earned animation: "+240 XP" floats up
- Share card: generate OG-image-style card showing score (for social sharing)

COMPONENT 2: TestReview (app/test/[sessionId]/review/page.tsx)

Layout per question:
┌─────────────────────────────────┐
│  Q4  ✗ Incorrect  [Vocabulary] │
├─────────────────────────────────┤
│  問題文: ___を飲みます。         │
│                                 │
│  A. 水 ← Your answer (wrong)   │
│  B. 食べ                        │
│  C. 見 ← Correct ✓             │
│  D. 着                          │
│                                 │
│  💡 Explanation:                │
│  〜を見ます means "to watch/    │
│  look at". 水を飲みます means   │
│  "to drink water"...            │
│                                 │
│  📚 Grammar: Vて-form + を      │
│  📖 Vocabulary: 水, 見る        │
│  [+ Add to SRS] [Bookmark]     │
└─────────────────────────────────┘

Features:
- Filter bar: All / Correct / Incorrect / Flagged
- Jump to question number
- For each question: show all options with correct/wrong highlighting
- Inline explanation (JP + EN toggle)
- Linked vocabulary and grammar items (click → opens definition drawer)
- "Add to SRS" button for missed items (batch add or per item)
- Audio playback for listening questions
- Furigana toggle per question

COMPONENT 3: QuickDrillMode
- Card-flip style: question on front, answer revealed on flip
- Swipe left (wrong) / right (correct) on mobile
- Keyboard: space=flip, left arrow=wrong, right=correct
- Session summary after 20 cards

Build all as React components with TypeScript. Use Framer Motion for animations.
Generate custom hooks: useTestSession, useAudioPlayer, useSRSActions.
```

---

## PROMPT 4.3 — Dictionary & Kanji UI Components

```
Build the Dictionary and Kanji explorer UI for NihongoBridge:

COMPONENT 1: DictionarySearch (components/dictionary/DictionarySearch.tsx)
- Search bar: large, prominent, with IME support for Japanese input
- Autocomplete dropdown: show word + reading + brief meaning as user types
- Keyboard navigation in dropdown
- Filter chips: JLPT level (N5-N1), Part of speech, Has audio
- URL-synced: search updates URL params for shareable links
- Loading skeleton: match layout of results

COMPONENT 2: DictionaryEntry (components/dictionary/DictionaryEntry.tsx)
Display:
┌──────────────────────────────────┐
│  食べる                    [♪]   │
│  たべる  /  taberu               │
│  JLPT N5  •  Verb (Group 2)     │
├──────────────────────────────────┤
│  Meanings                        │
│  1. to eat                       │
│  2. to live on (e.g. salary)     │
├──────────────────────────────────┤
│  Example Sentences               │
│  毎日ご飯を食べます。            │
│  まいにちごはんをたべます。      │
│  I eat rice every day.     [♪]  │
├──────────────────────────────────┤
│  Related Kanji: 食              │
│  Related Grammar: 〜てから      │
├──────────────────────────────────┤
│  [+ Add to SRS] [Bookmark] [Quiz]│
└──────────────────────────────────┘

COMPONENT 3: KanjiCard (components/kanji/KanjiCard.tsx)
Display:
┌──────────────────────────────────┐
│      水           JLPT N5        │
│  (large, 120px, stroke animated) │
├──────────────────────────────────┤
│  音読み: スイ                    │
│  訓読み: みず                    │
│  Meaning: water                 │
│  Strokes: 4  Grade: 1           │
├──────────────────────────────────┤
│  [Stroke Order Animation]        │
│  ▶ Play  ●●●●                   │
│  (SVG animated step-by-step)    │
├──────────────────────────────────┤
│  Common Words                    │
│  水道・すいどう・waterworks      │
│  水曜日・すいようび・Wednesday   │
├──────────────────────────────────┤
│  Radicals: 水                   │
│  Similar: 氷 永                 │
│  [Writing Quiz] [+ SRS]         │
└──────────────────────────────────┘

COMPONENT 4: KanjiWritingQuiz (components/kanji/KanjiWritingQuiz.tsx)
- Canvas element for user to draw kanji
- Stroke order hints (toggle)
- Compare user strokes to reference SVG (basic similarity check)
- Or: click-to-reveal stroke-by-stroke mode
- Mobile touch support

COMPONENT 5: SRSReviewCard (components/srs/SRSReviewCard.tsx)
- Flashcard flip animation
- Front: word/kanji/grammar in large type
- Back: full entry with meanings, example, grammar
- Confidence buttons: Again / Hard / Good / Easy
- Color-coded: red/orange/green/blue
- Show next review interval on each button

Generate all components with:
- TypeScript interfaces
- Tailwind responsive classes
- Accessibility (ARIA labels, keyboard nav)
- Loading and empty states
- Dark mode support (Tailwind dark:)
```

---

## PROMPT 4.4 — Dashboard & Progress UI

```
Build the User Dashboard and Progress tracking UI for NihongoBridge:

COMPONENT 1: Dashboard (app/dashboard/page.tsx)

Layout (desktop):
┌─────────────────────────────────────────────┐
│  おはよう, [Name]!  🔥 23 day streak        │
├──────────────┬──────────────┬───────────────┤
│ Due for      │ Today's      │ Level         │
│ Review       │ Progress     │ Progress      │
│ 24 cards     │ ████░ 12/20  │ N4 → N3       │
│ [Start SRS]  │ 580 XP today │ 68% ready     │
├──────────────┴──────────────┴───────────────┤
│  Continue where you left off                │
│  [N3 Mock Test — Section 2 of 4] [Resume]  │
├─────────────────────────────────────────────┤
│  Study Areas                                │
│  [Dictionary] [Kanji] [Grammar] [Tests]     │
│  [Listening]  [Reading] [Flashcards] [Blog] │
├─────────────────────────────────────────────┤
│  Recent Activity (7 day chart)              │
│  Mon Tue Wed Thu Fri Sat Sun                │
│  ██  ██  ██  ░░  ██  ░░  ██               │
└─────────────────────────────────────────────┘

COMPONENT 2: ProgressStats (components/progress/ProgressStats.tsx)
- Vocabulary mastered: progress ring per level (N5, N4, N3...)
- Kanji mastered: same
- Grammar known: same
- Test history: mini sparkline chart (last 10 test scores)
- Accuracy trend: 30-day line chart (recharts)
- Time studied: heatmap like GitHub contributions (last 3 months)
- Weak areas: tag cloud of grammar/vocab items with low accuracy

COMPONENT 3: StreakCalendar (components/progress/StreakCalendar.tsx)
- Monthly grid view
- Green = studied, red = missed, gray = future
- Fire emoji on streak milestones (7, 30, 100 days)
- Longest streak vs current streak

COMPONENT 4: LevelReadinessCheck (components/progress/LevelReadiness.tsx)
- Shows readiness % for next JLPT level
- Breakdown: vocab %, kanji %, grammar %, test scores %
- Estimated time to ready (based on SRS pace)
- "Take Level Check Test" CTA

COMPONENT 5: StudyGoalSetter (components/progress/StudyGoal.tsx)
- Daily card goal slider (10/20/50/100)
- Target exam date picker
- Auto-calculates daily study requirement
- Push notifications toggle (PWA)

Build all with:
- recharts for all charts
- React Query for data fetching with 5-minute cache
- Optimistic UI updates
- Mobile-first layout (single column on mobile)
- Skeleton loaders for every data section
```

---

# ═══════════════════════════════════════════════
# PHASE 5 — ADMIN CMS
# Target repo: nihongobridge-admin
# ═══════════════════════════════════════════════

## PROMPT 5.1 — Admin Dashboard & Content Management

```
Build a role-based Admin CMS for NihongoBridge using Next.js 14, Tailwind, and Drizzle ORM.

Roles: super_admin, content_editor, reviewer

PAGES:

1. /admin — Dashboard
- Content counts: words, kanji, grammar, sentences, tests, questions
- Recent additions (last 7 days per content type)
- ETL pipeline status (last run, records imported, errors)
- Pending reviews count
- Quick actions: [Run ETL] [Generate Questions] [Publish Test]

2. /admin/dictionary — Dictionary Manager
- Paginated table with search, level filter, source filter
- Inline edit for simple fields
- Full edit modal: all fields including JSONB editors
- Bulk actions: set level, add tag, delete, export
- Import: CSV/JSON upload with field mapping UI
- "AI Generate" button: calls Arena/Claude API to generate more entries for a topic

3. /admin/kanji — Kanji Manager
- Grid view (kanji character cards) + table view toggle
- Filter by level, grade, has_svg, has_audio
- Edit: meanings, mnemonics, similar kanji
- Upload SVG animation for individual kanji
- Batch SVG import from KanjiVG

4. /admin/tests — Test Manager
- List of practice tests with publish status
- Create/Edit test: drag-and-drop question builder
- Question bank: search and add questions to test
- Preview mode: see test as student would
- Publish/unpublish toggle
- Analytics: completion rate, avg score per test

5. /admin/questions — Question Bank
- Filter by section_type, level, source, difficulty
- Edit any question with full form
- "AI Generate" button: generate N more questions at this level for this section
- Quality check: flag low-confidence questions for human review
- Bulk tag, bulk level-set

6. /admin/media — Media Library
- Grid of audio/image/svg/video files
- Upload with auto-association to content items
- Bulk delete unused media
- TTS generator: type text, select voice, generate and save

7. /admin/etl — Pipeline Control Panel
- Run ETL pipeline per source (JMdict, KANJIDIC2, Tatoeba, etc.)
- Live log streaming (Server-Sent Events)
- Schedule: cron-style scheduler for auto-updates
- Import report history

8. /admin/blog — Blog CMS
- Rich text editor (Tiptap)
- Draft / Published / Scheduled states
- Tags, categories, SEO fields
- Related content links (link to kanji/grammar within articles)

Build:
- Shared admin layout with sidebar nav, breadcrumbs
- Role-based route protection middleware
- Audit log: every create/update/delete is logged (who, what, when, diff)
- All forms use React Hook Form + Zod validation
- Toast notifications for all actions
```

---

# ═══════════════════════════════════════════════
# PHASE 6 — SEARCH ENGINE SETUP
# Target repo: nihongobridge-search
# ═══════════════════════════════════════════════

## PROMPT 6.1 — Meilisearch Setup & Indexing

```
Build the search infrastructure for NihongoBridge using Meilisearch (self-hosted, free).

1. Docker Compose setup:
services:
  meilisearch:
    image: getmeili/meilisearch:latest
    environment:
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
    volumes:
      - ./meili_data:/meili_data
    ports:
      - "7700:7700"

2. Index configuration (search/setup/configure-indexes.ts):
Create indexes:
- dictionary: searchable=[word,kana,romaji,meanings], filterable=[jlpt_level,part_of_speech,tags], sortable=[frequency_rank], typoTolerance for Japanese
- kanji: searchable=[character,onyomi,kunyomi,meanings], filterable=[jlpt_level,grade,stroke_count]
- grammar: searchable=[pattern,pattern_plain,meaning], filterable=[jlpt_level]
- sentences: searchable=[japanese,translations], filterable=[jlpt_level]

3. Sync pipeline (search/sync/sync-to-meili.ts):
- On database change (via Postgres LISTEN/NOTIFY or scheduled job), sync to Meilisearch
- Batch sync: pull all records, push in 1000-record batches
- Incremental sync: only updated_at > last_sync_timestamp

4. Query builder (search/lib/query.ts):
- Multi-index search: search all indexes simultaneously
- Faceted search: filters from URL params
- Highlighting: highlight matched terms in results
- Japanese-specific: normalize fullwidth/halfwidth, hiragana/katakana equivalents in queries

5. Autocomplete endpoint:
- Separate lightweight index for suggestions: just word+kana+id
- Sub-50ms response requirement

Output all TypeScript files + docker-compose.yml + README setup guide.
```

---

# ═══════════════════════════════════════════════
# PHASE 7 — AI TUTOR MODULE
# Target repo: nihongobridge-ai
# ═══════════════════════════════════════════════

## PROMPT 7.1 — AI Tutor API & Chat UI

```
Build the AI Tutor feature for NihongoBridge using the Anthropic Claude API.

BACKEND: app/api/ai/tutor/route.ts

POST /api/ai/tutor/chat
Body: { message: string, context: TutorContext, conversation_history: Message[] }

TutorContext: {
  current_level: string,
  recent_mistakes: string[], // grammar/vocab IDs
  current_topic?: string,
  language_preference: string // 'en'|'ta'|'ml'|'hi'
}

System prompt template:
"You are Hana-sensei, an expert Japanese language tutor for NihongoBridge. The student is at JLPT {level} level. Their recent weak areas are: {mistakes}. 
Rules:
- Explain grammar in simple terms with examples
- Always provide furigana for any Japanese text using <ruby> HTML tags
- Give at least one example sentence for every grammar point
- When correcting errors, explain WHY it's wrong, not just what's correct  
- If student asks in Tamil/Malayalam/Hindi, respond in that language for explanations
- Keep responses concise — max 200 words unless student asks for more detail
- At the end of explanations, suggest one related grammar point or vocabulary to learn next"

Features:
- Streaming response (Server-Sent Events)
- Context injection: if user is reviewing a grammar point, inject that grammar data into context
- Tool use: Hana-sensei can call our dictionary API to look up words mid-conversation
- Conversation history: last 10 messages sent per request
- Save AI explanations to ai_explanations table for reuse
- Rate limit: 20 messages/hour for free users, unlimited for premium

POST /api/ai/grammar-explain
Body: { pattern_id: string, user_level: string, example_sentence?: string }
- Generate original explanation for a grammar pattern
- Cache in database (ai_explanations table)
- Return: explanation_jp, explanation_en, original_examples (3), common_mistakes

POST /api/ai/translate
Body: { text: string, target_lang: string, include_breakdown: boolean }
- Translate JP ↔ EN/Tamil/Malayalam/Hindi
- If include_breakdown=true: return word-by-word breakdown with grammar notes

POST /api/ai/generate-questions
Body: { level: string, topic: string, section: string, count: number }
- Admin endpoint to generate question batch
- Validate and insert to questions table

FRONTEND: components/ai/TutorChat.tsx
- Floating chat bubble (bottom-right, opens to panel)
- Messages with Markdown rendering + furigana HTML rendering
- Streaming text: characters appear as they stream
- Context aware: shows "Studying: 〜てから" when on a grammar page
- Quick-action chips: "Explain this grammar", "Give me an example", "Quiz me on this"
- Conversation history persisted in localStorage
- "Clear conversation" button
- Mobile: full-screen modal on small screens
```

---

# ═══════════════════════════════════════════════
# PHASE 8 — FLUTTER MOBILE APP
# Target repo: nihongobridge-mobile
# ═══════════════════════════════════════════════

## PROMPT 8.1 — Flutter App Foundation

```
Build the NihongoBridge Flutter mobile app foundation.

Project setup:
flutter create nihongobridge_mobile --org com.nihongobridge --platforms android,ios

Dependencies (pubspec.yaml):
- dio: HTTP client
- flutter_riverpod: state management
- go_router: navigation
- sqflite: local SQLite for offline
- hive_flutter: fast local storage for SRS cards
- audioplayers: for listening tests
- flutter_tts: for pronunciation (fallback)
- cached_network_image
- google_fonts (NotoSansJP)
- flutter_animate
- flutter_markdown

Architecture: Feature-first with Riverpod
lib/
├── core/
│   ├── api/           # Dio client, interceptors, API endpoints
│   ├── db/            # SQLite schema, DAOs
│   ├── sync/          # Background sync service
│   └── theme/         # NihongoBridge design tokens
├── features/
│   ├── auth/
│   ├── dictionary/
│   ├── kanji/
│   ├── grammar/
│   ├── tests/
│   ├── srs/
│   ├── dashboard/
│   └── ai_tutor/

Build these core files:

1. core/api/api_client.dart
- Dio with base URL from env
- Auth interceptor: add JWT header
- Error interceptor: parse API error format, throw typed exceptions
- Retry interceptor: 3 retries with exponential backoff
- Logging in debug mode

2. core/db/local_db.dart
- SQLite tables mirroring key server tables (dictionary_entries, kanji_entries, srs_cards, test_sessions)
- DAO classes with CRUD + search methods
- Migration system

3. core/sync/sync_service.dart
- Background sync: pull updated items since last_sync_timestamp
- SRS cards: always sync on app open
- Dictionary: sync N5+N4 entries on first launch (for offline)
- Listen for connectivity changes; auto-sync on reconnect

4. features/dictionary/screens/dictionary_screen.dart
- Search bar with Japanese IME keyboard
- Results list with DictionaryEntryTile widgets
- Pull-to-refresh
- Offline fallback to local SQLite

5. features/tests/screens/test_screen.dart
- Matches web test layout for consistency
- Timer widget (CountdownTimer)
- Question display with furigana rendering (custom RubyText widget)
- Audio player for listening questions
- Answer selection with haptic feedback

6. features/srs/screens/review_screen.dart
- Swipeable FlipCard widget
- Confidence buttons with swipe gesture alternative
- Session progress indicator

7. core/theme/app_theme.dart
- Light/dark mode
- NihongoBridge color tokens
- Noto Sans JP text theme
- Consistent spacing scale

Generate all files with proper null safety and Flutter 3.x syntax.
```

---

# ═══════════════════════════════════════════════
# PHASE 9 — DEVOPS & DEPLOYMENT
# Target repo: nihongobridge-platform (root)
# ═══════════════════════════════════════════════

## PROMPT 9.1 — Docker, CI/CD, Environment Setup

```
Build the DevOps infrastructure for NihongoBridge monorepo.

1. docker-compose.yml (development)
Services:
- postgres:15 with init script (create databases: nihongobridge_dev, nihongobridge_test)
- redis:7-alpine
- meilisearch:latest
- minio:latest with default buckets (audio, images, svgs)
- mailhog (email testing)
- adminer (DB GUI)

All services with named volumes, health checks, and restart policies.

2. .env.example (comprehensive)
Cover all services:
DATABASE_URL, REDIS_URL, MEILISEARCH_URL, MEILISEARCH_KEY,
MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY,
NEXT_PUBLIC_API_URL, SUPABASE_URL, SUPABASE_ANON_KEY,
ANTHROPIC_API_KEY, NEXT_PUBLIC_APP_URL,
EDGE_TTS_RATE, EDGE_TTS_VOLUME

3. GitHub Actions Workflows:
.github/workflows/ci.yml
- Trigger: PR to main
- Jobs: lint, typecheck, test (unit + integration), build
- Matrix: node 20.x

.github/workflows/etl.yml
- Trigger: schedule (weekly Sunday 2am UTC) + manual dispatch
- Steps: checkout, setup Python, run ETL pipelines, notify Slack on failure

.github/workflows/deploy-web.yml
- Trigger: push to main
- Deploy to Vercel via vercel CLI
- Run DB migrations before deploy
- Health check after deploy

4. Makefile with common commands:
make dev        # Start all docker services
make migrate    # Run drizzle migrations
make seed       # Run seed data
make etl        # Run all ETL pipelines
make test       # Run all tests
make build      # Build all services
make sync-search # Sync database to Meilisearch

5. scripts/setup.sh
One-command local setup:
- Check prerequisites (node, python, docker, flutter)
- Copy .env.example → .env
- Start docker services
- Run migrations
- Run N5 seed data
- Index seed data in Meilisearch
- Print access URLs

6. README.md (root level)
- Project architecture diagram (ASCII)
- Quick start (3 commands)
- Repository map
- Contributing guide
- License notes for all open data sources used
```

---

# ═══════════════════════════════════════════════
# APPENDIX: ARENA.AI USAGE TIPS
# ═══════════════════════════════════════════════

## Workflow for Each Prompt

1. **Before running**: Set Arena.ai to use the largest available model for complex prompts (Phases 1-3)
2. **Context carry-forward**: Paste the previous phase's key schemas at the top of the next prompt using: "Reference schemas from Phase 1: [paste schema types]"
3. **Iteration pattern**: After each generation, follow up with: "Now add error handling and tests for all functions above"
4. **Validation pass**: After each module: "Review this code for TypeScript errors, missing null checks, and SQL injection vulnerabilities"
5. **Documentation**: "Generate JSDoc comments and a README section for the code above"

## Recommended Arena.ai Session Order

```
Session 1:  Prompt 1.1 → 1.2  (Schema)
Session 2:  Prompt 2.1        (JMdict ETL)
Session 3:  Prompt 2.2        (Kanji ETL)
Session 4:  Prompt 2.3        (Tatoeba + TTS)
Session 5:  Prompt 2.4        (Question Generator)
Session 6:  Prompt 3.1        (Dictionary API)
Session 7:  Prompt 3.2        (Test Engine API)
Session 8:  Prompt 3.3        (SRS + Grammar API)
Session 9:  Prompt 4.1        (Test UI Core)
Session 10: Prompt 4.2        (Results + Review UI)
Session 11: Prompt 4.3        (Dictionary + Kanji UI)
Session 12: Prompt 4.4        (Dashboard UI)
Session 13: Prompt 5.1        (Admin CMS)
Session 14: Prompt 6.1        (Search Engine)
Session 15: Prompt 7.1        (AI Tutor)
Session 16: Prompt 8.1        (Flutter App)
Session 17: Prompt 9.1        (DevOps)
```

## Data Source Attribution

Always preserve these licenses in your codebase:
| Source     | License       | Attribution Required |
|------------|---------------|----------------------|
| JMdict     | CC BY-SA 3.0  | Yes, in-app footer   |
| KANJIDIC2  | CC BY-SA 3.0  | Yes                  |
| KanjiVG    | CC BY-SA 3.0  | Yes                  |
| Tatoeba    | CC BY 2.0 FR  | Yes, per sentence    |
| KRADFILE   | Public Domain | No                   |
| RADKFILE   | CC BY-SA 4.0  | Yes                  |

Add an `/attributions` page to your website listing all sources.

---

*NihongoBridge Knowledge Platform — Build Sequence v1.0*
*Generated for nihongobridge repository*
