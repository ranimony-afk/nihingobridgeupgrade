# NihongoBridge — Phase 1 Repository Audit

## Audit scope and evidence

- **Repository audited:** `https://github.com/ranimony-afk/Enterprise-NihonGo-Bridge`
- **Branch / revision:** `main` at `366305d8d766e6240424aa9481f7aa1356d16aec`
- **Method:** shallow clone, full tracked-file inventory, static implementation review, dependency audit, and command-level quality validation.
- **Scope note:** the active build workspace is an unversioned Next.js starter and is **not** a checkout of the supplied repository. This report assesses the supplied GitHub revision. No upstream commit can be created from the active workspace because it has no `.git` directory or configured remote.

## Executive assessment

**Status: not production-ready.** The repository contains a broad product scaffold—CMS, DAM, REST endpoints, study surfaces, a large Drizzle schema, documentation, a Flutter-shaped mobile tree, and data directories—but its executable architecture is fragmented across three diverging copies. The checked-in application does not type-check, lint, or build. Critical mutations and admin surfaces have no server-side authorization boundary.

The immediate objective is not feature expansion. It is to establish one canonical application tree, restore build integrity, close the public-write and identity gaps, and make migrations/tests reliable before extending learner functionality.

## Architecture report

### Repository topology

| Area | Observed implementation | Assessment |
| --- | --- | --- |
| Canonical source | `src/` (165 files), `apps/website/src/` (143 files), and `NihongoBridge/apps/website/src/` (a third variant) | **Critical ambiguity.** 143 root/source paths are byte-identical to `apps/website/src`; 19 differences exist between `apps/website` and nested website trees. |
| App framework | Next.js 16 App Router, React 19, TypeScript, Tailwind 4 | Present, but build is blocked and frontend data/state dependencies required by the target architecture are absent. |
| Data access | Drizzle ORM with `pg` and PostgreSQL | Broad schema exists; implementation needs migration reconciliation, index strategy, transaction boundaries, and access control. |
| API | App Router REST under `/api/v1/*`; OpenAPI object endpoint exists | 64 route handlers, 34 mutation-capable; contract and security enforcement are incomplete. |
| Admin/CMS | Admin pages under `/admin`, server actions, CMS/workflow/DAM APIs | Feature breadth is high, but there is no authentication or RBAC gate. |
| Domain packages | `packages/{analytics,auth,database,dictionary,grammar,kanji,lessons,quizzes,search,shared,srs,ui}` | Documentation-only: **0 TypeScript/TSX implementation files**. |
| Services | `services/{ai,etl,media,notifications,scheduler,search-index}` | Documentation-only: **0 TypeScript/Python implementation files**. |
| Mobile | Root `apps/mobile` has only a README; Flutter implementation exists only in the nested duplicate tree | No canonical mobile app, no CI, and no tested API/offline contract. |
| Monorepo tooling | Single root `package.json` and lockfile; no workspace configuration | The physical repository is a monorepo but tooling does not model it as one. |

### Current web architecture

The viable web implementation is structurally closest to a Next.js application, but the repository includes parallel release copies rather than a defined monorepo:

```text
repository root
├── src/                         # duplicate Next application variant
├── apps/website/                # second website variant
├── NihongoBridge/apps/website/  # third website variant
├── apps/admin/                  # no executable package
├── apps/api/                    # no executable package
├── apps/mobile/                 # README only
├── packages/                    # README-only boundaries
├── services/                    # README-only boundaries
├── drizzle/                     # 2 SQL migrations
├── datasets/                    # source directories containing README stubs only
└── tests/                       # mixed utility, mislocated, and Playwright tests
```

### Database and migrations

- The active `apps/website/src/db/schema.ts` defines **47 tables**, **46 foreign-key references**, and only **2 explicit index callbacks**.
- Root `drizzle/` has two SQL migrations: the initial migration creates 47 tables and a later migration adds three tables.
- `apps/website/drizzle/` contains only the initial migration, while its schema has diverged from sibling copies.
- No `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`, or equivalent RLS statements exist in reviewed migrations.
- The database client falls back to a local superuser-style PostgreSQL connection string when `DATABASE_URL` is absent.
- Build-blocking checkout handlers import `coupons` and `transactions`, but the active schema does not export either model.
- Request-time `ensureSeed()` is called by **40 API handlers**. Seeding belongs in explicit environment/bootstrap commands, not request execution.

