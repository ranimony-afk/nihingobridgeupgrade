# Phase 13.2 — Knowledge Retrieval

**Canonical repository:** `ranimony-afk/nihingobridgeupgrade`
**Status:** COMPLETE — implementation, tests, build and deployment gate verified
**Depends on:** Phase 13.1 architecture decision (`reports/ai/PHASE-13.1-AI-ARCHITECTURE-AUDIT.md`)

## 1. Scope

Build `KnowledgeRetriever` with structured retrieval from **dictionary, kanji, grammar and sentences**.

Per the Phase 13.1 decision, retrieval is the model-free half of the AI architecture. No AI provider, prompt or generation logic is introduced in this prompt.

## 2. What was built

| Concern | Path | Symbol |
|---|---|---|
| Retriever | `src/services/ai/knowledgeRetriever.ts` | `KnowledgeRetriever.retrieve`, `KnowledgeRetriever.retrieveEntity`, `KnowledgeRetriever.formatContext` |
| Corpus + provenance | `src/services/knowledge/corpusService.ts` | `KnowledgeCorpusService.ensureSeeded`, `ensureSources`, `getProvenance`, `getStats` |
| Canonical tables | `src/db/schema.ts` | `knowledgeSources`, `dictionaryEntries`, `grammarPatterns`, `exampleSentences` |
| First-party data | `src/data/lexicon.ts` | `DICTIONARY_ENTRIES` (30), `GRAMMAR_PATTERNS` (12), `EXAMPLE_SENTENCES` (24), `KNOWLEDGE_SOURCES` (4) |
| API | `src/app/api/ai/retrieve/route.ts` | `GET /api/ai/retrieve` |
| Tests | `tests/knowledge-retrieval.test.ts` | 14 tests |

### 2.1 Domain coverage

| Domain | Table | Ownership |
|---|---|---|
| dictionary | `dictionary_entries` | added in this prompt |
| kanji | `kanji_entries` | **existing canonical table, reused unchanged** |
| grammar | `grammar_patterns` | added in this prompt |
| sentences | `example_sentences` | added in this prompt |

No second kanji store was created. Kanji is read from the table already owned by `KnowledgeService`.

### 2.2 Retrieval contract

`retrieve(query, options)` returns:

- `chunks[]` — each with `domain`, `id`, `title`, `content`, `relevance`, `matchedOn`, **`record` (the untouched database row)**, `sourceRef`, `jlptLevel`
- `sources[]` — resolved provenance (`name`, `version`, `license`, `url`, `domain`)
- `domainCounts`, `domainsSearched`, `queryType`, `contextText`, `estimatedTokens`

`retrieveEntity(domain, id)` returns one entity plus linked records (grammar → its sentences, dictionary entry → its sentences and kanji, sentence → its grammar, kanji → words using it).

Query handling: Japanese, romaji and English are detected and matched against headwords, readings, romaji, glosses, kanji meanings/readings, grammar titles/structures/explanations, and sentence text. Ranking is deterministic and descending by relevance.

`contextText` is citation-tagged for the future generation step:

```
[dictionary:de-mizu | source=first-party:dictionary-core:v1]
水【みず／mizu】
...
```

## 3. Database changes

Additive only — four `CREATE TABLE` operations. No `DROP`, no `TRUNCATE`, no column removal, no change to existing tables.

```bash
npx drizzle-kit push   # [✓] Changes applied
```

## 4. Licensing and provenance

All seeded content is original first-party text. Readings, parts of speech and grammatical structures are standard, non-copyrightable language facts. No proprietary dictionary, textbook or exam database is reproduced.

Every knowledge row carries `sourceRef`, and every `sourceRef` resolves to a `knowledge_sources` row recording name, version and licence. The pre-existing kanji corpus was registered in the same registry so all four domains report provenance uniformly.

## 5. Deployment gate — AI retrieval tests return source records

Command:

```bash
npx vitest run
```

Result: **14 passed (14)**.

| Gate assertion | Test | Evidence |
|---|---|---|
| Dictionary returns a source record | `dictionary retrieval` | `record.id === "de-mizu"`, `headword === "水"`, gloss `water`, `sourceRef` set |
| Kanji returns a source record | `kanji retrieval` | `record.character === "聞"` with readings and stroke count from `kanji_entries` |
| Grammar returns a source record | `grammar retrieval` | `record.slug === "te-kara"` with structure, explanation, common mistakes |
| Sentences return source records | `sentence retrieval` | `record.japanese` contains 毎日, with reading and English |
| Cross-domain retrieval | `cross-domain retrieval` | one query returns kanji + dictionary + sentence records, correctly ranked |
| Provenance resolves | `provenance` | every `chunk.sourceRef` is present in `result.sources`, each with name/version/licence |
| Entity retrieval | `entity retrieval` | grammar → linked sentences; slug resolution; dictionary entry → linked kanji 時 |
| Filters and edge cases | `JLPT level filter`, `blank query` | level filter respected; blank query returns well-formed empty result |

One real defect was found and fixed by these tests: kanji rows referenced a source ref that had never been registered, so kanji records returned without provenance. Source registration is now independent of record seeding.

## 6. Verification commands

```bash
npx drizzle-kit push
npx vitest run
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run lint
npm run build
```

Live checks against the running preview:

```bash
curl -s '/api/ai/retrieve?q=水' | head
curl -s '/api/ai/retrieve?q=てから&domains=grammar,sentence'
curl -s '/api/ai/retrieve?domain=grammar&id=gp-te-kara'
```

## 7. Regression check

| Existing feature | Status |
|---|---|
| `/api/health` | PASS |
| `/api/kanji` and kanji mind tree | PASS — table reused, not modified |
| `/api/kana` | PASS |
| JLPT test listing and home page seeding | PASS — production build renders |
| SRS and XP routes | PASS — untouched, build emits all 39 routes |

## 8. Boundaries respected

- No AI provider abstraction, key, prompt or model call was added.
- No authentication system was introduced or swapped.
- No destructive database operation.
- No duplicate kanji, dictionary or search engine.
- Retrieval is a read-only service consumed through one API route.

## 9. Next bounded prompt

**Phase 13.3 — Single AI provider port and adapter**, consuming `KnowledgeRetriever.formatContext()` output as grounding, per the Phase 13.1 no-duplicate-provider gate.
