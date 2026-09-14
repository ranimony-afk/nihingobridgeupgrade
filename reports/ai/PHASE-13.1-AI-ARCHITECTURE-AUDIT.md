# Phase 13.1 — AI Architecture Audit

**Project:** NihongoBridge
**Canonical production repository:** `ranimony-afk/nihingobridgeupgrade`
**Source repository:** `ranimony-afk/Knowledge-base-NihongoBridge`
**Comparison repository:** `ranimony-afk/Arena-test`
**Audit status:** COMPLETE — architecture selected, implementation intentionally deferred to Phase 13.2
**Audit date:** 2026-02-24

## 1. Scope and evidence

This audit evaluates AI code before integration. It does not perform a blind directory merge, change the authentication system, or create a second database schema.

| Repository | Evidence inspected | Finding |
|---|---|---|
| Repository A (`nihingobridgeupgrade`) | Remote snapshot `e4fd323`; `src/`, `package.json`, Drizzle configuration | The canonical target has no AI route, AI service, provider abstraction, AI table, or AI dependency. Its existing knowledge, quiz, SRS, JLPT, and gamification services remain the production authority. |
| Arena-test | `src/services/ai/llm-provider.ts`, `rag-pipeline.ts`, `knowledge-retrieval.ts`, `tutor-chat.ts`, `correction.ts`, and `src/app/api/ai/*` | A useful domain prototype exists: a provider port, RAG orchestration, retrieval boundary, tutor/correction services, and thin route handlers. It is not production-ready as-is. |
| Repository B / `nihongobridge-ai` | `lib/anthropic.ts`, `lib/repository.ts`, `lib/prompts.ts`, `lib/validation.ts`, `lib/rate-limit.ts`, `schema/ai.ts`, tutor and structured AI routes, tests | A standalone Next.js 14 Anthropic application with strong transport and operational behaviors, but direct provider coupling and a separate application/database contract. It must not be mounted as a second application inside Repository A. |

### 1.1 Existing AI implementations and ownership

There are two candidate implementations, not two production implementations:

1. **Arena-test service prototype**
   - `src/services/ai/llm-provider.ts` exports `LLMProvider`, `LLMRequest`, `LLMResponse`, and `getProvider()`.
   - `src/services/ai/rag-pipeline.ts` owns intent detection, retrieval, prompt construction, model invocation, and response validation.
   - `src/services/ai/knowledge-retrieval.ts` is correctly separated from model calls and reads platform knowledge.
   - `src/services/ai/tutor-chat.ts` and `correction.ts` consume the RAG pipeline.
   - The prototype selects OpenAI or Anthropic by the presence of environment keys, silently falls back to mock, and uses an in-memory conversation map. Those behaviors are unsuitable for a production canonical service.

2. **Repository B AI service**
   - `lib/anthropic.ts` calls the Anthropic HTTP API directly and contains structured JSON parsing, SSE parsing, tool-use handling, timeouts, abort handling, and provider-specific error mapping.
   - `lib/repository.ts` performs grounding, caching, and generated-question validation against the source knowledge package.
   - `lib/rate-limit.ts` provides Redis-backed production quota enforcement with a development fallback.
   - `schema/ai.ts` defines a standalone `ai_explanations` table tied to Repository B's imported knowledge and user packages.
   - Routes import `generateStructured` and `streamTutorCompletion` directly, so no provider-neutral port exists in this service.

## 2. Conflicts and risks

