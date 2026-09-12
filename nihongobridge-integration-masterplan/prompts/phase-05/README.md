# Phase 05 — SRS & Review Prompts

## Objective
Implement spaced repetition system with deck/card management and review scheduling.

## Prerequisites
- Phase 04 complete (learning engine)
- Knowledge data available

## Prompt Sequence

### Prompt 05-01: SRS Architecture
```
Design the SRS architecture.
Evaluate: FSRS algorithm, SM-2 fallback, algorithm abstraction layer.
Define: deck/card model, review workflow, scheduling logic,
state machine (new → learning → review → relearning).
Review existing SRS code in both repositories.
```

### Prompt 05-02: Deck & Card Management
```
Implement deck and card CRUD.
Support card creation from: vocabulary, kanji, grammar, custom.
Implement deck settings (new cards/day, review limits).
Build deck management UI.
```

### Prompt 05-03: Review Scheduling Algorithm
```
Implement the review scheduling algorithm.
Primary: FSRS (Free Spaced Repetition Scheduler).
Fallback: SM-2.
Implement algorithm abstraction layer for swappability.
Include: stability, difficulty, interval calculation.
```

### Prompt 05-04: Review Session
```
Implement the review session workflow.
Present due cards, collect ratings (again/hard/good/easy),
update card state, record review history.
Build review session UI with card flip interaction.
```

### Prompt 05-05: SRS API & Stats
```
Implement SRS API endpoints per API_CONTRACT.md.
Build SRS statistics dashboard: reviews/day, retention rate,
card state distribution, forecast.
Write SRS tests.
```

## Deliverables Checklist
- [ ] SRS architecture document
- [ ] Deck/card CRUD
- [ ] Review scheduling algorithm
- [ ] Algorithm abstraction layer
- [ ] Review session UI
- [ ] Review history tracking
- [ ] SRS API endpoints
- [ ] SRS statistics dashboard
- [ ] SRS tests
