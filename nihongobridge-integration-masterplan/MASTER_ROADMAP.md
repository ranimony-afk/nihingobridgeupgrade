# MASTER ROADMAP — NihongoBridge Integration

## Overview

This roadmap defines the phased integration plan for combining the canonical NihongoBridge application (`nihingobridgeupgrade`) with selected, verified functionality from the knowledge repository (`Knowledge-base-NihongoBridge`) into a production-grade Japanese learning ecosystem.

---

## Guiding Principles

1. **Preservation first** — existing functionality is an asset, not a liability
2. **Evidence-based** — every decision requires inspection, understanding, and documentation
3. **Non-destructive** — no blind resets, no DROP TABLE, no silent removals
4. **Backward compatible** — existing APIs, auth, and data must continue to work
5. **Incremental** — small, logical steps with verification at each gate
6. **Reversible** — every change must have a documented rollback procedure

---

## Phase Overview

| Phase | Name | Description | Dependencies |
|---|---|---|---|
| **00** | Discovery & Audit | Full audit of both repositories | None |
| **01** | Foundation & Schema | Database schema consolidation | Phase 00 |
| **02** | Knowledge ETL | Dictionary, kanji, grammar data pipelines | Phase 01 |
| **03** | Search & Retrieval | Search infrastructure and API | Phase 02 |
| **04** | Learning Engine | Courses, lessons, quizzes, progress | Phase 01 |
| **05** | SRS & Review | Spaced repetition system | Phase 04 |
| **06** | AI Integration | AI tutor, RAG, explanations | Phase 03 |
| **07** | Gamification | XP, streaks, achievements | Phase 04 |
| **08** | Mobile (Flutter) | Flutter client integration | Phase 03, 04, 05 |
| **09** | Production & Deploy | CI/CD, monitoring, security | All phases |

---

## Phase 00 — Discovery & Audit

### Objective
Complete audit of both repositories to understand what exists, what works, what conflicts, and what's missing.

### Deliverables
- [ ] Repository 1 file inventory with classification
- [ ] Repository 2 file inventory with classification
- [ ] Database schema analysis (both repos)
- [ ] API route inventory (both repos)
- [ ] Authentication analysis
- [ ] Component conflict analysis
- [ ] Dependency analysis
- [ ] Integration classification matrix (KEEP/MODIFY/MERGE/MOVE/DEPRECATE/REPLACE/ARCHIVE)
- [ ] Risk assessment
- [ ] Phase 00 completion checklist

### Gate Criteria
- All inventories complete
- All classifications documented
- All conflicts identified
- Risk register updated
- Decision log started

---

## Phase 01 — Foundation & Schema

### Objective
Establish the consolidated database schema that supports all planned functionality while preserving existing data.

### Deliverables
- [ ] Consolidated Drizzle schema
- [ ] Migration plan (non-destructive)
- [ ] Compatibility layer for existing queries
- [ ] Schema validation tests
- [ ] Data provenance model
- [ ] Phase 01 completion checklist

### Gate Criteria
- Schema applied without data loss
- Existing queries still work
- All tables have provenance columns where applicable
- Migration is reversible
- Tests pass

---

## Phase 02 — Knowledge ETL

### Objective
Build data pipelines to import dictionary, kanji, grammar, and sentence data with full provenance tracking.

### Deliverables
- [ ] ETL pipeline architecture
- [ ] Dictionary import pipeline (JMdict/JMnedict)
- [ ] Kanji import pipeline (KANJIDIC2)
- [ ] Radical/component data pipeline
- [ ] Grammar data pipeline
- [ ] Sentence/example pipeline
- [ ] Provenance tracking
- [ ] Data validation reports
- [ ] Phase 02 completion checklist

### Gate Criteria
- All pipelines execute successfully
- Data has provenance metadata
- Import is idempotent
- Data validation passes
- No existing data destroyed

---

## Phase 03 — Search & Retrieval

### Objective
Implement search infrastructure for dictionary, kanji, grammar, and content search.

### Deliverables
- [ ] Search API design
- [ ] Full-text search implementation
- [ ] Kanji lookup (by radical, reading, meaning, stroke count)
- [ ] Dictionary search (English ↔ Japanese)
- [ ] Grammar search
- [ ] Search result ranking
- [ ] Search API tests
- [ ] Phase 03 completion checklist

### Gate Criteria
- Search returns relevant results
- Performance is acceptable
- API is documented
- Tests pass
- Backward compatible with existing search if any

---

## Phase 04 — Learning Engine

### Objective
Implement the core learning platform: courses, modules, lessons, quizzes, and progress tracking.

