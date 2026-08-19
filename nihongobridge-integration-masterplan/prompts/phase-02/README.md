# Phase 02 — Knowledge ETL Prompts

## Objective
Build data pipelines to import dictionary, kanji, grammar, and sentence data with full provenance tracking.

## Prerequisites
- Phase 01 complete and gate approved
- Consolidated schema in place
- Provenance model implemented

## Prompt Sequence

### Prompt 02-01: ETL Architecture Design
```
Design the ETL pipeline architecture for importing knowledge data.
Define: data sources, file formats, parsing strategy,
transformation rules, loading strategy, provenance tracking,
idempotency approach, error handling, validation rules.
```

### Prompt 02-02: Dictionary Import Pipeline (JMdict)
```
Implement the JMdict dictionary import pipeline.
Parse JMdict XML, transform to domain model,
load into dictionary tables with provenance metadata.
Ensure idempotent upsert behavior.
Include validation and error reporting.
```

### Prompt 02-03: Kanji Import Pipeline (KANJIDIC2)
```
Implement the KANJIDIC2 kanji import pipeline.
Parse KANJIDIC2 XML, transform to domain model,
load into kanji and radical tables with provenance.
Link kanji to radicals where possible.
```

### Prompt 02-04: Grammar & Sentence Import
```
Implement grammar point and example sentence import pipelines.
Define source format, parsing, transformation, and loading.
Link sentences to grammar points and dictionary entries where possible.
```

### Prompt 02-05: ETL Validation & Reporting
```
Run all ETL pipelines and produce validation reports.
Verify: record counts, data integrity, provenance completeness,
no orphaned records, no duplicates, referential integrity.
```

## Deliverables Checklist
- [ ] ETL architecture document
- [ ] Dictionary import pipeline
- [ ] Kanji import pipeline
- [ ] Grammar import pipeline
- [ ] Sentence import pipeline
- [ ] Provenance tracking verified
- [ ] Validation reports
- [ ] Import is idempotent
- [ ] No existing data destroyed
