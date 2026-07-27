# Enterprise Admin Portal Integration Plan

**Version:** 4.3.0  
**Status:** PROPOSED & READY FOR DESIGN  

---

## 1. Executive Summary

This plan outlines the transformation of the existing Admin Dashboard workspace into a complete, enterprise-ready administration portal. By introducing tabbed sidebar navigation, custom lookup services, and granular database tables queries directly inside `src/app/admin/[brand]/page.tsx`, we will provide unified control over all platform modules:
1. **Dashboard Analytics**: Student enrollment trackers, XP milestone charts, and study averages.
2. **Content Manager**: Dynamic Headless CMS page and sections editor.
3. **Media Manager (DAM)**: Centralized media files library with folder slugs and responsive metadata.
4. **Course Manager**: Curriculum modules, modules positioning, and lessons details.
5. **Blog & News Manager**: Articles creation and publishing status trackers.
6. **Vocabulary & Kanji Manager**: Master spelling lists and kanji readings.
7. **Quiz Manager**: Diagnostic practice tests and answer explanation sheets.
8. **Downloads Manager**: Printable guide sheets and ZIP audio pack uploads.
9. **User Management**: Roles allocations (`learner`, `admin`, `author`) and access permissions.
10. **Site Settings & SEO**: Primary meta tags, analytics keys, and menu quick-links.
11. **System & Audit Logs**: Detailed audit trail listings.
12. **Dark Mode**: Sleek theme controller with server-rendered `theme=dark` toggle support.

---

## 2. Dynamic Database Integrations

Each administrator manager panel will execute queries against the primary PostgreSQL schema:
- **Audit Trails**: Fetch from `audit_logs` table via `CmsService.getAuditLogs()`.
- **Assets Catalog**: Query from `assets` table.
- **LMS Curriculum**: Query from `courses` join `modules` join `lessons`.
- **Lexicon Registry**: Query from `nihongo_learning_items` and `kanji_dictionary`.
- **Exams Catalog**: Query from `nihongo_quizzes`.
- **Resource Sheets**: Query from `downloadable_resources`.
- **Identities**: Query from `users`.

---

## 3. Step-by-Step Execution Plan

### Step 1: Add Custom Admin CSS Variables (If needed)
Ensure Tailwind class mappings support standard `theme=dark` query properties.

### Step 2: Overhaul `src/app/admin/[brand]/page.tsx`
Redesign layout to introduce:
- Dual-column responsive admin view (Sidebar + Workspace Panel).
- Sidebar with beautiful emojis and quick links.
- Search filters on lists (`searchParams.q` text matches).
- Server-rendered dark mode styling (`searchParams.theme === "dark"`).

### Step 3: Integrate Manager Interfaces
Draft tab panels for each admin module, populating tables, metadata lists, and dynamic actions (such as status transitions and section deletions).

### Step 4: Verification Checks
Test types and execute compilation checks to ensure Next.js builds successfully.
