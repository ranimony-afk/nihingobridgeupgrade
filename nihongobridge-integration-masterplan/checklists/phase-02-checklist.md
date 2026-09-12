# Phase 02 — Knowledge ETL Checklist

## Gate Requirements

All mandatory items must pass before proceeding to Phase 03.

---

## ETL Architecture
- [ ] ETL architecture documented
- [ ] Data sources identified with licenses
- [ ] Parsing strategy defined
- [ ] Transformation rules documented
- [ ] Loading strategy defined (upsert/idempotent)

## Dictionary Pipeline
- [ ] JMdict parser implemented
- [ ] Dictionary entries loaded correctly
- [ ] Senses loaded correctly
- [ ] Readings loaded correctly
- [ ] Kanji forms loaded correctly
- [ ] Provenance metadata present
- [ ] Import is idempotent (re-run produces same result)

## Kanji Pipeline
- [ ] KANJIDIC2 parser implemented
- [ ] Kanji records loaded correctly
- [ ] Radical data loaded
- [ ] Kanji-radical relationships established
- [ ] Readings, meanings, metadata correct

## Grammar Pipeline
- [ ] Grammar points imported
- [ ] JLPT levels assigned
- [ ] Structures and explanations present

## Sentence Pipeline
- [ ] Example sentences imported
- [ ] Translations present
- [ ] Linked to grammar points where applicable
- [ ] Linked to dictionary entries where applicable

## Data Validation
- [ ] Record counts verified
- [ ] No orphaned records
- [ ] No duplicates
- [ ] Referential integrity verified
- [ ] Provenance completeness verified
- [ ] Validation report produced

## Safety
- [ ] No existing data destroyed
- [ ] Backup taken before import
- [ ] Rollback procedure documented

## Documentation
- [ ] Decision log updated
- [ ] Risk register updated
- [ ] ETL reports filed

## Gate Approval
- [ ] All mandatory items pass
- [ ] Approved to proceed to Phase 03
