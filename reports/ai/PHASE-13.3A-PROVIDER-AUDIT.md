# Phase 13.3A — Provider Boundary Audit

**Project:** NihongoBridge

**Canonical repository:** `https://github.com/ranimony-afk/nihingobridgeupgrade`

**Audited canonical revision:** `7c66bec` (`a13.3a`, `main`)

**Audit status:** COMPLETE — provider implementation intentionally not started

**Audit date:** 2026-09-14

## 1. Source-of-truth comparison

The requested Phase 13.2 archive, `nihongobridge-production-integration-builda13.2.zip`, was searched for in `/app`, `/tmp`, `/workspace`, and `/root`. It was not present, so no archive comparison was possible.

The canonical GitHub repository was cloned read-only and compared with the supplied workspace before synchronization. The supplied workspace was a generic starter scaffold with only a placeholder Drizzle schema, health route, and starter page. The canonical GitHub tree was newer and materially different, containing the Phase 13.2 retrieval implementation and the broader NihongoBridge application. The canonical tracked tree was synchronized into the project root without changing application behavior, and the local `.env` was preserved.

Current canonical history relevant to this audit:

| Commit | Subject | Finding |
|---|---|---|
| `7c66bec` | `a13.3a` | Current `main` head; provider boundary audit report and full application tree |
| `7c00365` | `del 13.2` | Delete/re-add history churn |
| `5c1cb62` | `13.2` | Phase 13.2 knowledge retrieval implementation |
| `e4fd323` | `b 12.1` | Prior platform baseline |

`git diff 5c1cb62..7c66bec` contains only the addition of the prior provider-boundary audit report. The Phase 13.2 source is present at the current head.

## 2. Files inspected

### AI and knowledge

- `src/services/ai/knowledgeRetriever.ts`
- `src/services/knowledge/corpusService.ts`
- `src/services/knowledge/knowledgeService.ts`
- `src/app/api/ai/retrieve/route.ts`
- `src/data/lexicon.ts`
- `src/data/kanji.ts`

### Database and types

- `src/db/index.ts`
- `src/db/schema.ts`
- `src/types/gamification.ts`
- `src/types/jlpt.ts`
- `src/types/quiz.ts`
- `src/types/srs.ts`

### Project/configuration

- `package.json`
- `.env.example`
- `next.config.ts`
- `tsconfig.json`
- `drizzle.config.json`
- `eslint.config.mjs`
- `reports/ai/PHASE-13.1-AI-ARCHITECTURE-AUDIT.md`
- `reports/ai/PHASE-13.2-KNOWLEDGE-RETRIEVAL.md`
- `reports/gates/PHASE-13-CHECKLIST.md`

The requested paths `etl/` and `nihongobridge-integration-masterplan/` are absent from the canonical repository. `src/lib/queries.ts` is also absent.

## 3. Provider search results

The following terms were searched in canonical production source, package metadata, environment template, and reports:

```text
anthropic
openai
AIProvider
LLMProvider
getProvider
generateText
generateStructured
streamText
streamTutorCompletion
AI_PROVIDER
ANTHROPIC_API_KEY
server-only
```

### 3.1 Does a provider already exist?

**No implemented provider exists in production source.**

- No Anthropic SDK, OpenAI SDK, AI SDK, vendor HTTP client, model call, or provider adapter exists.
- `ANTHROPIC_API_KEY`, `AI_PROVIDER`, and Anthropic references occur in `.env.example`, architecture documentation, and audit documentation only.
- `KnowledgeRetriever` is deterministic database retrieval and explicitly does not call an AI provider.

### 3.2 Does a duplicate provider abstraction exist?

**No duplicate production abstraction exists.**

Historical references to `LLMProvider`, `getProvider()`, direct Anthropic functions, and other provider designs describe rejected external prototypes in the Phase 13.1 audit. Those modules are not present in this canonical repository.

### 3.3 Do routes directly import a provider?

**No.**

`src/app/api/ai/retrieve/route.ts` imports only:

- `KnowledgeRetriever`
- `KnowledgeCorpusService`
- `KnowledgeService`
- Next.js request/response types

It remains a deterministic retrieval endpoint and must not become a provider route during Phase 13.3B.

### 3.4 Do client components import AI/server code?

