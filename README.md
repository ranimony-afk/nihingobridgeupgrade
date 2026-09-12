# NihongoBridge

Production monorepo for the NihongoBridge Japanese-learning platform.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Drizzle ORM · PostgreSQL · Tailwind CSS v4

This repository is **canonical**. `Knowledge-base-NihongoBridge` is a read-only
source repository; its code is adapted, never copied
(`docs/architecture/INTEGRATION_BOUNDARIES.md`).

---

## Quick start

```bash
npm install
cp .env.example .env      # set DATABASE_URL
npm run db:push           # apply the Drizzle schema
npm run dev
```

The platform runs with **only** `DATABASE_URL` configured. AI provider keys are
optional; without them the AI layer uses a deterministic mock provider.

---

## Layout

```
src/
├── app/            routes and API handlers (validate → authorize → serialize)
├── components/     presentational React components
├── services/       business rules, one owner per domain
├── repositories/   Drizzle data access, one owner per table group
├── db/             client + canonical schema
├── lib/            framework-agnostic utilities
├── config/         environment and frozen constants
└── types/          shared contracts
etl/                ingestion pipelines (offline, never serves HTTP)
tests/              node:test suites
scripts/            operational scripts
docs/               architecture and phase documentation
reports/            audits, matrices, phase gates
```

Layer rule: route handlers call services, services call repositories,
repositories touch the database. No layer skips downward, and no domain reads
another domain's tables.

---

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Unit tests (`node:test`, no extra dependencies) |
| `npm run check:structure` | Assert the frozen directory layout |
| `npm run verify` | structure → lint → typecheck → test → build |
| `npm run db:push` | Apply schema with drizzle-kit |

---

## Architecture

Frozen decisions live in `docs/architecture/`:

| Document | Scope |
|---|---|
| `ARCHITECTURE_FREEZE.md` | The eleven canonical decisions |
| `DOMAIN_OWNERSHIP.md` | Which module owns which capability |
| `DATABASE_OWNERSHIP.md` | Table ownership, conventions, migration policy |
| `API_OWNERSHIP.md` | Namespaces, envelope, authorization matrix |
| `INTEGRATION_BOUNDARIES.md` | How Repository B material may cross over |

Audits and integration matrices are in `reports/`.

### Invariants

1. One repository, one schema, one identity, one API surface, one SRS, one search engine.
2. `GET /api/health` returns `{ "ok": true }` — a frozen contract.
3. No destructive DDL without an authorising decision entry.
4. Business logic is never duplicated between web and mobile clients.
5. Imported data always carries source, version, and licence provenance.

---

## Conventions

- **Primary keys** are application-generated `text`. Imported rows use a
  deterministic id derived from `(source, sourceId)` so re-imports are idempotent.
- **JLPT levels** are stored as `smallint` where the number is the N-level:
  `5` = N5 … `1` = N1. `"N5"` strings appear only in display layers.
- **API responses** use `{ success, data, meta }` / `{ success, error }`.
- **Secrets** come from the environment. `.env` is never committed.
