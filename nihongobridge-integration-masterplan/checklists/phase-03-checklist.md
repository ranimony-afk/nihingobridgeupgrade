# Phase 03 — Search & Retrieval Checklist

## Gate Requirements

All mandatory items must pass before proceeding to Phase 04.

---

## Search Infrastructure
- [ ] Search architecture documented
- [ ] Database indexes created
- [ ] Full-text search configured
- [ ] Trigram matching configured (if applicable)

## Dictionary Search
- [ ] English → Japanese search works
- [ ] Japanese → English search works
- [ ] Reading-based search works
- [ ] Partial matching works
- [ ] JLPT filtering works
- [ ] Common word filtering works

## Kanji Search
- [ ] Search by radical works
- [ ] Search by reading works
- [ ] Search by meaning works
- [ ] Search by stroke count works
- [ ] Search by grade works
- [ ] Search by JLPT level works

## Grammar Search
- [ ] Grammar point search works
- [ ] JLPT level filtering works

## Cross-Domain Search
- [ ] Cross-domain search returns relevant results
- [ ] Results are properly ranked

## API
- [ ] Search API endpoints implemented per API_CONTRACT.md
- [ ] Response format matches contract
- [ ] Pagination works correctly
- [ ] Error handling correct

## Performance
- [ ] Search benchmarks recorded
- [ ] Response times acceptable (< 500ms for typical queries)
- [ ] No N+1 query issues

## Testing
- [ ] Search integration tests pass
- [ ] Edge cases tested (empty query, special characters, long queries)

## Documentation
- [ ] Decision log updated
- [ ] Search capabilities documented

## Gate Approval
- [ ] All mandatory items pass
- [ ] Approved to proceed to Phase 04
