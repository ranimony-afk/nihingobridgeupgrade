# Nihongo Bridge

Playable Japanese LMS (Duolingo-style path, hearts, XP, stories) on Next.js, Drizzle, and PostgreSQL.

Phase 1 added the audit CMS. Phase 2 adds production infrastructure (Auth.js, Drizzle pool, optional Redis/Supabase, rate limits, logs, backups, Docker, GitHub Actions) without rewriting the lesson loop.

## Quick start

```bash
npm install
npx drizzle-kit push
npm run dev
```

- Learn: `/` → Start free → `/learn`
- Audit report: `/audit`
- Admin CMS: `/admin/login` (`sensei@nihongobridge.local` / `bridge-audit`)
- Infra desk: `/admin/infra`
- Auth: `/login` `/register` `/account`
- Billing: `/billing` `/premium` `/admin/billing`
- Graph: `/dictionary` `/kanji` `/grammar` `/admin/kg`

## Tests

```bash
node --experimental-strip-types --test tests/unit/*.test.ts
npx tsx --test tests/integration/*.test.ts tests/smoke/*.test.ts
```

## Docs

- [Phase 1 audit](docs/PHASE1_REPOSITORY_AUDIT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [API](docs/API.md)
- [CMS guide](docs/CMS_ADMIN_GUIDE.md)
- [Security](docs/SECURITY.md)
- [Phase 2 infrastructure](docs/PHASE2_INFRASTRUCTURE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Operations](docs/OPERATIONS.md)
- [Environment](docs/ENVIRONMENT.md)
- [Phase 3 authentication](docs/PHASE3_AUTHENTICATION.md)
- [Flutter auth](docs/FLUTTER_AUTH.md)
- [Phase 4 payments](docs/PHASE4_PAYMENTS.md)
- [Phase 5 knowledge graph](docs/PHASE5_KNOWLEDGE_GRAPH.md)

## Compatibility

Do not remove `/api/health`, `/api/me`, `/api/game`, or the `/learn` family of routes.
