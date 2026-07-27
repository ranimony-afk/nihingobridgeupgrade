# Platform Evolution & Remaining Post-Launch Tasks

**Platform:** Nihongo Bridge Unified Learning Platform  
**Target:** Post-v5.0.0 Production Operations & Future Expansion  

---

## 1. Operational & Content Expansion Roadmap

While all 10 phases of the core platform are complete and production-certified, the following enhancements are scheduled for the post-launch lifecycle:

### 1.1 Content Growth (CMS Team)
- [ ] Ingest additional N2 and N1 reading passages and audio dialogues into `news_articles` and `conversation_lessons`.
- [ ] Expand the radical Kanji map dataset from 100 core characters to all 2,136 Jōyō Kanji.
- [ ] Upload additional high-resolution PDF workbooks to the JapanVitta Download Center.

### 1.2 Multi-Language Localizations (i18n Team)
- [ ] Complete human review of the **Hindi (`hi`)**, **German (`de`)**, **French (`fr`)**, and **Korean (`ko`)** translation memory segments.

### 1.3 Native Client Deployments (Mobile Team)
- [ ] Compile and distribute the cross-platform **Flutter** client using the live OpenAPI 3.0 specification (`/api/v1/openapi.json`).
- [ ] Connect offline SQLite cache synchronization with `/api/v1/mobile/sync`.

---

## 2. Platform Maintenance Matrix

| Maintenance Task | Frequency | Automated System / Tool |
| :--- | :--- | :--- |
| **Database Migrations** | On schema change | `npx drizzle-kit push` |
| **Health Probe** | Continuous (every 30s) | `GET /api/health` |
| **Test Verification** | On every Git commit | `npm test` (node:test) |
| **API Spec Generation** | Dynamic | `GET /api/v1/openapi.json` |
