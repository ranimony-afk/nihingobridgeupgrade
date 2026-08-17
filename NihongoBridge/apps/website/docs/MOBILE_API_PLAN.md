# Mobile API Integration Plan & Outcomes

**Version:** 4.13.0  
**Status:** COMPLETED & VERIFIED  

---

## 1. Executive Summary

This deliverable establishes the **Versioned Mobile REST API (v1)** optimized for native Android (Kotlin), iOS (Swift), and cross-platform (Flutter, React Native) clients. Secured via HMAC SHA-256 Bearer JWT tokens, the API layer provides dynamic endpoints under `/api/v1/mobile/` to synchronize all curriculum databases, progress indicators, assets metadata, and site configurations.

Interactive OpenAPI (Swagger UI) sandboxes are live at `/api/v1/swagger` and `/api/v1/openapi.json`.

---

## 2. Exposed Mobile API Endpoint Catalog

All mobile routes return structured JSON envelopes protected by sliding-window rate limiters and auth tokens:

1. **🔒 Authentication (`/mobile/auth`)**:
   POST registers or authenticates users and issues highly secure, 30-day HMAC SHA-256 Bearer JWT tokens.
2. **👤 Profile (`/mobile/profile`)**:
   GET extracts auth Bearer tokens dynamically and serves detailed student parameters and levels.
3. **🎓 LMS Catalog & Lessons (`/mobile/catalog`)**:
   GET loads courses, modules, and modular lessons.
4. **📖 Vocabulary Lexicon (`/mobile/vocabulary`)**:
   GET serves paginated, searchable Japanese vocabulary decks.
5. **🈸 Kanji Study Maps (`/mobile/kanji`)**:
   GET serves Kanji stroke counts, readings, and radical break-downs.
6. **🎴 Flashcard Decks (`/mobile/decks`)**:
   GET serves custom flashcard decks.
7. **Spaced Repetition Reviews (`/mobile/reviews`)**:
   POST submits reviews to update repetition repetitions and intervals using SM-2 algorithm.
8. **⏱ Mock Exams & Quizzes (`/mobile/quizzes` & `/mobile/mock-tests`)**:
   Serves practice quiz questions and section exam modules.
9. **📰 Blog & Todaii Daily News (`/mobile/news`)**:
   GET serves NHK Easy articles with translations and vocab lists.
10. **Progress & Achievements (`/mobile/progress` & `/mobile/achievements`)**:
    GET serves day streaks, total XP, and unlocked badge arrays.
11. **📥 Downloads Center (`/mobile/downloads`)**:
    GET serves bookmarked PDF workbooks and printable guides.
12. **🔔 Notifications & Alerts (`/mobile/notifications`)**:
    GET serves user notifications and study review reminders.

---

## 3. OpenAPI 3.0.0 & Future GraphQL Specifications

### 3.1 Swagger Sandbox Portal
- A visual Swagger interactive playground is accessible at `GET /api/v1/swagger`, which parses the dynamic `/api/v1/openapi.json` contract:
  ```json
  {
    "openapi": "3.0.0",
    "info": {
      "title": "Nihongo Bridge Mobile REST API",
      "version": "1.0.0"
    }
  }
  ```

### 3.2 Future GraphQL Layer Scheme
- A registered schema is drafted and tested inside `src/shared/mobile/index.ts`, setting a standard blueprint for future GraphQL resolvers:
  ```graphql
  type Query {
    brands: [Brand!]!
    courses(brandSlug: String!, page: Int, limit: Int): [Course!]!
    nihongoItems(category: String, jlptLevel: String): [NihongoItem!]!
  }
  ```
