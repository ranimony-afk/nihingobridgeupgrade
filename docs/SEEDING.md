# Idempotent Database Seeding Runbook

**Document Version:** 4.0.0  
**Status:** FULLY COMPLIANT  

---

## 1. What does Seeding Ingest?

Our seeding script `src/lib/seed.ts` is 100% idempotent and can be run repeatedly without duplicating primary keys or overwriting live student progress. It provisions:

1. **Brand Multi-Tenancy**: Nihongo Bridge and Ascend Academy brand profiles.
2. **Headless CMS Sections**: Announcement bar, countdown clock, and hero copy.
3. **Specialized Multilingual Translations**: English, Tamil, Malayalam, and Japanese settings.
4. **LMS modular curriculum**: Program tracks, modular hierarchies, and lessons.
5. **Japanese Learning Catalog**: 64 N5-N4 characters, daily news shadowing, and mock practice quizzes.
6. **Student Gamification**: Weekly goal meters, Sapphire League leaderboard candidates, and achievements.

---

## 2. Triggering Seeding

### 2.1 Centralized Setup command
Seeding is triggered automatically during programmatic platform bootstrap:
```bash
npm run setup
```

### 2.2 Dedicated Seed Command
To run seeding separately at any time:
```bash
npm run db:seed
```

*(Expected Seeding Complete Screenshot Placeholder: [database_seeding_complete_green_logs.png])*
