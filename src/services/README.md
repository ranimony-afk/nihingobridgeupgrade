# Services

Business rules live here. One directory per domain, one owner per capability
(see `docs/architecture/DOMAIN_OWNERSHIP.md`).

```
services/
├── auth/          identity, sessions, RBAC          → Phase 01.2
├── knowledge/     dictionary, kanji, grammar, sentences
├── search/        query parsing + ranking over knowledge
├── learning/      courses, lessons, quiz, jlpt, tests, progress
├── srs/           FSRS-5 scheduling (single scheduler)
├── gamification/  xp, streaks, achievements
├── ai/            retrieval-grounded tutor
└── admin/         editorial workflow, ETL control
```

## Rules

1. A service may call its **own** repository and other **services** — never
   another domain's repository or tables.
2. Services are framework-agnostic: no `next/server` imports, no `Request`
   or `Response` handling. That belongs to route handlers.
3. Pure logic (grading, scheduling math) is a pure function so it can be
   tested without a database.
4. Exactly one implementation per capability. A second dictionary lookup,
   grader, or scheduler is a gate failure.

Directories are created by the phase that implements them, so that the tree
never contains empty or speculative modules.
