# Phase 13.3A — Provider Boundary Audit

**Project:** NihongoBridge
**Canonical production repository:** `ranimony-afk/nihingobridgeupgrade`
**Canonical branch inspected:** `main`
**Canonical commit inspected:** `5c1cb62` (`13.2`, pushed 2026-09-14)
**Audit status:** COMPLETE — provider implementation intentionally deferred
**Audit scope:** Provider boundary only; no provider code, route behavior, database schema, authentication, or knowledge retrieval changes

## 1. Executive finding

The supplied workspace initially was **not** the Phase 13.2 canonical production checkout. It was a small Next.js/PostgreSQL starter scaffold with a placeholder Drizzle schema. The canonical GitHub repository contains the Phase 13.2 knowledge-retrieval implementation described by the continuation prompt.

The referenced archive `nihongobridge-production-integration-builda13.2.zip` was not present in the supplied workspace, `/tmp`, `/workspace`, or `/root`, so an archive-to-checkout comparison could not be performed. The canonical GitHub repository was cloned to a temporary location and compared with the supplied workspace before any sync. Canonical `main` was newer and was then synced into the workspace; the local `.env` and this audit report were preserved. No archive or unrelated repository was copied into the application.

The canonical Phase 13.2 repository has **no implemented AI provider** and no duplicate provider abstraction in production source. Its existing AI-related route is deterministic knowledge retrieval only. The first adapter for Phase 13.3 should be **Anthropic**, selected through an explicit server-side `AI_PROVIDER` setting, with mock behavior limited to tests/development. The browser must remain unaware of provider SDKs, provider URLs, and provider credentials.

## 2. Evidence inspected

### Supplied workspace

Inspected:

- `src/services/ai/` — absent
- `src/services/knowledge/` — absent
- `src/app/api/ai/` — absent
- `src/db/index.ts` — present; Drizzle/PostgreSQL connection
- `src/db/schema.ts` — present, but placeholder only (`export {}`)
- `src/types/` — absent
- `package.json` — starter dependency set; no AI SDK
- `.env.example` — absent; only local `.env` exists with `DATABASE_URL`
- `reports/ai/` — absent before this report
- `reports/gates/` — absent
- archive search locations — archive not found

### Canonical repository

Inspected at commit `5c1cb62`:

- `src/services/ai/knowledgeRetriever.ts`
- `src/services/knowledge/corpusService.ts`
- `src/services/knowledge/knowledgeService.ts`
- `src/app/api/ai/retrieve/route.ts`
- `src/db/schema.ts`
- `src/db/index.ts`
- `src/types/`
- `tests/knowledge-retrieval.test.ts`
- `package.json`
- `.env.example`
- `reports/ai/PHASE-13.1-AI-ARCHITECTURE-AUDIT.md`
- `reports/ai/PHASE-13.2-KNOWLEDGE-RETRIEVAL.md`
- `reports/gates/PHASE-13-CHECKLIST.md`

### Repository comparison

The supplied workspace differs materially from canonical `main`:

| Area | Supplied workspace | Canonical `main` |
|---|---|---|
| AI retrieval | Missing | `KnowledgeRetriever` plus `/api/ai/retrieve` |
| Knowledge services | Missing | Corpus and knowledge services present |
| Database schema | Placeholder | Canonical dictionary, kanji, grammar, sentence, and platform tables |
| AI/types directories | Missing | AI retrieval is typed within the service; domain types exist under `src/types/` |
| Reports/gates | Missing before this audit | Phase 13.1, Phase 13.2, and Phase 13 gate documents present |
| Tests | Missing from supplied workspace | Knowledge retrieval test present |
| Provider dependencies | None | None |
| `server-only` | Not installed | Not installed |
| Canonical environment template | Missing | `.env.example` with `AI_PROVIDER`, prompt, timeout, and Anthropic placeholders |

The initial workspace could not be treated as a verified Phase 13.2 implementation. After the comparison, canonical `main` at `5c1cb62` was synced into the workspace, so the current application source now matches the inspected canonical Phase 13.2 repository. The referenced archive remains unavailable.

