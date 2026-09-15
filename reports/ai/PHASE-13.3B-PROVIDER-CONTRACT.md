# Phase 13.3B — AI Provider Contract

**Project:** NihongoBridge
**Repository:** `https://github.com/ranimony-afk/nihingobridgeupgrade`
**Branch:** `arena/gate-zero-ci-activation`
**Status:** COMPLETE — provider-neutral contract foundation in place; real
vendor adapters deferred to 13.3C+.
**Date:** 2026-09-15

## 1. Architecture

The canonical production AI pipeline remains:

```
UI
 ↓
server route/service
 ↓
AI orchestration (future phase)
 ↓
KnowledgeRetriever / KnowledgeCorpusService   ← canonical knowledge DB
 ↓
AIProvider port (this phase)
 ↓
provider adapter                              ← vendor-specific, future
 ↓
AI provider (Anthropic, etc.)
```

This phase delivers the **port** (interface + types + errors + factory +
deterministic mock). It does NOT call any vendor SDK, does NOT make
outbound HTTP requests, does NOT change the schema, and does NOT wire
an AI chat route.

Conventions chosen after inspecting the existing tree:

- Files live under `src/services/ai/`, alongside the existing
  `knowledgeRetriever.ts`.
- The barrel is `src/services/ai/index.ts`; consumers should import
  `{ createAIProvider, AIProviderError, … }` from `@/services/ai`.
- All server modules import `"server-only"` so any accidental client
  import fails at Next.js build time. No `use server` directives are
  required because these modules are only ever imported from route
  handlers and server services.