### API and REST design

Strengths:

- The route namespace is consistently versioned under `/api/v1`.
- A common response envelope (`{ ok, data }` / `{ ok, error }`) exists.
- Coverage includes brands, courses, CMS, DAM, translations, workflows, decks, SRS review, mock exams, conversation, learner data, mobile, and OpenAPI.

Material gaps:

- **84 full-table select patterns** appear across APIs; pagination is not uniformly applied.
- **31 routes** cast `await req.json()` directly to TypeScript types; no route imports Zod despite Zod being declared.
- **34 handlers mutate data**, but only **one** handler extracts a bearer token and only four mention any authentication/session concept.
- Error handlers commonly return `err.message` directly to clients, exposing internal state and database details.
- The OpenAPI object is hand-maintained and partial; it is not generated from validated route schemas and cannot serve as a reliable contract source.
- The in-memory rate limiter does not coordinate across serverless instances, regions, or restarts.

### Authentication, authorization, JWT, and Supabase

- NextAuth/Auth.js is not installed and no executable NextAuth configuration or middleware/proxy exists.
- The `accounts`, `sessions`, and `verificationTokens` tables exist, but are not connected to an authentication runtime.
- `/api/v1/mobile/auth` creates or selects a user for any submitted email and issues a 30-day bearer token. It does not prove ownership of the email, verify a password, validate an external identity provider token, or enforce MFA.
- The mobile JWT helper has a hardcoded development secret fallback, lacks issuer/audience/key rotation/revocation controls, and compares signatures with ordinary string equality rather than a timing-safe primitive.
- Admin pages and CMS/DAM server actions have no identity or role guard; the role displayed in the UI does not enforce permission.
- Supabase SDK packages are absent. The health endpoint marks Supabase as connected from an environment variable and storage uses mock URL/key fallbacks; this is not an authenticated Supabase integration.
- No RLS policy, service-role boundary, CSRF control, CSP, HSTS, clickjacking header, or explicit CORS policy was found.

### CMS, admin dashboard, workflow, and DAM

| Capability | Status | Audit finding |
| --- | --- | --- |
| Brand CMS | Partial | Data models, sections, versions, settings, workflow routes, and admin UI exist. Public write access and missing validation make it unsafe. |
| Admin dashboard | Partial | Large server page and actions exist; no RBAC/auth boundary, no partitioning, and the page is 1,478–1,713 lines across copies. |
| Editorial workflow | Partial | State transitions and comments/tasks/calendar models exist. Tests cover helper transitions only, not permissioned persistence. |
| DAM | Partial | Asset/folder/collection/version/usage endpoints and storage adapter exist. Storage is URL synthesis/mock fallback rather than verified upload, scan, signed-access, or lifecycle processing. |
| Audit logging | Partial | Audit models/routes exist but actor identity is not trustworthy without auth. |

### Japanese learning platform capability matrix

| Area | Status | Audit finding |
| --- | --- | --- |
| Dictionary | Prototype | A dictionary screen/API exists, but no JMdict or JMDictFurigana source data is committed or ingested. |
| Kanji Explorer | Prototype | Screen/API/schema exist; no KANJIDIC2 or KanjiVG dataset is present. |
| Grammar | Divergent | Grammar implementation exists in `src/` and nested tree but is absent from `apps/website`; no canonical route is established. |
| Vocabulary / JLPT | Prototype | UI/schema/seed data exist; no authoritative JLPT corpus pipeline is present. |
| Quiz engine / SRS | Partial | Study pages, deck APIs, SM-2 helper, and models exist; no authenticated learner ownership or robust answer evaluation boundary. |
| Conversation Lab | Prototype | UI and database lesson content exist. No Anthropic/OpenAI client, server AI route, streaming endpoint, moderation, or telemetry exists. |
| Leaderboards | Prototype | Route/page/schema exist; no anti-cheat, season lifecycle, user isolation, or authorization model. |
| Reading/news | Partial | News pages, RSS, and models exist. RSS content is interpolated into CDATA without a safe `]]>` strategy. |
| Japanese datasets | Missing | `datasets/{jmdict,jmnedict,kanjidic2,kanjivg,pitch,tatoeba,unidic,...}` each contain only a short README. No ETL code exists in `services/etl`. |
| AI abstraction | Missing | No OpenAI/Anthropic dependency, provider abstraction, streaming implementation, quota enforcement, or evaluation suite. |