## 3. Provider scan results

The requested terms were searched in the supplied workspace and canonical checkout:

`anthropic`, `openai`, `AIProvider`, `LLMProvider`, `getProvider`, `generateText`, `generateStructured`, `streamText`, `streamTutorCompletion`, `AI_PROVIDER`, `ANTHROPIC_API_KEY`

| Question | Finding |
|---|---|
| Does a provider already exist? | **No implemented provider exists in canonical production source.** `anthropic` and `ANTHROPIC_API_KEY` occur only in `.env.example` and architecture documentation. The retrieval service explicitly does not call an AI provider. |
| Does a duplicate provider abstraction exist? | **No duplicate production abstraction exists in the canonical checkout.** Historical references to `LLMProvider`/`getProvider()` describe the rejected Arena-test prototype, not code in this repository. Repository B's direct Anthropic functions are also historical source material, not mounted here. |
| Does any route directly import a provider? | **No.** `src/app/api/ai/retrieve/route.ts` imports `KnowledgeRetriever`, `KnowledgeCorpusService`, and `KnowledgeService` only. It is a deterministic retrieval endpoint and must remain provider-free. No canonical route imports Anthropic/OpenAI code or provider SDKs. |
| Does any client component import AI/server code? | **No provider or AI imports were found in client-marked components.** No client component imports a provider, database module, or AI service. Existing database imports are in server-rendered page code, not client components. |
| Is `server-only` installed? | **No.** It is absent from the canonical and supplied workspace dependency sets and installed package tree. |
| Is an AI SDK installed? | **No.** `ai`, `@ai-sdk/anthropic`, `@anthropic-ai/sdk`, and `openai` are absent. The canonical package includes `vitest` for tests; the supplied starter package does not. |
| Which provider should be first? | **Anthropic**, as selected by the Phase 13.1 architecture audit and canonical `.env.example`. The adapter must be provider-specific and server-only. |
| How must selection work? | Use one explicit `AI_PROVIDER` selection/factory. `anthropic` is the production selection; `mock` is test/development-only. Do not select based on whichever secret happens to be present and do not silently fall back to mock in production. |

## 4. Verified Phase 13.2 boundary

The canonical Phase 13.2 knowledge layer currently provides:

- structured retrieval across `dictionary`, `kanji`, `grammar`, and `sentence` domains;
- deterministic ranking and query classification;
- entity retrieval and linked records;
- JLPT filtering and bounded result limits;
- source records and provenance metadata;
- formatted, citation-tagged grounding context;
- a server API route at `/api/ai/retrieve`;
- retrieval tests without provider credentials.

The provider foundation must consume this boundary, not replace or duplicate it. The intended flow remains:

```text
Client UI
  -> API/server boundary
  -> AI application service
  -> KnowledgeRetriever
  -> one AIProvider contract
  -> provider adapter
  -> external provider
```

The current retrieval route is not an AI generation route and should not be changed to import Anthropic or OpenAI code as part of the provider foundation.

## 5. Exact Phase 13.3 implementation boundary

This audit creates only this file:

- `reports/ai/PHASE-13.3A-PROVIDER-AUDIT.md`

The following files are the proposed **bounded Phase 13.3 provider-foundation creation set**. They are listed for implementation planning only and were intentionally not created in Phase 13.3A:

1. `src/services/ai/provider.ts` — the single provider-neutral contract and normalized request/response/event/error types.
2. `src/services/ai/providerFactory.ts` — the sole explicit `AI_PROVIDER` selection point; no route-level factory.
3. `src/services/ai/providers/anthropicProvider.ts` — the first production adapter; provider-specific HTTP/SDK details only here.
4. `src/services/ai/providers/mockProvider.ts` — deterministic test/development adapter; never an implicit production fallback.
5. `tests/ai/provider.test.ts` — contract and selection tests, including fail-closed configuration behavior.
6. `tests/ai/anthropicProvider.test.ts` — adapter transport/error/timeout tests with mocked HTTP, never real credentials.