### Deliverables
- [ ] Course/module/lesson data model
- [ ] Lesson content rendering
- [ ] Quiz engine
- [ ] Progress tracking
- [ ] JLPT preparation framework
- [ ] Practice modes
- [ ] Learning API
- [ ] Phase 04 completion checklist

### Gate Criteria
- Courses can be created and navigated
- Quizzes function correctly
- Progress is tracked accurately
- JLPT levels are supported
- API is backward compatible

---

## Phase 05 — SRS & Review

### Objective
Implement spaced repetition system with deck/card management and review scheduling.

### Deliverables
- [ ] SRS data model (decks, cards, reviews)
- [ ] Review scheduling algorithm (FSRS/SM-2)
- [ ] Review session UI
- [ ] Review history tracking
- [ ] Algorithm abstraction layer
- [ ] Sync support
- [ ] SRS API
- [ ] Phase 05 completion checklist

### Gate Criteria
- Cards can be created and reviewed
- Scheduling algorithm works correctly
- Review history is preserved
- Algorithm is swappable
- API is documented

---

## Phase 06 — AI Integration

### Objective
Integrate AI tutor functionality connected to the platform's knowledge and learning infrastructure.

### Deliverables
- [ ] AI tutor architecture
- [ ] RAG pipeline (dictionary + grammar + kanji)
- [ ] Grammar explanations
- [ ] Vocabulary explanations
- [ ] Translation assistance
- [ ] Correction engine
- [ ] Conversation practice
- [ ] Learning-context awareness
- [ ] AI API
- [ ] Phase 06 completion checklist

### Gate Criteria
- AI uses platform knowledge (not isolated)
- Responses are contextually relevant
- User progress influences AI behavior
- API is documented
- Costs are bounded

---

## Phase 07 — Gamification

### Objective
Implement gamification features: XP, streaks, achievements, daily goals, milestones.

### Deliverables
- [ ] Gamification data model
- [ ] XP system
- [ ] Streak tracking
- [ ] Achievement system
- [ ] Daily goals
- [ ] Milestone tracking
- [ ] Progress dashboard
- [ ] Gamification API
- [ ] Phase 07 completion checklist

### Gate Criteria
- XP is awarded correctly
- Streaks track accurately
- Achievements unlock properly
- Dashboard displays correctly
- API is documented

---

## Phase 08 — Mobile (Flutter)

### Objective
Integrate Flutter mobile client as a consumer of the platform API.

### Deliverables
- [ ] Flutter project setup
- [ ] Authentication integration
- [ ] Dictionary client
- [ ] Learning client
- [ ] SRS client
- [ ] AI tutor client
- [ ] Offline cache strategy
- [ ] Sync implementation
- [ ] Audio support
- [ ] Phase 08 completion checklist

### Gate Criteria
- Flutter authenticates via platform auth
- Core features work on mobile
- Offline mode functions
- Sync is reliable
- No duplicated server logic

---

## Phase 09 — Production & Deploy

### Objective
Production readiness: CI/CD, monitoring, security, backups, disaster recovery.

### Deliverables
- [ ] CI/CD pipeline
- [ ] Test automation
- [ ] Monitoring and alerting
- [ ] Backup strategy
- [ ] Disaster recovery plan
- [ ] Security audit
- [ ] Performance optimization
- [ ] Logging infrastructure
- [ ] Deployment documentation
- [ ] Phase 09 completion checklist

### Gate Criteria
- CI/CD deploys successfully
- Tests run automatically
- Monitoring is active
- Backups are verified
- Security review complete
- Performance meets targets

---

## Timeline Estimate

| Phase | Estimated Duration | Cumulative |
|---|---|---|
| Phase 00 | 1–2 days | 1–2 days |
| Phase 01 | 2–3 days | 3–5 days |
| Phase 02 | 3–5 days | 6–10 days |
| Phase 03 | 2–3 days | 8–13 days |
| Phase 04 | 5–7 days | 13–20 days |
| Phase 05 | 3–4 days | 16–24 days |
| Phase 06 | 4–6 days | 20–30 days |
| Phase 07 | 2–3 days | 22–33 days |
| Phase 08 | 5–7 days | 27–40 days |
| Phase 09 | 3–5 days | 30–45 days |

*Estimates are indicative. Actual duration depends on complexity discovered during Phase 00.*

---

## Success Criteria

The integration is complete when:

1. All phase checklists pass
2. All existing functionality is preserved or explicitly migrated
3. All knowledge data is imported with provenance
4. Search, learning, SRS, AI, and gamification are functional
5. Mobile client consumes the platform API
6. Production infrastructure is operational
7. No destructive changes were made without authorization
8. All decisions are logged
9. All risks are documented
10. Rollback procedures exist for every phase