**No provider or AI/server import was found in client-marked components.**

Client pages use browser `fetch()` calls to API routes. No client-marked component imports `@/db`, `@/services`, `KnowledgeRetriever`, `AIProvider`, `server-only`, or a provider SDK.

The server-rendered root page and API routes import database/services on the server side only.

### 3.5 Is `server-only` installed?

**No.**

It is absent from `package.json` and the canonical dependency tree. Next.js can enforce server/client boundaries internally, but the provider foundation may add `server-only` only if justified and only through the package manager in a later bounded implementation.

### 3.6 Is an AI SDK installed?

**No.**

The following are absent:

- `ai`
- `@ai-sdk/anthropic`
- `@anthropic-ai/sdk`
- `openai`
- `server-only`

The package includes `vitest` as a runtime dependency for the existing retrieval tests, but no provider dependency.

### 3.7 First adapter selection

**Anthropic should be the first production adapter.**

This is the provider selected by the Phase 13.1 architecture decision and documented in `.env.example`. It must be selected through an explicit server-side `AI_PROVIDER` setting:

- `AI_PROVIDER=anthropic` for an explicitly configured production adapter;
- `AI_PROVIDER=mock` only for development/tests;
- unsupported values and missing production credentials must fail closed;
- no key-presence auto-selection;
- no silent production fallback to mock;
- no provider credential or vendor URL may be exposed to the browser.

## 4. Existing Phase 13.2 boundary

Phase 13.2 is present and remains behaviorally unchanged.

### Retrieval

`KnowledgeRetriever` provides:

- dictionary retrieval;
- canonical kanji retrieval from `kanji_entries`;
- grammar retrieval;
- example-sentence retrieval;
- deterministic ranking;
- query classification;
- JLPT filtering;
- entity retrieval with linked records;
- raw source records on returned chunks;
- provenance records containing source, version, licence, URL, and domain;
- citation-tagged context formatting and token estimation.

### Persistence

Phase 13.2 adds the knowledge tables:

- `knowledge_sources`
- `dictionary_entries`
- `grammar_patterns`
- `example_sentences`

It reuses the existing canonical `kanji_entries` table and does not create a second kanji store.

### API

`GET /api/ai/retrieve` supports:

```text
/api/ai/retrieve?q=水
/api/ai/retrieve?q=てから&domains=grammar,sentence&level=N5&limit=8
/api/ai/retrieve?domain=grammar&id=gp-te-kara
```

### Tests

`tests/knowledge-retrieval.test.ts` contains 14 retrieval/provenance/entity tests. After applying the existing Drizzle schema additively to the local PostgreSQL database, all 14 passed.

## 5. Current AI architecture map

```text
Client UI
  -> API/server boundary
  -> [generation application service: not implemented]
  -> KnowledgeRetriever                  [implemented]
  -> [AIProvider contract: not implemented]
  -> [provider adapter: not implemented]
  -> [external provider: not connected]
```

| Layer | Current status |
|---|---|
| Retrieval | Implemented by `KnowledgeRetriever` |
| Provider contract | Not implemented |
| Provider factory | Not implemented |
| Provider adapter | Not implemented |
| AI application service | Not implemented for generation/tutor/correction |
| API | Retrieval route only; no generation/chat/streaming route |
| UI | No AI UI or browser retrieval consumer found |
| Persistence | Knowledge corpus/provenance only; no AI conversation/completion/cache/quota tables |

## 6. Exact Phase 13.3B creation boundary

The following files are the exact proposed creation set for the next bounded provider-foundation task. They were **not created in this audit**:

1. `src/services/ai/provider.ts`
   - one provider-neutral contract;
   - normalized request/response/usage/error types;
   - abort/timeout and capability types as required;
   - no vendor-specific types in the public contract.
2. `src/services/ai/providerFactory.ts`
   - the sole explicit `AI_PROVIDER` selection point;
   - fail-closed configuration behavior;
   - no route-level factories.
3. `src/services/ai/providers/anthropicProvider.ts`
   - first production adapter;
   - provider-specific HTTP/SDK details only here;
   - timeout, cancellation, normalized errors, and usage metadata.
4. `src/services/ai/providers/mockProvider.ts`
   - deterministic test/development adapter;
   - never an implicit production fallback.