If an SDK is selected during implementation, dependency changes must be additive and made through the package manager. `server-only` may be added as a server-boundary guard, but it is not currently installed and must not be assumed available. The provider implementation must not add a second database, AI table, authentication system, retrieval engine, or search authority.

## 6. Files that must not be modified by the provider foundation

The following existing Phase 13.2 files must remain behaviorally unchanged:

- `src/services/ai/knowledgeRetriever.ts`
- `src/services/knowledge/corpusService.ts`
- `src/services/knowledge/knowledgeService.ts`
- `src/app/api/ai/retrieve/route.ts`
- `tests/knowledge-retrieval.test.ts`

The provider foundation must also not modify:

- `src/db/schema.ts` — no provider schema is justified by this bounded phase;
- `src/db/index.ts` — keep the canonical database connection;
- existing authentication and authorization code;
- client components or client-side API contracts;
- any existing SRS, quiz, JLPT, gamification, dictionary, kanji, grammar, sentence, or search implementation;
- any historical `lib/anthropic.ts`, `LLMProvider`, `getProvider`, or route-level provider abstraction from another repository.

For the Phase 13.3A audit itself, no provider source, route behavior, authentication behavior, or knowledge-retrieval implementation was changed. To honor the clone-and-continue request, the inspected canonical repository contents were synced into the workspace after comparison; the local `.env` and this report were preserved. Because canonical `main` does not track a lockfile, the stale starter lockfile was regenerated to match canonical `package.json` so `npm ci` could run. No provider dependency was added. These synchronization steps are separate from the bounded provider audit and do not alter Phase 13.2 behavior.

## 7. Security and deployment constraints

- Keep `ANTHROPIC_API_KEY` server-only; never add a `NEXT_PUBLIC_` alias.
- Keep provider URLs, SDK imports, and credentials behind the API/server boundary.
- Preserve `.env.example` with placeholder names only in the canonical repository; never commit `.env` or real secrets.
- Fail closed when `AI_PROVIDER=anthropic` lacks credentials or when an unsupported provider is selected.
- Do not silently switch providers or return mock learning content after a provider outage.
- Keep the application Vercel-deployable with PostgreSQL/Supabase-compatible PostgreSQL.
- No destructive database operation or schema reset is part of this phase.

## 8. Baseline gate evidence

Commands run in the canonical-synced workspace:

| Command | Result |
|---|---|
| Initial `npm ci` | BLOCKED by the stale starter lockfile; it correctly reported that canonical `package.json` and `package-lock.json` were out of sync. |
| `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` | PASS — regenerated the lockfile to match canonical `package.json`; no package was added. |
| Final `npm ci` | PASS — clean install; npm reported existing audit vulnerabilities and deprecation warnings only. |
| `npm run lint` | PASS — zero errors, three pre-existing warnings. |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — Next.js 16.2.6 production build completed with the canonical route set. |
| `npx vitest run` | PASS after local database bootstrap — 14 retrieval tests passed. The first attempt was blocked only because the fresh database had no canonical tables. |

No provider code, provider dependency, AI generation route, or Phase 13.2 retrieval code was added by this audit.

## 9. Gate decision and next bounded prompt

**Phase 13.3A audit gate:** PASS for the audit scope. The referenced archive was unavailable, so the canonical GitHub repository was used as the source of truth after an explicit comparison. The workspace now contains canonical `main` at `5c1cb62`; no provider implementation was added and Phase 13.2 behavior remains intact.

**Exact next bounded prompt:**

> Phase 13.3B — implement only the single server-side AI provider contract, explicit provider factory, Anthropic adapter, mock adapter, and provider contract tests at the paths approved in this audit. Preserve the Phase 13.2 retrieval service and route unchanged. Do not add tutor flows, streaming routes, persistence, schema changes, authentication changes, or a second provider abstraction. Run the complete Phase 13.3 gate before continuing.