| Conflict / risk | Why it matters | Decision |
|---|---|---|
| Two provider models (`LLMProvider` in Arena-test and direct `Anthropic` functions in Repository B) | A later OpenAI/Anthropic switch would require changing routes and business logic, creating drift between web and mobile clients. | Keep one provider port in Repository A. Provider-specific HTTP code is an adapter only. |
| Arena-test chooses a provider by whichever API key is present | Deployment behavior changes accidentally with environment configuration; a failing provider becomes a user-facing mock response. | Use explicit `AI_PROVIDER`; fail closed in production. Mock is test/development-only and never an implicit production fallback. |
| Repository B is a separate Next.js application with its own package and database imports | Copying it would create a second API/runtime/database authority. | Adapt behavior file-by-file into Repository A services and routes. Do not copy the app, package, `@nihongobridge/knowledge` package, or schema wholesale. |
| Arena-test tutor conversations are an in-memory `Map` | Conversations disappear on restart and cannot be shared across replicas. | Add persistence through Repository A's canonical Drizzle schema in a later bounded prompt. |
| Repository B's `ai_explanations` schema references `@nihongobridge/knowledge` users and grammar tables | It cannot be applied to Repository A without a foreign-key and ID contract review. | Re-model only against Repository A tables after a schema audit; no migration in Phase 13.1. |
| Repository B's routes authenticate against its Supabase/JWT assumptions | Authentication must not be swapped or duplicated. | Repository A's existing auth decision remains authoritative; AI routes will consume its auth context. |
| Direct model output is trusted by some Arena-test paths | Japanese learning explanations and generated questions require grounding and validation. | Retrieval and output validation are mandatory service stages; generated content remains inactive until editorial review. |
| Repository B contains a direct dictionary HTTP tool dependency | A second dictionary/search API would violate the single knowledge/search authority. | Define a Repository A tool boundary backed by the canonical knowledge/search service, not an external duplicate API. |

## 3. Selected canonical architecture

### Decision

**Repository A will own the only AI architecture.** Its canonical shape is:

```text
API route / server action
        |
        v
AI application service (tutor, correction, grammar, question generation)
        |
        +--> KnowledgeRetrieval / canonical search service
        +--> prompt and output validation
        +--> single AIProvider port
                    |
                    +--> AnthropicProvider adapter (first production adapter)
                    +--> MockProvider adapter (test/development only)
                    +--> future provider adapters, only when explicitly approved
        |
        v
Canonical Repository A Drizzle schema and observability
```

The decision combines:

- **Arena-test's domain ownership:** `KnowledgeRetrieval` remains model-free, `RAGPipeline` owns orchestration, and routes are thin.
- **Repository B's proven transport behavior:** timeouts, cancellation, streamed events, tool calls, structured validation, rate limiting, cache keys, and explicit operational errors are adapted behind the boundary.

This is an adaptation, not a merge. Repository B remains a historical/source repository.

### 3.1 The single provider contract

Phase 13.2 must introduce exactly one server-only provider contract in Repository A, with one public factory. The target contract is conceptually:

- normalized chat messages and model options;
- normalized completion metadata (`provider`, `model`, usage, finish reason);
- normalized tool definitions and tool calls;
- a streaming capability that emits provider-neutral text/tool events;
- typed provider errors with retryable/non-retryable classification;
- abort signal and timeout support.

Structured responses are an AI application-service concern: the service supplies a schema, parses the normalized completion, and rejects invalid output. They must not become a second provider interface.

Provider-specific HTTP details belong only under a future `src/services/ai/providers/` boundary. No route, component, Flutter client, or knowledge service may import an Anthropic/OpenAI SDK or call a vendor URL directly.

### 3.2 Provider selection and failure policy

- `AI_PROVIDER=anthropic` is the explicit production selection for Phase 13.
- `AI_PROVIDER=mock` is allowed for local development and automated tests.
- Missing production credentials return a configuration error; they do not produce synthetic learning content.
- A provider outage returns a stable API error and is observable; it does not silently switch providers or mock responses.
- `ANTHROPIC_API_KEY` is read only on the server. It is never exposed through `NEXT_PUBLIC_*` variables or committed files.
- A future second provider requires a new adapter plus an architecture decision record; it must not introduce another `getProvider`, `LLMProvider`, `AnthropicClient`, or route-level factory.

### 3.3 Knowledge grounding contract

All tutor, correction, grammar explanation, and generated-question flows must follow:

1. Validate and authenticate the request using Repository A conventions.
2. Retrieve relevant dictionary, kanji, grammar, sentence, JLPT, or learning context through Repository A services.
3. Build a bounded prompt with a prompt version and source identifiers.
4. Call the single provider port.
5. Validate the response shape and grounding claims.
6. Return source metadata to the client where appropriate.
7. Persist only through Repository A's schema and retention rules.