5. `tests/ai/provider.test.ts`
   - provider contract and explicit selection tests;
   - unsupported provider and production mock-fallback tests.
6. `tests/ai/anthropicProvider.test.ts`
   - mocked transport, timeout, cancellation, response, and error tests;
   - no real provider credentials or network calls.

A package dependency may be added only if the implementation selects an SDK; package changes must use the package manager and must not introduce a second provider abstraction.

## 7. Files that must not be modified in Phase 13.3B

The provider foundation must not modify behavior in:

- `src/services/ai/knowledgeRetriever.ts`
- `src/services/knowledge/corpusService.ts`
- `src/services/knowledge/knowledgeService.ts`
- `src/app/api/ai/retrieve/route.ts`
- `tests/knowledge-retrieval.test.ts`
- `src/db/schema.ts`
- `src/db/index.ts`
- any existing SRS, quiz, JLPT, XP, gamification, kana, kanji, grammar, sentence, or search implementation;
- any authentication or authorization code;
- any client component or existing client API contract;
- any historical external `lib/anthropic.ts`, `LLMProvider`, or `getProvider` implementation.

The provider foundation must not add:

- tutor/correction routes;
- streaming UI;
- AI persistence tables;
- a second database;
- a second auth system;
- a second retrieval/search engine;
- migrations or destructive schema operations.

## 8. Validation evidence

### Required dependency/build commands

The first required command was run against the canonical tree exactly as committed:

```bash
npm ci
```

It initially failed because the canonical repository did not track a lockfile:

```text
npm error code EUSAGE
npm error The `npm ci` command can only install with an existing package-lock.json or
npm error npm-shrinkwrap.json with lockfileVersion >= 1. Run an install with npm@5 or
npm error later to generate a package-lock.json file, then try again.
```

No dependency was added and `package.json` was not edited. To make the canonical checkout reproducible, a `package-lock.json` was generated from the existing `package.json` using `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`, then the required command was rerun:

```text
npm ci — PASS
```

The clean install reported 13 existing npm audit vulnerabilities (1 low, 6 moderate, 5 high, 1 critical) and two deprecation warnings. No provider dependency was installed.

Subsequent required gates:

| Command | Result |
|---|---|
| `npm run lint` | PASS — 0 errors, 3 existing warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — all canonical application/API routes compiled |
| `npx vitest run` | PASS — 14 tests passed |
| `build_and_start` | PASS — platform preview bootstrapped and `/api/health` verified |

The three lint warnings are pre-existing:

- custom Google font warning in `src/app/layout.tsx`;
- missing `fetchQuestions` hook dependency in `src/app/question-bank/page.tsx`;
- missing `loadSummary` hook dependency in `src/app/review/session/[id]/page.tsx`.

The existing Drizzle schema was applied locally through an explicit PostgreSQL CLI override:

```bash
npx drizzle-kit push --dialect postgresql --schema ./src/db/schema.ts --url "$DATABASE_URL"
```

The command reported `[✓] Changes applied`. No drop, truncate, reset, destructive migration, or source schema modification was performed. This local bootstrap was required because the fresh local database initially lacked `knowledge_sources` and the other canonical tables.

## 9. Audit decision

**Phase 13.3A provider-boundary audit: PASS.**

- The archive was unavailable and therefore could not be compared.
- The canonical GitHub repository was cloned and verified as the newer source of truth.
- The canonical tree is synchronized into the project root.
- Phase 13.2 retrieval is present and untouched.
- No provider code, provider dependency, generation route, provider schema, or AI UI was added.
- No duplicate provider abstraction exists.
- Anthropic is the selected first adapter.
- The exact provider foundation boundary and protected file set are documented.
- `npm ci`, lint, typecheck, build, retrieval tests, and platform healthcheck now pass after the minimal lockfile/local-schema bootstrap repairs.

## 10. Exact next bounded prompt

**Phase 13.3B — implement only the single server-side AI provider contract, explicit provider factory, Anthropic adapter, deterministic mock adapter, and provider contract/transport tests at the paths approved in this audit. Preserve the Phase 13.2 retrieval service and route unchanged. Do not add tutor flows, streaming routes, persistence, schema changes, authentication changes, or a second provider abstraction.**