### Localization, SEO, accessibility, and performance

- Brand configuration declares English, Japanese, Tamil, and Malayalam, and the CMS has locale fields. There is no `[locale]` route segment, locale middleware/proxy, `Accept-Language` negotiation, translation loading runtime, `hreflang`, or localized sitemap strategy.
- `robots.ts`, `sitemap.ts`, and an RSS route exist, but sitemap URLs are static and incomplete. Metadata contains hardcoded placeholder analytics, verification, and Clarity identifiers.
- No JSON-LD implementation was found in the primary web tree.
- Only three image tags are present, and lint warns about raw `<img>` usage. Static scan found no `aria-*` attributes in the reviewed primary source tree; automated accessibility checks use mock objects rather than rendered pages.
- Fourteen client components and several oversized screens concentrate client state and render logic. Largest modules include `seed.ts` (1,815 lines), admin page (up to 1,713 lines), Conversation Lab (738 lines), and Mock Exam (588 lines).
- `ensureSeed()` on requests, broad unpaginated reads, missing index strategy, large client components, and unoptimized images are the immediate performance risks.

### Deployment and operations

- Vercel configuration only declares the Next framework and clean URLs.
- Docker Compose uses PostgreSQL credentials directly in configuration and has no service healthcheck, migration gate, runtime secret injection, backup, observability, or least-privilege role.
- CI runs `npm ci`, typecheck, build, and the narrow `npm test` script. It does not run lint, migrations, database integration tests, Playwright, Flutter, dependency review, secret scanning, SBOM generation, or deployment smoke tests.
- `.gitignore` correctly ignores environment files in the remote project. The active non-Git workspace contains a local `.env` with mode `644`; repository bootstrap must ensure environment files remain untracked and owner-readable only.

## Quality-gate evidence

| Command | Result | Interpretation |
| --- | --- | --- |
| `npm ci` | Passed | Installed 399 packages; npm reported 10 vulnerabilities. |
| `npm test` | Passed | 26 utility-style assertions passed. The script only discovers `tests/*.test.ts`: 2 root files, not 7 Node test files or Playwright. |
| `npm run typecheck` | Failed | Missing `@playwright/test`; schema/export drift for `grammarRules`, `coupons`, and `transactions`; duplicate test import paths are broken. |
| `npm run lint` | Failed | Errors across duplicated trees, including impure render/effect logic, invalid hook ordering, unescaped entities, and routing/image rules. |
| `npm run build` | Failed | Checkout routes import missing `coupons` and `transactions` schema exports. |

## Dependency issues

- Audit result after clean install: **10 vulnerabilities** (**6 high**, **4 moderate**), including direct `next@16.2.6`, `postcss@8.5.8`, and `drizzle-kit@0.31.10` chains.
- `next@16.2.6` has an available non-major fix at `16.3.1` for multiple advisories surfaced by npm audit.
- Required runtime/development dependencies are missing: `next-auth`/`@auth/core`, `@supabase/supabase-js`, `@tanstack/react-query`, `framer-motion`, `@playwright/test`, an AI SDK/provider client, and shadcn/Radix dependencies.
- The repository physically behaves like a monorepo but has no workspace manager/configuration. Package ownership, scripts, cache boundaries, and deployment targets are therefore ambiguous.

## Technical debt, code smells, duplicate/unused code

### Critical

