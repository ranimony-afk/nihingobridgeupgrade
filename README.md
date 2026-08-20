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
- Search: `/search` · `/admin/search`
- Graph: `/dictionary` `/kanji` `/kanji/explore` `/grammar` `/admin/kg`
- Tutor: `/conversation` · CMS: `/admin/content` · Blog: `/blog`
- Mobile: `apps/mobile` (Flutter)

## Tests

```bash
npm run test              # unit
npm run test:integration  # needs DATABASE_URL
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
- [Phase 6 dictionary](docs/PHASE6_DICTIONARY.md)
- [Phase 7 kanji explorer](docs/PHASE7_KANJI_EXPLORER.md)
- [Phases 8–10](docs/PHASE8_10.md)
- [Phase 11 Flutter](docs/PHASE11_FLUTTER.md)
- [Phase 12 search](docs/PHASE12_SEARCH.md)
- [Phase 13 payments](docs/PHASE13_PAYMENTS.md)
- [Phase 14 analytics](docs/PHASE14_ANALYTICS.md)
- [Phase 15 SEO](docs/PHASE15_SEO.md)
- [Phase 16 performance](docs/PHASE16_PERFORMANCE.md)

## Compatibility

Do not remove `/api/health`, `/api/me`, `/api/game`, or the `/learn` family of routes.