The model is not a replacement for dictionary, grammar, or search data. When structured knowledge is unavailable, the response must say that the platform could not verify the fact instead of presenting an invented fact as authoritative.

## 4. Selective integration map

| Repository B capability | Action in Repository A | Phase |
|---|---|---|
| `lib/anthropic.ts` timeout, abort, error normalization | Adapt into the first provider adapter; do not copy the module name or direct imports | 13.2 |
| SSE tutor streaming | Adapt into the provider-neutral stream and a thin Repository A tutor route | 13.3 |
| Anthropic dictionary tool loop | Adapt as a provider-neutral tool contract backed by canonical search | 13.3 |
| `lib/validation.ts` request and structured-output schemas | Re-author under Repository A types/services and align with its API envelope | 13.2–13.4 |
| `lib/prompts.ts` Hana-sensei prompt rules | Re-author with Repository A knowledge source identifiers and prompt versioning | 13.3 |
| `lib/rate-limit.ts` Redis/local behavior | Adapt after Repository A auth and deployment configuration are verified | 13.5 |
| `schema/ai.ts` cache table | Use as design input only; create additive Repository A tables after a schema/foreign-key audit | 13.5 |
| `components/ai/*` chat UI | Rebuild as Repository A components consuming the stable API; no server logic in UI | Later UI prompt |
| generated-question grounding tests | Adapt as Repository A tests against its schema and knowledge services | 13.4 |

## 5. Explicitly rejected options

### Rejected: copy `nihongobridge-ai` into `src/` or run it as a second service

This would duplicate routes, dependencies, auth assumptions, database references, and provider logic. It also makes Web and Flutter choose between incompatible contracts.

### Rejected: keep Arena-test's `getProvider()` and add Repository B's `lib/anthropic.ts`

This is the exact duplicate-provider failure the deployment gate forbids. The target must have one port and one selection path.

### Rejected: make Anthropic-specific code the application service

Anthropic is the initial provider, not the domain owner. Tutor, correction, grammar, and question-generation logic must remain usable with the mock adapter and future approved adapters.

### Rejected: silently use mock output in production

Synthetic output can teach incorrect Japanese and would hide missing credentials or provider outages. Production must fail closed.

## 6. Phase 13.1 gate result

| Gate item | Result | Evidence |
|---|---|---|
| Repository A remains canonical | PASS | No source repository files copied into production. |
| Existing auth is not replaced | PASS | No auth code or dependency changed. |
| One database source of truth | PASS | No schema or migration changed. |
| Existing provider abstractions mapped | PASS | Arena-test provider port and Repository B direct transport are recorded above. |
| One canonical provider architecture selected | PASS | Repository A AI service boundary + single provider port + adapters. |
| No duplicate AI provider abstractions | PASS by design | Phase 13.2 must introduce one provider port only; checklist and code review block `lib/anthropic.ts`-style route imports. |
| AI implementation complete | NOT IN SCOPE | Deferred to Phase 13.2 and later bounded prompts. |
| Production deployment verified | NOT IN SCOPE | No runtime behavior changed in this audit-only prompt. |

## 7. Implementation stop conditions for Phase 13.2

Stop and report instead of guessing if any of the following is found:

- Repository A authentication cannot provide a trusted learner identity;
- canonical dictionary/grammar/search contracts differ from the Arena-test retrieval assumptions;
- a proposed AI table requires destructive changes or references a non-canonical table;
- a stream/tool capability cannot be normalized without leaking provider-specific types;
- a production environment would need a second API gateway or second database;
- the requested behavior requires copyrighted or unlicensed learning content.

## 8. Next bounded prompt

**Phase 13.2 — Provider port and Anthropic adapter foundation**

Deliver only:

1. one `AIProvider` contract in Repository A;
2. a server-only Anthropic adapter with timeout, abort, normalized errors, and usage metadata;
3. a deterministic mock adapter for tests;
4. explicit provider configuration and `.env.example` entries;
5. unit tests proving provider selection does not silently fall back in production;
6. no AI route, schema migration, or UI until this foundation passes validation.

The implementation must retain the decision in this report and must not create a second provider abstraction.