1. **Three diverging implementation trees.** Root `src`, `apps/website/src`, and `NihongoBridge/apps/website/src` have unsynchronized routes, schema definitions, tests, migrations, and UI.
2. **Unbuildable source.** Checkout functionality references undeclared data models; nested admin references additional missing grammar/payment models.
3. **Documentation-only boundaries.** All domain packages and services have README files without implementations, producing an illusion of clean architecture without executable ownership.
4. **Tracked release artifacts.** Four ZIP distributions, duplicate lockfiles, duplicate Drizzle snapshots, duplicate source, and tracked `tsconfig.tsbuildinfo` inflate repository size and create source-of-truth ambiguity.

### High

1. **God modules.** Admin, Conversation Lab, Mock Exam, schema, and seed modules exceed maintainable sizes and combine transport, persistence, business rules, and presentation.
2. **Request-time seeding.** Startup/fixture responsibility is embedded inside endpoints, creating latency, race, and production data-integrity risk.
3. **No real API service layer.** Handlers query Drizzle directly and own business rules/response handling, making tests and policy enforcement inconsistent.
4. **Misnamed test scripts.** `test:unit`, `test:integration`, and `test:e2e` execute the same two root files.
5. **Stale/unreachable test topology.** Tests under nested folders use invalid relative imports and are still included by TypeScript.
6. **Root-level `apps/admin` and `apps/api` are not independently executable applications.** Their directory names should not imply deployed service boundaries.

### Medium

1. Hand-written REST/OpenAPI descriptions are not derived from route schemas.
2. Seed content is the only observable Japanese content corpus; authoritative attribution/provenance/refresh is absent.
3. Manual state management is used throughout; TanStack Query is absent despite API-heavy client surfaces.
4. UI primitives are local bespoke components; shadcn/ui architecture is not present.
5. Analytics identifiers are hardcoded in layout source rather than configured with consent-aware environment values.

## Security risks (ordered)

| Priority | Risk | Required remediation |
| --- | --- | --- |
| P0 | Admin, CMS, DAM, workflow, and learner mutations have no enforced identity/RBAC guard. | Introduce Auth.js/NextAuth with a single server-side session service; enforce capabilities in route handlers/server actions; add integration tests for all role boundaries. |
| P0 | Mobile auth issues tokens for arbitrary supplied emails. | Replace with verified OAuth/email OTP/passwordless flow; validate issuer/audience; rotate/expire/revoke sessions; require authentication in every protected mobile endpoint. |
| P0 | JWT default secret fallback and non-distributed rate limiter. | Fail closed outside local development; use a maintained JWT/session library and Redis/Upstash rate limiting. |
| P0 | No RLS, CSRF, security headers, CORS policy, or safe error boundary. | Add Supabase RLS or application-enforced tenant ownership, CSRF/cookie protections, CSP/HSTS/frame/referrer policies, request IDs, structured logging, and generic external errors. |
| P0 | Known dependency vulnerabilities and failed build. | Repair source of truth and upgrade audited packages before deployment. |
| P1 | Unvalidated request bodies and raw error messages. | Use shared Zod schemas, strict limits, sanitization, and typed error mapping. |
| P1 | Storage mock fallback and arbitrary asset URL handling. | Use authenticated Supabase Storage server client, allowlisted buckets/origins, signed URLs, malware scanning, content-type/size validation, and audit actor attribution. |

## Production admission criteria

Do not deploy until all are true:

1. One canonical source tree and one canonical migration history are declared and enforced by workspace tooling.
2. `typecheck`, `lint`, production `build`, unit tests, database integration tests, API authorization tests, browser E2E, and Flutter tests pass in CI.
3. Every mutation route and server action has authentication, capability checks, Zod validation, ownership/tenant scoping, and generic error mapping.
4. Auth.js/NextAuth and Supabase integration are real, configured from validated secrets, and covered by RLS or equivalent access tests.
5. Checkout models/routes, schema, and migrations are reconciled without removing existing paths.
6. Japanese corpus licensing, ingestion, provenance, search indexing, and refresh processes are implemented before content claims are made.
7. Dependency audit has no unaccepted high/critical findings; SBOM and secret scanning run in CI.
8. Accessibility, performance, SEO, privacy consent, observability, backup/restore, and rollback checks have measurable gates.
