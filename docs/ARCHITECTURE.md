# Phase 1 — Enterprise Architecture Report

**Document Version:** 1.0.0  
**Target Architecture:** Next.js (App Router), React 19, TypeScript, TailwindCSS, PostgreSQL (`app_db`), Drizzle ORM, REST API v1, Headless CMS, LMS, Digital Asset Management (DAM), Editorial Workflow, Multilingual i18n Platform.

---

## 1. Executive Summary & Repository Topology

The enterprise educational platform ecosystem spans two core brands:

1. **Ascend Academy (`ascend`)**: Professional & engineering career advancement, technical curriculum, leadership tracks, and corporate learning certifications.
2. **Nihongo Bridge (`nihongo`)**: Japanese language education (JLPT N5-N3), study-in-Japan advisory, cross-cultural etiquette, and Japanese career placement.

### Historical State (Siloed Repositories)
| Dimension | Ascend Academy Website | Nihongo Bridge | Unified Target State |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router / Pages) | Next.js 13.5.1 App Router | Next.js 16 (App Router + React Server Components) |
| **Database** | Standalone SQL / mock scripts | Supabase JS client SDK | PostgreSQL + Drizzle ORM (`src/db/schema.ts`) |
| **Multi-Tenancy** | Single-tenant | Single-tenant | Multi-tenant tenant scoping via `brand_id` & `brands` |
| **LMS Structure** | Custom course schemas | Static data objects in `lib/data.ts` | Unified `courses` → `modules` → `lessons` hierarchy |
| **CMS & Editorial** | Static content / React components | Static data objects in `lib/blog-content.tsx` | Headless CMS `pages` with `draft/in_review/published/archived` + `editorial_events` |
| **Media & DAM** | Static images in `/public` | Unmanaged asset links | Unified `assets` DAM table with metadata & MIME classification |
| **i18n & Locales** | Hardcoded English | Mixed EN/JA hardcoded strings | `translations` join table + locale-scoped queries |
| **API Contract** | Ad-hoc routes | None / client-side queries | Canonical REST API v1 under `/api/v1/*` |

---

## 2. Granular Architectural Breakdown

### 2.1 Shared Components & UI Subsystems
- **Design Tokens**: Standard color ramps, typography scales, spacing units, and responsive breakpoints using TailwindCSS utility classes.
- **Atomic UI Primitives**: Buttons, badges, cards, accordions, dialogs, dropdown menus, tabs, and toast notifications.
- **Layout Shells**: Responsive navigation bars, brand selectors, footer structures, mobile menus, and course outlines.
- **Course Readers**: Lesson layout components with module accordions, progress indicators, and structured reading panes.

### 2.2 Shared Database Schema (`src/db/schema.ts`)
Both brands are unified under a single relational schema:
- `brands`: Multi-brand tenant metadata, slug identifiers, brand names, color palettes, and default locales.
- `users`: Universal identity table with Role-Based Access Control (`learner`, `author`, `editor`, `admin`).
- `assets`: Digital Asset Management store indexing media URLs, MIME types, file sizes, and asset metadata.
- `pages`: Headless CMS content nodes with editorial workflow lifecycle flags (`draft`, `in_review`, `published`, `archived`).
- `courses`, `modules`, `lessons`: Unified 3-tier LMS schema powering curriculum delivery across web and mobile.
- `translations`: Key-value locale overlay table enabling multilingual translation across all entities.
- `editorial_events`: Immutable audit logging table tracking editorial transitions with actor ID and change notes.

### 2.3 Shared Services & APIs (`/api/v1/*`)
- **Brand Service**: `GET /api/v1/brands`, `GET /api/v1/brands/:slug`
- **LMS Service**: `GET /api/v1/courses`, `GET /api/v1/courses/:slug`
- **CMS Service**: `GET /api/v1/pages`, `POST /api/v1/pages`, `POST /api/v1/pages/:id/transition`
- **DAM Service**: `GET /api/v1/assets`, `POST /api/v1/assets`
- **i18n Service**: `GET /api/v1/translations`, `POST /api/v1/translations`
- **Health / Readiness**: `GET /api/health`

---

## 3. Omnichannel Scalability Matrix

The unified backend is transport-agnostic and serves:
1. **Web**: Next.js App Router server components and client interactive shells.
2. **Android & iOS**: Native mobile apps consuming JSON over `/api/v1/*` with offline lesson caching.
3. **Desktop**: Electron / Tauri / Progressive Web App client consuming REST endpoints.
4. **Future AI Tutor**: Retrieval-Augmented Generation (RAG) and conversational agents querying structured lesson endpoints at `/api/v1/courses/:slug`.
5. **Marketplace & Community**: Pluggable extension points ready for paid course commerce and discussion forums.
