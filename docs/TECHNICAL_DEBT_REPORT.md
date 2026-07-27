# Phase 1 — Technical Debt Report

**Document Version:** 1.0.0  
**Scope:** Standalone Repositories (`Ascend-academy-website` and `nihongo-bridge`) vs Unified Enterprise Architecture.

---

## 1. Catalog of Identified Technical Debt

### 1.1 Hardcoded Content & Static Data Bloat
- **Issue**: Nihongo Bridge embedded hundreds of static curriculum items, JLPT guides, blog articles, and study abroad advice inside static TypeScript files (`lib/data.ts` and `lib/blog-content.tsx`). Ascend Academy similarly hardcoded course modules inside React component trees.
- **Impact**: Content changes required full code commits, pull requests, CI/CD pipeline runs, and server deployments. Non-technical content authors could not update course copy or fix typos independently.
- **Remediation**: Transitioned content to the PostgreSQL headless CMS (`pages` table) and LMS curriculum model (`courses`, `modules`, `lessons` tables) accessible via REST API.

### 1.2 Hardcoded Navigation & Structural Menus
- **Issue**: Navbars and dropdown link trees in both repositories were hardcoded with static route arrays.
- **Impact**: Adding new certification tracks or JLPT levels caused navbar layout breakage and required cross-component edits.
- **Remediation**: Brand registry (`src/lib/brands.ts`) and CMS API supply dynamic menu and course listing data.

### 1.3 Hardcoded SEO & Metadata Fragmentation
- **Issue**: Static `robots.ts`, `sitemap.ts`, and hardcoded `metadata` tags duplicated domain-specific canonical URLs without dynamic canonicalization or multilingual `hreflang` tags.
- **Impact**: Poor international SEO indexing; risk of duplicate content penalties across locale variants.
- **Remediation**: Centralized metadata generation with multilingual translation support via `translations` table.

### 1.4 Duplicate Code & Component Drift
- **Issue**: Both repositories maintained separate implementations of UI primitives (buttons, cards, badges, modals, dialogs, accordions).
- **Impact**: Doubled maintenance overhead, inconsistent UX styling, divergent bug fixes, and accessibility gaps.
- **Remediation**: Unified TailwindCSS styling and standard UI design tokens shared across brand subpaths.

### 1.5 Unused Code & Dependency Inefficiencies
- **Issue**: Repositories carried conflicting Next.js versions (e.g. Next.js 13.5 vs modern Next.js), duplicate styling libraries (`tailwindcss` v3 plugins vs modern PostCSS), and unused client SDKs (`@supabase/supabase-js` without active schema migrations).
- **Impact**: Increased `node_modules` footprint, bundle size inflation, and build latency.
- **Remediation**: Standardized on Next.js 16 + Drizzle ORM + Node PostgreSQL driver (`pg`).

### 1.6 Missing Automated Tests & Coverage Gaps
- **Issue**: Neither standalone repository possessed an automated unit test suite or end-to-end integration test runner in `package.json`.
- **Impact**: High regression risk during updates, schema changes, or refactoring.
- **Remediation**: Added automated test suite (`tests/api.test.ts`) executed via `node --import tsx --test` testing REST envelope integrity, brand registry consistency, and editorial status validations.

### 1.7 Missing Enterprise Documentation
- **Issue**: Lack of architecture specifications, API documentation, editorial workflow guidelines, or migration roadmaps.
- **Remediation**: Established full docs suite in `/docs` (`ARCHITECTURE.md`, `API.md`, `RELEASE_NOTES.md`, `COMPLETION_REPORT.md`, `ARCHITECTURE_REPORT.md`, `TECHNICAL_DEBT_REPORT.md`, `MIGRATION_PLAN.md`, `PLATFORM_CONSOLIDATION_PLAN.md`).
