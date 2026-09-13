# Deployment — Vercel + hosted PostgreSQL

This document is the deployment runbook for Repository A (`nihingobridgeupgrade`).
It also explains the exact build failure reported on 2026-09-13 and how it is
fixed in code.

---

## 1. The reported failure

```
Type error: Cannot find module '../data/kangxi-radicals' or its corresponding type declarations.

  29 |   KANGXI_RADICALS,
  30 |   RADICAL_CHARACTER_TO_NUMBER,
> 31 | } from "../data/kangxi-radicals";
  32 | import { finishImportRun, startImportRun } from "../provenance/import-run";

Next.js build worker exited with code: 1
Error: Command "npm run build" exited with 1
```

**Root cause.** `tsconfig.json` has `"include": ["**/*.ts", ...]`, and `next build`
runs TypeScript over everything that matches. The ETL importer under `etl/`
imported two modules that were never committed:

| Missing module | Status |
| --- | --- |
| `etl/data/kangxi-radicals.ts` (`KANGXI_RADICALS`, `RADICAL_CHARACTER_TO_NUMBER`) | **added** — full 214-radical table |
| `etl/provenance/import-run.ts` (`startImportRun`, `finishImportRun`) | **added** — `etl_runs` bookkeeping |

Vercel never *runs* that importer, it only type-checks it — which is why a
missing ETL module can break a web deployment.

**Hardening applied so this class of failure cannot recur:**

1. Both modules exist and are self-contained (see `etl/data/kangxi-radicals.ts`,
   `etl/provenance/import-run.ts`).
2. `tsconfig.json` now excludes `etl/`, `tests/`, `scripts/`, `reports/` and
   `docs/` from the **web** type-check, so a broken ETL script can no longer
   fail `next build` on Vercel.
3. ETL/tooling code is type-checked separately and deliberately:
   ```bash
   npm exec tsc -p tsconfig.etl.json --noEmit
   ```
4. `src/db/index.ts` no longer throws at import time when `DATABASE_URL` is
   missing. The pool is created lazily, so `next build` succeeds even when the
   build container has no database credentials.
5. `next.config.ts` sets `serverExternalPackages: ["pg"]` so the native
   Postgres driver is not inlined into the serverless bundle.
6. `src/db/index.ts` and `etl/loaders/postgres.mjs` enable TLS automatically for
   hosted databases (`sslmode=require` / non-localhost hosts).

---

## 2. Prerequisites

* Vercel project connected to the GitHub repo `ranimony-afk/nihingobridgeupgrade`
* A hosted PostgreSQL database (Supabase, Neon or RDS). Supabase/Neon free tiers
  are fine for the current dataset (~13k kanji, ~25k vocabulary rows).
* `curl` available if you intend to run the ETL from your machine (the EDRDG
  mirrors used are `https://` and `ftp://`).

---

## 3. Provision the database

```bash
# 1. create the database (Supabase: Project → Settings → Database → connection string / pooler)
# 2. export the connection string and push the Drizzle schema (additive only)
export DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require"
npx drizzle-kit push --config drizzle.config.json
```

`drizzle-kit push` only creates/alters tables — the project never emits
`DROP TABLE`, `DROP COLUMN` or `TRUNCATE`.

## 4. Load the knowledge data

Run from your machine (or a CI job) against the **production** database:

```bash
export DATABASE_URL="postgresql://…?sslmode=require"
node etl/run-pipeline.mjs                       # kanji + structure + vocabulary
node tests/knowledge-gate.mjs                   # DB-level gate (no server needed)
```

Cached upstream files live in `etl/data/`; the pipeline is offline-safe once they
are present. Import runs are recorded in `etl_runs` and shown at `/admin`.

## 5. Vercel project settings

| Setting | Value |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | `./` |
| Build Command | `npm run build` (default) |
| Install Command | `npm install` (default) |
| Node.js Version | 20.x or 22.x |

Environment variables (Production + Preview):

| Key | Value |
| --- | --- |
| `DATABASE_URL` | `postgresql://…?sslmode=require` (use the **pooler** host on Supabase) |
| `DATABASE_POOL_MAX` | `5` (serverless-friendly pool size) |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` (optional) |

Do **not** commit `.env` / `.env.local`; `.env.example` documents the keys.

## 6. Deploy

```bash
# via CLI
npm i -g vercel
vercel pull --environment=production     # creates .vercel/.env.production
vercel build                             # runs next build locally with prod env
vercel deploy --prebuilt                 # ships the build

# or simply push to the production branch — Vercel builds automatically
git push origin main
```

## 7. Post-deploy verification

```bash
export BASE=https://<your-domain>
curl -s $BASE/api/health                       # {"status":"ok","database":"up",…}
curl -s "$BASE/api/kanji/search?q=%E8%AA%9E"   # 語
curl -s "$BASE/api/kanji/%E8%AA%9E/mind-tree?depth=3" | head -c 400
node tests/knowledge-gate.mjs $BASE            # full E2E gate over HTTP

# grammar API (phase 07.2)
curl -s "$BASE/api/grammar?jlpt=4&limit=5" | head -c 300
curl -s "$BASE/api/grammar/te-shimau" | head -c 300
curl -s "$BASE/api/grammar/openapi" | head -c 200
node tests/grammar-gate.mjs $BASE
node tests/grammar-api-gate.mjs $BASE
```

If `knowledge.provisioned` is `false`, run the provisioning step (§3–4) before
verifying — the API degrades to empty collections instead of failing.

Gate (must pass end-to-end): **search kanji → open kanji → inspect radical →
inspect components → inspect vocabulary**.

## 8. Empty-database behaviour

If `DATABASE_URL` points at a database without the knowledge tables, every page
still renders (empty states) and `/api/health` reports `database up` with zero
counters — it never throws during build. Run `npx drizzle-kit push` +
`node etl/run-pipeline.mjs` to populate it.

## 9. Continuous verification

```bash
npx next typegen
npm exec tsc -- --noEmit --pretty false        # web app
npm exec tsc -p tsconfig.etl.json --noEmit     # ETL + tooling
npm run lint
npm run build
node tests/knowledge-gate.mjs http://127.0.0.1:3000
```
