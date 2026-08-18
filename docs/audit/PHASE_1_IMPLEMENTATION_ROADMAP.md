# NihongoBridge — Prioritized Implementation Roadmap

This roadmap follows the Phase 1 audit and deliberately extends existing routes and models. No existing public route should be removed. Where a route is incomplete, retain its path and response envelope while moving its implementation behind validated services.

## Guiding delivery rules

1. **Canonicalize before expanding.** New features are prohibited until source-tree, schema, and quality-gate drift are contained.
2. **Extend, do not replace.** Preserve `/api/v1/*`, existing page URLs, response envelopes, and Drizzle table names. Introduce versioned fields and additive migrations.
3. **Every delivery slice includes:** Drizzle migration and rollback notes, REST contract and Zod schema, web UI, protected admin capability where content is managed, docs, unit tests, database integration tests, and E2E coverage where user-visible.
4. **No mock production dependencies.** Missing Supabase, AI, auth, storage, and dataset integrations must fail safely outside local development.
5. **Commit policy.** Make one conventional commit per completed phase. The current active workspace has no Git repository; initialize or bind the actual repository checkout before implementation so this policy is enforceable.

## P0 — Establish a buildable, single-source platform

**Target:** first 3–5 engineering days

### Outcomes

- Declare `apps/website` as the canonical web app, or formally select another single tree through an architecture decision record (ADR-001).
- Preserve legacy copies in a temporary archive branch/tag while removing them from TypeScript/build inclusion after parity is verified. Do not silently delete divergent sources.
- Introduce an npm workspace layout for `apps/*` and `packages/*`; define package ownership and independent scripts.
- Reconcile `src`, `apps/website/src`, and `NihongoBridge/apps/website/src` into one source tree.
- Repair checkout schema drift by adding additive `coupons` and `transactions` models/migrations, or redirect existing checkout routes to an explicitly retained compatible service. Do not remove checkout paths.
- Reconcile Drizzle journals/snapshots so one migration history matches the selected schema.
- Remove request-time seeding from runtime handlers. Keep `db:seed` as an explicit idempotent command for local/dev fixtures only.
- Upgrade the audited Next.js/PostCSS dependency chain to patched versions and resolve all remaining high/critical advisories.
- Add the missing Playwright dependency or remove stale configuration only after browser tests have moved to the canonical package.

### Required deliverables

| Layer | Deliverable |
| --- | --- |
| Database | Reconciled baseline migration, additive checkout migration, verified `drizzle-kit check`/migration journal, seed migration notes. |
| API | Existing routes compile with unchanged paths/envelopes; shared error mapper introduced without changing public error codes. |
| Frontend | No user-facing redesign required; routes render from the canonical app only. |
| Admin CMS | Existing admin URLs resolve from canonical app; regression map captures all admin actions. |
| Tests | Typecheck, lint, production build, route smoke tests, migration-up test, and migration-from-empty-database test. |
| Documentation | ADR-001 source-of-truth decision, contributor setup, migration policy, and route compatibility matrix. |

### Exit criteria

