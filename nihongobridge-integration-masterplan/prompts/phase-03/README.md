# Phase 03 — Search & Retrieval Prompts

## Objective
Implement search infrastructure for dictionary, kanji, grammar, and content search.

## Prerequisites
- Phase 02 complete and gate approved
- Knowledge data imported
- Database indexes defined

## Prompt Sequence

### Prompt 03-01: Search Architecture
```
Design the search infrastructure.
Evaluate: PostgreSQL full-text search, pg_trgm trigram matching,
Japanese-specific tokenization, search ranking strategy.
Define API endpoints and response format.
```

### Prompt 03-02: Dictionary Search Implementation
```
Implement dictionary search supporting:
- English → Japanese lookup
- Japanese → English lookup
- Reading-based search
- Partial matching
- JLPT filtering
- Common word filtering
Optimize with appropriate indexes.
```

### Prompt 03-03: Kanji Search Implementation
```
Implement kanji search/lookup supporting:
- Search by radical
- Search by reading (on/kun)
- Search by meaning
- Search by stroke count
- Search by grade
- Search by JLPT level
- Multi-radical search
```

### Prompt 03-04: Grammar & General Search
```
Implement grammar point search and general cross-domain search.
Support searching across dictionary, kanji, and grammar simultaneously.
Implement result ranking and relevance scoring.
```

### Prompt 03-05: Search API & Testing
```
Implement search API endpoints per API_CONTRACT.md.
Write search integration tests.
Benchmark search performance.
Document search capabilities and limitations.
```

## Deliverables Checklist
- [ ] Search architecture document
- [ ] Dictionary search implementation
- [ ] Kanji search implementation
- [ ] Grammar search implementation
- [ ] Cross-domain search
- [ ] Search API endpoints
- [ ] Performance benchmarks
- [ ] Search tests
