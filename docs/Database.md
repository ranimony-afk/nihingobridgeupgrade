# PostgreSQL Database Schema & Relational Specifications

**Document Version:** 4.0.0  
**ORM:** Drizzle ORM (PostgreSQL Dialect)  

---

## 1. Schema Topology

The database architecture is designed with strict relational normalization rules, structured indices, foreign keys constraints, and cascade delete safeguards.

### 1.1 Complete Relational Table Manifest (47 Tables)

1. **User Identity & Auth (NextAuth Adapter)**:
   - `users`: Core student and editor credentials.
   - `accounts`: Google/Social OAuth credential maps.
   - `sessions`: Auth database-session tokens.
   - `verification_tokens`: Outbound email signup tokens.
2. **Headless CMS & Localizations**:
   - `brands`: Multi-tenant tenant records (Nihongo Bridge, Ascend Academy).
   - `pages`: Dynamic page routers.
   - `content_sections`: JSONB reusable homepage modules.
   - `brand_settings`: Navigation menu links and footers.
   - `translations`: Multilingual localized fields.
3. **LMS & Curriculum Networks**:
   - `courses`: Educational programs.
   - `modules`: Modular lesson groupings.
   - `lessons`: Graded study lesson decks.
   - `enrollments`: Student course enrollment mappings.
   - `learner_gamification`: Streaks, XP scores, levels, and badge awards.
4. **Japanese Study Items & Exams**:
   - `nihongo_learning_items`: Master Vocabulary, Kanji, and grammar.
   - `kanji_dictionary`: Radicals, component breakdowns, and stroke order studies.
   - `news_articles`: NHK Easy daily reading shadowing sheets.
   - `nihongo_quizzes`: Graded diagnostic practice questions.
   - `jlpt_exam_sessions`: Timed mock tests attempts and verified certificate code logs.

---

## 2. Integrity Constraints & Cascades

- **On Delete Cascade**: Deleting a brand cascade-deletes all its `content_sections`, `pages`, and `courses`. Deleting a course cascade-deletes its `modules` and `lessons`.
- **Soft Delete**: Supported via `deletedAt` timestamps across critical student profiles and user records.
- **Auto-Timestamps**: `createdAt` and `updatedAt` default to `now()` and are maintained programmatically via server updates.

*(Expected Schema ERD Diagram Screenshot Placeholder: [postgresql_database_er_diagram.png])*
