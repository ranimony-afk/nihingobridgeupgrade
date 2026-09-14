# PHASE 13 CHECKLIST — AI

**Canonical repository:** `ranimony-afk/nihingobridgeupgrade`
**Current prompt:** 13.2 — Knowledge retrieval
**Status:** IN PROGRESS — 13.1 audit and 13.2 retrieval complete; provider port pending
**Last updated:** 2026-02-24

## Phase gate policy

Phase 13 cannot be marked complete until implementation, tests, build, migration verification, documentation, deployment verification, and regression checks all pass. This prompt is intentionally bounded to architecture selection.

## 13.1 Audit gate

- [x] Inspected canonical Repository A rather than replacing it with Repository B.
- [x] Inspected Arena-test AI service and route boundaries.
- [x] Inspected Repository B `nihongobridge-ai` transport, routes, schema, auth, caching, rate limiting, and tests.
- [x] Recorded competing provider abstractions and integration risks.
- [x] Selected Repository A as the only future AI owner.
- [x] Selected one provider port with provider-specific adapters behind it.
- [x] Selected Arena-test RAG/retrieval ownership as the domain pattern.
- [x] Selected Repository B operational behavior for selective adaptation.
- [x] Rejected wholesale copying and a second AI application.
- [x] Documented the no-duplicate-provider deployment gate.
- [x] Documented Phase 13.2 stop conditions and exact bounded scope.

## 13.2 Knowledge retrieval gate

Evidence: `reports/ai/PHASE-13.2-KNOWLEDGE-RETRIEVAL.md`

- [x] Build `KnowledgeRetriever` with structured retrieval (`src/services/ai/knowledgeRetriever.ts`).
- [x] Retrieve from dictionary (`dictionary_entries`).
- [x] Retrieve from kanji (existing canonical `kanji_entries`, not duplicated).
- [x] Retrieve from grammar (`grammar_patterns`).
- [x] Retrieve from sentences (`example_sentences`).
- [x] Return the underlying source row on every chunk, not just rendered text.
- [x] Resolve provenance (source, version, licence) for every retrieved record.
- [x] Add additive tables only; verified with `npx drizzle-kit push`.
- [x] Seed licence-safe first-party corpus with recorded provenance.
- [x] Expose retrieval via `GET /api/ai/retrieve` (search and entity modes).
- [x] Keep retrieval model-free — no AI provider, key or prompt introduced.
- [x] **Deployment gate: AI retrieval tests return source records — `npx vitest run`, 14 passed.**

## 13.3–13.6 implementation gates

- [ ] Add exactly one server-only AI provider port and explicit provider factory.
- [ ] Add the first provider adapter with timeout, cancellation, normalized errors, and usage metadata.
- [ ] Add deterministic mock behavior for tests without silently enabling it in production.
- [x] Integrate canonical knowledge retrieval (13.2); prompt versioning still pending.
- [ ] Add authenticated tutor/correction/grammar API contracts.
- [ ] Add provider-neutral streaming and tool contracts if required by product scope.
- [ ] Add additive AI persistence only after a Repository A schema and foreign-key audit.
- [ ] Add cache, quota, retention, and deletion behavior under Repository A ownership.
- [ ] Add unit/integration tests for grounding, validation, provider selection, rate limits, and failure behavior.
- [ ] Add web client/mobile API contract documentation.
- [ ] Run schema push/migration verification if and only if schema changes are introduced.
- [ ] Run deployment verification and inspect production-like environment requirements.
- [ ] Complete 3–5 feature regression checks.
- [ ] Update this checklist to COMPLETE only after all gates above pass.

## Deployment gate: no duplicate AI provider abstractions

Before merging any Phase 13 implementation, search the canonical repository and confirm:

```bash
grep -RInE 'getProvider|LLMProvider|AIProvider|AnthropicClient|generateStructured|streamTutorCompletion' src
```

Expected result:

- one canonical provider contract and one selection/factory path;
- adapters may implement the contract;
- no route imports a vendor transport directly;
- no second `lib/anthropic.ts`-style abstraction;
- no OpenAI/Anthropic key-presence auto-selection;
- no production mock fallback.

## Audit change inventory

| Path | Change | Production impact |
|---|---|---|
| `reports/ai/PHASE-13.1-AI-ARCHITECTURE-AUDIT.md` | Added evidence-based architecture decision | Documentation only |
| `reports/gates/PHASE-13-CHECKLIST.md` | Added phase gate and deployment checks | Documentation only |
| `.env.example` | Added documented future AI configuration placeholders | No secrets; no runtime behavior |

No production TypeScript, API route, authentication code, schema, migration, package dependency, or database data was changed in Phase 13.1.

## Regression checks for this prompt

The audit change is documentation-only, so existing functionality remains unchanged. The following checks are required and are run for the canonical checkout:

1. **Health route** — `/api/health` remains available and the production server healthcheck passes.
2. **Root page** — the server-rendered home page still builds and retains its PostgreSQL connectivity check.
3. **Drizzle boundary** — `src/db/index.ts` and the current empty schema entrypoint still typecheck/build without new imports.
4. **Lint/type safety** — documentation additions introduce no source changes or compiler errors.

## Validation commands

Run from Repository A root:

```bash
set -o pipefail; npx next typegen 2>&1 | tee /tmp/next-typegen.log
set -o pipefail; npm exec tsc -- --noEmit --pretty false 2>&1 | tee /tmp/tsc.log
set -o pipefail; npm run build 2>&1 | tee /tmp/build.log
```

Then run the platform-managed production verification:

```text
build_and_start
```

## Deployment notes for this prompt

No AI deployment is claimed by Phase 13.1 because no AI runtime code has been added. The current canonical app remains deployable with its existing PostgreSQL environment.

After the audit-only validation passes, the current deployment commands remain:

```bash
npm install
npm run build
npm run start
```

AI secrets must not be added until Phase 13.2 is implemented. When that phase begins, use the `.env.example` contract and configure secrets in the deployment platform, never in the repository.
