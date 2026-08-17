# Phase 1 — Platform Consolidation Plan

**Document Version:** 1.0.0  
**Objective:** Unify Ascend Academy and Nihongo Bridge into a high-performance, enterprise-grade multi-tenant platform.

---

## 1. Consolidation Architecture

Instead of maintaining two fragmented repositories with disjointed hosting, divergent build configurations, and duplicated engineering effort, both brands now operate on a **Single Monolithic Core with Multi-Tenant Domain Routing**:

```
                               ┌───────────────────────────┐
                               │   Enterprise Edge Routing │
                               └─────────────┬─────────────┘
                                             │
                      ┌──────────────────────┴──────────────────────┐
                      ▼                                             ▼
          ┌───────────────────────┐                     ┌───────────────────────┐
          │     Ascend Academy    │                     │     Nihongo Bridge    │
          │       (/ascend)       │                     │       (/nihongo)      │
          └───────────┬───────────┘                     └───────────┬───────────┘
                      │                                             │
                      └──────────────────────┬──────────────────────┘
                                             ▼
                      ┌─────────────────────────────────────────────┐
                      │   Shared REST API Layer (/api/v1/*)         │
                      ├─────────────────────────────────────────────┤
                      │   - Headless CMS (Editorial Workflow)       │
                      │   - Learning Management System (LMS)        │
                      │   - Digital Asset Management (DAM)          │
                      │   - Multilingual Localization Engine (i18n) │
                      └──────────────────────┬──────────────────────┘
                                             ▼
                      ┌─────────────────────────────────────────────┐
                      │   PostgreSQL + Drizzle ORM (app_db)         │
                      └─────────────────────────────────────────────┘
```

---

## 2. Shared Subsystem Matrix

| Subsystem | Shared Backend Module | Omnichannel Consumer Support |
| :--- | :--- | :--- |
| **Multi-Tenancy** | `brands` table & `src/lib/brands.ts` | Web, Android, iOS, Desktop |
| **Editorial CMS** | `pages` table & `editorial_events` | Web Headless Reader, CMS Admin |
| **Curriculum LMS** | `courses`, `modules`, `lessons` | Web LMS Reader, Mobile Offline Sync, AI Tutor |
| **Digital Assets** | `assets` table (DAM) | CDN Media Server, Web, Mobile |
| **Multilingual** | `translations` table | Global i18n localization (EN, JA, ES, FR) |
| **Health Probe** | `/api/health` | Kubernetes / Cloud Container Probes |

---

## 3. Forward Compatibility & Extension Phases

1. **Phase 2 (Learner Identity & AuthN/AuthZ)**:
   - Universal authentication engine with JWT/OAuth2.
   - Learner progress tracking across lessons and modules.
2. **Phase 3 (AI Tutor Integration)**:
   - AI assistant microservice ingesting lesson transcripts and curriculum metadata via `GET /api/v1/courses/:slug`.
3. **Phase 4 (Marketplace & Monetization)**:
   - Shared payment gateways (Stripe) and subscription access control.
4. **Phase 5 (Community & Social Learning)**:
   - Discussion forums, peer code reviews, and Japanese conversation partner matching.
5. **Phase 6 (Native Mobile Applications)**:
   - React Native / Kotlin / Swift clients consuming canonical `/api/v1/*` endpoints.