- The `@/*` path alias already configured in `tsconfig.json` is used.
- Tests live under `tests/` matching the existing `knowledge-retrieval`
  pattern and use the existing vitest configuration (including the
  `server-only` shim so tests don't need a browser bundle).
- No new dependencies are added; no SDK is pulled in.

The single canonical port is the `AIProvider` interface. Orchestration,
services, and routes may import the interface and factory; concrete
adapters live under `src/services/ai/providers/` and are imported ONLY
by the factory.

## 2. Files changed

### Added

| File | Purpose |
|---|---|
| `src/services/ai/provider.ts` | `AIProvider` interface; provider-neutral request/response/message/options/usage/error types; `AIErrorCode` taxonomy; `AIProviderError` class with redacting `toJSON()`; `AIErrors` constructors; `AI_PROVIDERS` id list (`mock`, `anthropic`). |
| `src/services/ai/factory.ts` | `createAIProvider()` — explicit `AI_PROVIDER` resolution, fail-closed on unknown/unset/unimplemented provider; `getRegisteredProviderIds()` for diagnostics/tests. |
| `src/services/ai/index.ts` | Public barrel; imports `"server-only"`; re-exports interface/errors/factory. Concrete adapters are deliberately NOT re-exported. |
| `src/services/ai/providers/mock.ts` | `MockAIProvider` — deterministic, AbortSignal-aware, grounding-and-promptVersion-respecting mock for local/tests. Must be explicitly selected via `AI_PROVIDER=mock`. |
| `tests/ai-provider-contract.test.ts` | 29 unit tests (no DB required) covering every factory/contract/error guarantee below. |
| `reports/ai/PHASE-13.3B-PROVIDER-CONTRACT.md` | This report. |

### Modified

- `src/services/ai/provider.ts`, `src/services/ai/factory.ts` (added the
  `anthropic` designed-for id and the `ResponseFormat` / `ChatResponse.json`
  forward-compatibility hooks to satisfy the full 13.3B contract spec).
  No file that existed prior to this phase was edited.

### Not touched

- `src/app/**`, `src/components/**`, `src/db/**` (schema, migrations,
  client), `src/services/knowledge/**`, `src/services/ai/knowledgeRetriever.ts`,
  `src/data/**`, `package.json`, `package-lock.json`, `.env.example`,
  `eslint.config.mjs`, `tsconfig.json`, `next.config.ts`, `drizzle.config.json`,
  `.github/workflows/ci.yml`, `tests/knowledge-retrieval.test.ts`,
  `tests/setup.ts`, `tests/mocks/server-only.ts`.

No schema change. No migration change. No new dependency. No CI workflow
change.

## 3. Provider contract

### Identity

```ts
export const AI_PROVIDERS = ["mock", "anthropic"] as const;
export type AIProviderId = (typeof AI_PROVIDERS)[number];
```

### Request

```ts
export interface ChatRequest {
  system: string;                    // persona / task framing
  messages: ChatMessage[];           // { role: "system"|"user"|"assistant"; content: string }[]
  context?: GroundedContext;         // KnowledgeRetriever-formatted grounding (text, estimatedTokens, chunkCount)
  options?: GenerationOptions;       // maxTokens, temperature, topP, responseFormat
  promptVersion: string;             // AI_PROMPT_VERSION — forwarded for observability
  requestId?: string;                // correlation id
  signal?: AbortSignal;              // cancellation / timeout
}
```

Structured-output is supported via `options.responseFormat`:

```ts
export type ResponseFormat =
  | { type: "text" }
  | { type: "json"; schema?: unknown };
```

`text` is guaranteed for 13.3B. Adapters that cannot honour a requested
format MUST throw `INVALID_REQUEST` rather than silently return plain
text. `json` mode is a forward-compatible hook for 13.3C+.

Streaming is NOT part of the 13.3B interface. No current NihongoBridge
call site requires streaming; it will be introduced as an additional
method (e.g. `streamChat`) when a real adapter lands AND orchestration
needs it.

### Response

```ts
export interface ChatResponse {
  text: string;                      // generated text
  json?: unknown;                    // parsed payload when responseFormat.type==="json"
  provider: AIProviderId;            // which adapter produced this
  model: string;                     // resolved model id
  finishReason?: FinishReason;       // "stop" | "length" | "content_filter" | "tool_call" | "unknown"
  usage?: TokenUsage;                // input/output/total + optional breakdown; all fields optional
  requestId?: string;
  providerResponseId?: string;       // vendor-side id (e.g. Anthropic msg_*)
}
```

### Usage

```ts
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  breakdown?: Record<string, number>;
}
```

All fields are optional because providers differ in what telemetry they
expose; adapters should fill what they can and omit the rest.

### Error taxonomy

| Code | Meaning | Retryable |
|---|---|---|
| `CONFIGURATION_ERROR` | `AI_PROVIDER` unset/unknown/unimplemented, or adapter not registered | no |
| `AUTHENTICATION_ERROR` | Missing/invalid credential | no |
| `RATE_LIMITED` | Upstream 429 | yes |
| `TIMEOUT` | Per-request deadline or AbortSignal fired | yes |
| `PROVIDER_UNAVAILABLE` | Network / 503 / DNS | yes |
| `UPSTREAM_ERROR` | 5xx from provider | yes |
| `INVALID_REQUEST` | 4xx client error (other than auth/rate-limit) | no |
| `UNKNOWN_ERROR` | Unclassified failure | no |

All errors are instances of `AIProviderError`, which extends `Error` and
adds `{ code, retryable, provider?, status?, cause? }`. `toJSON()`
intentionally omits `cause` so logging can never leak Authorization
headers or API-key-bearing payloads. `AIErrors.*` factory helpers set
the right `code` and `retryable` defaults for adapters.

### Port interface

```ts
export interface AIProvider {
  readonly id: AIProviderId;
  readonly model: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
}
```

Nothing in the contract references Anthropic SDK types, OpenAI SDK
types, Claude/GPT model names (except inside adapter modules, which are
not present in 13.3B), or vendor request/response envelopes.

## 4. Factory behavior

`createAIProvider()` is the ONLY module permitted to import concrete
adapter modules. Resolution is EXPLICIT via `AI_PROVIDER`:

| `AI_PROVIDER` value | Behavior |
|---|---|
| *unset* / empty / whitespace | throws `CONFIGURATION_ERROR` (fail closed — no silent mock) |
| `mock` | returns `MockAIProvider` (deterministic, no credentials required) |
| `anthropic` | throws `CONFIGURATION_ERROR` with "adapter not yet implemented (Phase 13.3C+)" — fail closed even if `ANTHROPIC_API_KEY` is set; no silent fallback |
| any other value | throws `CONFIGURATION_ERROR` listing `mock, anthropic` as the supported values |

Resolution is case-insensitive and trims whitespace (`"MOCK"`, `" mock "`
both resolve to mock).

Credential validation for future adapters lives in
`validateAndInstantiate` in the same factory module; `AUTHENTICATION_ERROR`
is thrown when a selected provider's required env var is missing.
13.3B only ships `mock`, which requires no credential.

Forbidden patterns (verified by tests):

- `if ANTHROPIC_API_KEY → choose Anthropic` — not implemented; factory
  only reads `AI_PROVIDER`.
- Defaulting production to mock when `AI_PROVIDER` is unset — throws
  instead.
- Fallback from an unsupported id to mock — throws instead.
- Imports of concrete adapters from routes/services — barrel does not
  re-export them; tree-shaking keeps them out of client bundles.

## 5. Security analysis

- **Server-only boundary.** Every new module under `src/services/ai/`
  starts with `import "server-only";`. Any Client Component import
  fails at Next.js build time (the `server-only` package poisons client
  builds). Tests shim `server-only` via the existing vitest alias to
  `tests/mocks/server-only.ts`, matching how the DB module is tested.
- **No provider SDK.** `package.json`/`package-lock.json` are unchanged;
  no Anthropic, OpenAI, AI SDK, Vercel AI, or other vendor dependency is
  pulled in.
- **No secrets in request/response.** `ChatRequest` has no API-key
  field; adapters will read credentials from the environment at request
  time. `AIProviderError.toJSON()` strips `cause` and never echoes
  Authorization headers or key strings — verified by a redaction test.
- **Fail-closed resolution.** Unknown/unset/unimplemented providers throw
  before any network call can happen.
- **Cancellation.** `AbortSignal` is wired through; real adapters must
  translate this into upstream cancellation (controller.abort / fetch
  signal). The mock already respects pre-abort and racing timeouts.
- **No production DB access from AI path.** The provider contract is
  strictly downstream of `KnowledgeRetriever`; no new tables, no
  duplicate knowledge store, no embedding/vector migration in this
  phase.
- **Prompt version.** `request.promptVersion` is mandatory and forwarded
  for observability; adapters must NOT branch on it.

## 6. Tests

File: `tests/ai-provider-contract.test.ts` (29 tests, no DB required).

1. Explicit mock selection — `AI_PROVIDER=mock` returns `MockAIProvider`
2. Mock selection works without any API key
3. Unknown provider id throws `CONFIGURATION_ERROR`; message lists both
   `mock` and `anthropic`
4. Registry contains `mock`; does not prematurely list `openai`
5. `AI_PROVIDER=anthropic` throws `CONFIGURATION_ERROR` with
   `provider: "anthropic"` even when `ANTHROPIC_API_KEY` is set —
   adapter deferred, fail closed
6. Unset `AI_PROVIDER` throws `CONFIGURATION_ERROR`
7. Empty-string `AI_PROVIDER` throws `CONFIGURATION_ERROR`
8. Unknown id does NOT silently fall back to mock
9. Unset id does NOT silently fall back to mock even when stray keys
   exist
10. Provider-neutral request accepts system, messages, context,
    options, promptVersion, requestId, signal and returns a neutral
    response
11. Missing context yields `grounding:none` segment
12. `responseFormat: { type: "json" }` option is accepted at the type
    level (forward-compatible)
13. Response echoes provider/model/requestId and a deterministic
    `providerResponseId`
14. Identical inputs produce identical output (mock determinism)
15. All 8 `AIErrors.*` classifiers produce the correct code and
    retryable flag (8 sub-tests)
16. `toJSON()` redacts `cause` and never contains secret strings
17. Pre-aborted signal rejects with `AbortError`
18. Racing `AbortSignal.timeout(1)` rejects with `AbortError`
19. Returned object satisfies the `AIProvider` shape
20. Case-insensitive id parsing (`MOCK` → `mock`)
21. Whitespace trimming on `AI_PROVIDER`
22. All four new server modules contain `import "server-only"`

The existing DB-backed retrieval suite (`tests/knowledge-retrieval.test.ts`,
14 tests) was not modified and was exercised by the Gate Zero CI run
(`34936095236`). The AI contract tests are pure unit tests and do not
require Postgres.

## 7. Build / validation

All commands executed from a clean checkout:

| Command | Result |
|---|---|
| `npm ci` | PASS (427 packages; lockfile unchanged) |
| `npx vitest run tests/ai-provider-contract.test.ts` | PASS — **29/29** |
| `npm run typecheck` (`tsc --noEmit`) | PASS — clean, strict mode |
| `npm run lint` (`eslint .`) | PASS — 0 errors; 3 pre-existing warnings (font + 2 exhaustive-deps) unchanged from Gate Zero |
| `npm run build` (`next build`) | PASS — full production build, all routes compiled |

CI on PR #2 was re-run after this commit.

## 8. Rollback

The change is purely additive. To roll back:

```bash
git revert <commit-sha>
```

Because:

- No schema or data migration was introduced — no data to roll back.
- No new dependency was added — nothing to uninstall.
- No existing production code path imports the new modules yet
  (orchestration wiring is deferred to a later phase); removing the
  files is safe and leaves the rest of the application (JLPT/SRS/Kana/
  Kanji/quiz/health/retrieve endpoints) unaffected.

The CI workflow is not modified, so CI itself does not need to change
to roll back.

## 9. Next phases (out of scope here)

- 13.3C — Anthropic adapter (imports Anthropic SDK only inside
  `src/services/ai/providers/anthropic.ts`, factory case, credential
  validation).
- Streaming method (`streamChat` + async iterator) only when a UI call
  site requires it.
- JSON-mode response parsing in the adapter.
- Orchestration/service layer that calls `KnowledgeRetriever` then the
  provider.
- Tutor/chat API route and frontend wiring.
- Any additional providers (OpenAI, etc.) — each adds an id + adapter
  module + a factory case, never any branching based on key presence.