- `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, unit tests, and database integration tests pass.
- CI fails on duplicate/canonical-tree violations.
- No test file outside the configured test roots is unintentionally type-checked.
- `npm audit` has no unaccepted high or critical findings.

---

## P1 — Identity, tenancy, authorization, and security baseline

**Target:** 1–2 weeks after P0

### Outcomes

- Add Auth.js/NextAuth using the existing account/session/verification tables where compatible; use a managed verified identity flow rather than email-only token issuance.
- Add Supabase client boundaries: server client, browser client only where safe, storage service adapter, and explicit environment validation.
- Create a centralized `requireSession`, `requireRole`, and capability policy service. Apply it to every mutation, admin page, server action, and mobile protected endpoint.
- Preserve mobile endpoint paths; replace arbitrary-email token issuance with verified bearer session exchange/refresh flow.
- Define roles (`learner`, `editor`, `reviewer`, `admin`, `owner`) and capability mappings in a dedicated module.
- Add Supabase RLS policies where Supabase is the data plane, or consistently enforce organization/user scoping in PostgreSQL service repositories. Document the chosen boundary.
- Introduce Zod request/response schemas, request-size limits, typed error mapping, correlation IDs, and structured server logs.
- Add security headers, CSRF controls for cookie-authenticated mutations, trusted-origin CORS policy, rate limiting backed by Redis/Upstash, and safe secret validation at boot.

### Required deliverables

| Layer | Deliverable |
| --- | --- |
| Database | Additive roles/capabilities/organization membership and token/session metadata migrations; RLS policies plus policy tests where applicable. |
| API | Authenticated compatibility middleware/service wrapper for every existing mutation; validated schemas for existing request bodies. |
| Frontend | Session provider, protected routes, login/logout, unauthorized/forbidden states, and accessible recovery UX. |
| Admin CMS | Capability-based navigation and action gating, including audit actor IDs. |
| Mobile | Verified login/refresh/revocation contract with Dio interceptors and secure token storage design. |
| Tests | Authentication matrix, role/capability integration tests for every mutating route, RLS ownership tests, CSRF/CORS/rate-limit tests. |
| Documentation | Threat model, RBAC matrix, mobile auth contract, secret rotation runbook, privacy and retention policy. |

### Exit criteria

- No mutation is callable without an authenticated identity unless documented as public and read-only.
- All admin access is denied by default.
- No development secret/mock service fallback is reachable in production.

---

## P2 — Clean architecture, reliable REST contracts, and data access

**Target:** 2 weeks after P1

### Outcomes

- Move business rules out of route handlers into feature modules: `domain`, `application`, `infrastructure`, and `presentation` boundaries.
- Retain App Router route handlers as thin REST adapters.
- Introduce repositories for learners, content, assets, learning progress, workflow, and payments with transaction support.
- Split the 948-line schema into bounded schema files with a single barrel export; preserve exported table names.
- Add pagination/cursor contracts, filters, explicit field selection, deterministic sorting, cache tags, and invalidation policy for all list endpoints.
- Generate OpenAPI from shared Zod contracts and serve the existing OpenAPI route from the generated artifact.
- Add a TanStack Query client layer with stable query keys and optimistic mutation rules; preserve current fetch behavior during migration.

### Required deliverables

| Layer | Deliverable |
| --- | --- |
| Database | Add indexes based on real query plans; migration per index with rollback guidance. |
| API | Shared Zod contracts, OpenAPI generation, cursor pagination, typed repositories/services, preserved `/api/v1` routes. |
| Frontend | TanStack Query provider, hooks, cache policy, error/loading states, and route-level boundaries. |
| Admin CMS | Consistent list filtering/pagination and optimistic audit-safe mutations. |
| Tests | Contract tests, repository integration tests on PostgreSQL, pagination/cache tests, OpenAPI snapshot tests. |
| Documentation | ADRs for module boundaries, API style guide, caching/invalidation guide, compatibility policy. |

### Exit criteria

- No route directly owns complex business logic or unchecked JSON casting.
- All list endpoints are bounded and documented.
- Generated OpenAPI matches tested runtime contracts.

---

## P3 — CMS, DAM, localization, and SEO foundation

**Target:** 2–3 weeks after P2

### Outcomes

- Harden the existing CMS/workflow/DAM rather than replacing it.
- Implement verified Supabase Storage upload flow: signed upload intent, content-type/size checks, checksum, malware scan webhook, responsive derivative queue, lifecycle status, and signed delivery URLs.
- Add locale routing/negotiation (`[locale]` or an explicitly documented alternative), translation fallback rules, `hreflang`, localized sitemap entries, and locale-aware CMS publishing.
- Replace placeholder analytics/verification values with environment-configured, consent-aware providers.
- Add structured metadata and JSON-LD for courses, articles, organization, breadcrumbs, and learning resources.
- Break down the large admin page into capability-scoped components while preserving all admin URLs.

### Required deliverables

| Layer | Deliverable |
| --- | --- |
| Database | Asset processing, scan, provenance, locale fallback, and SEO metadata migrations. |
| API | Authenticated asset upload lifecycle and localized CMS endpoints with unchanged legacy reads. |
| Frontend | Accessible admin forms, upload progress, localized content rendering, consent-aware analytics. |
| Admin CMS | Role-aware workflow, asset review, publication scheduling, audit actor/tenant display. |
| Tests | Upload security, signed URL, translation fallback, locale route, sitemap, JSON-LD, and workflow permission tests. |
| Documentation | DAM operation guide, localization guide, SEO metadata catalog, editorial workflow runbook. |

### Exit criteria

- Content editors cannot bypass review/publish permissions.
- Localized content has deterministic fallback and SEO tags.
- No asset is published before validation/scan policy succeeds.

---

## P4 — Japanese data platform and study engines

**Target:** 3–5 weeks after P3

### Outcomes

- Ingest licensed sources through versioned, idempotent pipelines: JMdict, JMdictFurigana, KANJIDIC2, JMnedict, Tatoeba, UniDic/Sudachi-compatible morphology data, Pitch Accent source, KanjiVG, JLPT vocabulary, and grammar source data.
- Store source license, upstream revision, imported-at timestamp, normalization version, provenance, and deletion/refresh policy for each record.
- Build dictionary, kanji, grammar, vocabulary, and sentence search services on canonical data; maintain the existing public pages/APIs as adapters.
- Implement an auditable grammar knowledge base and conjugation engine as domain services, not page-local logic.
- Add search indexing with Japanese tokenization and explicit relevance/filter policies.
- Make learner data user-owned: SRS cards, decks, attempts, progress, bookmarks, and leaderboards scoped by authenticated identity and organization.

### Required deliverables

| Layer | Deliverable |
| --- | --- |
| Database | Source/provenance tables, normalized lexical/kanji/grammar/sentence schema, import runs, search indexes, user-scoped progress migrations. |
| API | Dictionary/kanji/grammar/search endpoints with cursors, filters, provenance fields, and stable legacy adapters. |
| Frontend | Production dictionary, Kanji Explorer, grammar explorer, vocabulary browse, and citation/provenance views. |
| Admin CMS | Data-import run dashboard, source-license registry, content review/override tools. |
| Tests | Parser fixtures, import idempotency, normalization, search relevance, licensing/provenance, SRS ownership, and API integration tests. |
| Documentation | Dataset licenses, importer runbook, schema dictionary, freshness SLA, content correction policy. |

### Exit criteria

- No feature claims corpus support without an executed, versioned ingestion run.
- Every dictionary/kanji/grammar record is traceable to its source and version.

---

## P5 — Learning experience, assessments, gamification, and AI tutoring

**Target:** 3–4 weeks after P4

### Outcomes

- Stabilize quiz, mock exam, flashcard, listening, writing, conversation, and leaderboard features around authenticated learner attempts and scoring rules.
- Move client-side grading/state into server-authoritative attempt services while retaining offline-friendly UX.
- Add achievement/leaderboard anti-abuse checks, seasons, eligibility, and moderation controls.
- Introduce an `AiTutorProvider` abstraction with OpenAI and Anthropic adapters. Provider keys remain server-only.
- Implement authenticated streaming endpoints using a defined protocol (SSE or fetch stream), conversation persistence, cancellation, quotas, safety policy, evaluation fixtures, and observability.
- Use Framer Motion only for purposeful accessible microinteractions; respect reduced-motion preferences.

### Required deliverables

| Layer | Deliverable |
| --- | --- |
| Database | Attempts, answer events, score versions, AI conversations/messages/usage, leaderboard seasons, anti-abuse events, and quotas migrations. |
| API | Idempotent attempt submission, server scoring, AI streaming/cancellation, usage limits, and preserved existing quiz/conversation paths. |
| Frontend | TanStack Query study flows, resilient submission/retry UX, accessible exam timer, streamed tutor UI, reduced-motion controls. |
| Admin CMS | Assessment authoring/review, answer-key versioning, AI prompt/version management, leaderboard moderation. |
| Tests | Scoring determinism, idempotency, timer edge cases, streaming integration, provider mock contracts, quota/safety/abuse tests, browser E2E. |
| Documentation | Assessment specification, AI safety policy, prompt release process, provider fallback/runbook, learner data retention policy. |

### Exit criteria

- Scores and XP cannot be forged from the client.
- AI interactions are authenticated, rate-limited, observable, and safely degradable.

---

## P6 — Canonical Flutter mobile application and offline sync

**Target:** 3–4 weeks after P2; can run in parallel with P4/P5 after API contracts stabilize

### Outcomes

- Promote one Flutter tree to `apps/mobile`; remove duplicate ambiguity only after migration parity is verified.
- Use Riverpod feature providers, Dio client/interceptors, secure token handling, and SQLite cache with migrations.
- Implement a durable outbox/sync model for reviews, progress, attempts, and downloads with idempotency keys and conflict resolution.
- Generate mobile client contracts from the shared OpenAPI/Zod schema where practical.
- Add Android/iOS build, analyzer, widget, and integration tests to CI.

### Required deliverables

| Layer | Deliverable |
| --- | --- |
| Database | Device/sync cursor/idempotency and conflict-audit migrations. |
| API | Sync pull/push contract, device registration, JWT refresh, offline download manifests. |
| Mobile | Flutter app, Riverpod modules, Dio client, SQLite migrations/outbox, accessibility and localization. |
| Admin CMS | Device/session support and downloadable package administration. |
| Tests | Dart unit/widget/integration tests, sync conflict tests, API contract tests, real-device smoke matrix. |
| Documentation | Offline architecture, sync conflict policy, mobile release/runbook, API version compatibility. |

### Exit criteria

- Offline events cannot duplicate XP/reviews after reconnect.
- Mobile authentication and cache migration pass on supported platform matrix.

---

## P7 — Reliability, accessibility, performance, and delivery operations

**Target:** continuous from P0; formal release hardening after P6

### Outcomes

- Add OpenTelemetry/error monitoring, structured logs, tracing, dashboards, alerts, SLOs, backups, restore drills, and incident runbooks.
- Add CI jobs for lint, typecheck, unit, PostgreSQL integration, route authorization, Playwright, Flutter, migrations, dependency audit, secret scanning, SBOM, and accessibility.
- Add performance budgets for LCP/INP/CLS, API latency, database query plans, and bundle size.
- Resolve linted React purity/effect issues; split oversized components and apply Next Image/Font/cache primitives.
- Run automated accessibility tests plus manual keyboard/screen-reader checks for study, exam, conversation, dictionary, and admin critical flows.
- Replace static sitemap behavior with data-backed, localized generation and validate robots/RSS/XML encoding.

### Exit criteria

- Release pipeline proves build, security, data migration, accessibility, and mobile/web regression health before deployment.
- Production rollback, restore, and incident ownership are documented and exercised.

## First implementation sequence

1. Record ADR-001 naming the canonical app tree and set up a real Git checkout/workspace.
2. Reconcile source/migrations and repair missing checkout schema exports until lint/typecheck/build are green.
3. Patch audited dependencies and make CI enforce all required gates.
4. Implement Auth.js + RBAC + validated API wrappers before touching CMS, DAM, or learner features.
5. Introduce shared contracts/repositories/TanStack Query.
6. Build the corpus ingestion platform before presenting dictionary/kanji/grammar data as authoritative.
7. Add AI, streaming, and mobile only against authenticated, versioned, tested contracts.
