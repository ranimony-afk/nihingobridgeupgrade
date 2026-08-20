# Phase 04 — Learning Engine Prompts

## Objective
Implement the core learning platform: courses, modules, lessons, quizzes, and progress tracking.

## Prerequisites
- Phase 01 complete (schema)
- Knowledge data available (Phase 02)

## Prompt Sequence

### Prompt 04-01: Learning Engine Architecture
```
Design the learning engine architecture.
Define: course structure, lesson types, quiz engine,
progress tracking model, JLPT preparation framework,
content rendering strategy.
Review existing learning code in both repositories.
```

### Prompt 04-02: Course & Module Implementation
```
Implement course, module, and lesson data model and CRUD.
Include: creation, ordering, publishing workflow.
Implement course enrollment.
Build course listing and navigation UI.
```

### Prompt 04-03: Quiz Engine
```
Implement the quiz engine supporting question types:
multiple choice, fill-in-the-blank, matching, ordering, free text.
Implement scoring, feedback, and explanation display.
Support both lesson-embedded quizzes and standalone tests.
```

### Prompt 04-04: Progress Tracking
```
Implement user progress tracking.
Track: lesson completion, quiz scores, time spent, course progress.
Build progress dashboard showing overall and per-course progress.
Implement progress API endpoints.
```

### Prompt 04-05: JLPT Preparation
```
Implement JLPT preparation features.
Organize content by JLPT level (N5–N1).
Create JLPT practice tests.
Track JLPT-specific progress.
```

## Deliverables Checklist
- [ ] Learning engine architecture
- [ ] Course/module/lesson CRUD
- [ ] Lesson content rendering
- [ ] Quiz engine
- [ ] Progress tracking
- [ ] JLPT preparation
- [ ] Learning API endpoints
- [ ] Progress dashboard UI
