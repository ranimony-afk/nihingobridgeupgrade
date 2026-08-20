# Phase 08 — Mobile (Flutter) Prompts

## Objective
Integrate Flutter mobile client as a consumer of the platform API.

## Prerequisites
- Phase 03 complete (search API)
- Phase 04 complete (learning API)
- Phase 05 complete (SRS API)
- Authentication documented

## Prompt Sequence

### Prompt 08-01: Mobile Architecture
```
Design the Flutter mobile architecture.
Define: project structure, state management (Provider/Riverpod),
API client layer, offline cache strategy, sync protocol.
Review existing Flutter code in both repositories.
Flutter is a CLIENT of the platform API — no duplicated server logic.
```

### Prompt 08-02: Authentication & API Client
```
Implement Flutter authentication using Repository 1 auth.
Build API client layer for all platform endpoints.
Implement token management and refresh.
Handle network errors gracefully.
```

### Prompt 08-03: Core Features
```
Implement core mobile features:
- Dictionary search and browsing
- Kanji lookup
- Grammar reference
- Course navigation and lessons
- Quiz interaction
Build screens and navigation.
```

### Prompt 08-04: SRS & Review Mobile
```
Implement SRS on mobile:
- Deck browsing
- Review session with card flip
- Review rating submission
- SRS statistics
Support offline review with sync.
```

### Prompt 08-05: AI Tutor Mobile
```
Implement AI tutor on mobile:
- Chat interface
- Grammar/vocabulary explanations
- Conversation display
Handle streaming responses if applicable.
```

### Prompt 08-06: Offline & Sync
```
Implement offline capability:
- Cache dictionary data locally
- Cache SRS cards and schedule
- Queue offline reviews for sync
- Delta-based synchronization
- Conflict resolution
```

## Deliverables Checklist
- [ ] Flutter project structure
- [ ] Authentication integration
- [ ] API client layer
- [ ] Dictionary screens
- [ ] Learning screens
- [ ] SRS review screens
- [ ] AI tutor screen
- [ ] Offline cache
- [ ] Sync implementation
- [ ] Audio support
- [ ] Mobile tests
