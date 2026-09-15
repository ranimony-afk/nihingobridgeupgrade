# Phase 13.3C — Deterministic Mock AI Provider

**Project:** NihongoBridge
**Repository:** `https://github.com/ranimony-afk/nihingobridgeupgrade`
**Branch:** `arena/gate-zero-ci-activation`
**Status:** COMPLETE — deterministic mock provider for tests, integration tests,
and explicitly-opted local development; production-safe (fail-closed when
unset, no silent fallback).
**Date:** 2026-09-15

## 1. Purpose

The mock provider makes the canonical `AIProvider` port testable without
network access or credentials. It is the only adapter shipped in
Phase 13.3. It is used for:

- **Unit tests** — constructor-injected scenarios exercise every error
  class the contract defines.
- **Integration tests** — `createAIProvider()` returns the mock when
  `AI_PROVIDER=mock`, including when tests drive the full route → service
  → provider path.
- **Local development** — developers can set `AI_PROVIDER=mock` to iterate
  on UI/orchestration without a vendor key.

The mock MUST NOT be selectable by accident in production. Fail-closed
behaviour is guaranteed by the 13.3B factory.

## 2. Files changed

| File | Status | Purpose |
|---|---|---|
| `src/services/ai/providers/mock.ts` | Modified (enhanced) | `MockAIProvider` implementation (deterministic, scenario-driven, AbortSignal-aware, latency-adjustable, JSON-mode capable). |
| `tests/ai-provider-contract.test.ts` | Modified (added 22 tests) | Behaviour, error-simulation, latency/timeout, JSON output, env-wiring, no-network invariants. |
| `reports/ai/PHASE-13.3C-MOCK-PROVIDER.md` | Added | This report. |

No other files were modified. No dependencies were added. The provider
port (`src/services/ai/provider.ts`) and factory (`src/services/ai/factory.ts`)
are unchanged at their signatures; 13.3C is purely a mock-adapter
enhancement.

## 3. Mock implementation

Location: `src/services/ai/providers/mock.ts`.

Module begins with `import "server-only";` so any client-bundle import is
a build error.

### Constructor

```ts
new MockAIProvider();                                  // default model
new MockAIProvider("custom-model");                    // back-compat string
new MockAIProvider({ model, scenario, latencyMs });    // full options
```

- `model` — returned in every `ChatResponse.model`. Defaults to
  `mock-deterministic-v1`, overridable via constructor option or
  `MOCK_AI_MODEL`.
- `scenario` — one of
  `success | invalid_request | auth_error | rate_limited | timeout |
  unavailable | upstream_error | unknown_error`. Defaults to `success`
  unless `MOCK_AI_SCENARIO` is set. Errors are thrown AFTER the artificial
  latency (so `timeout`/`AbortSignal.timeout` races behave correctly).
- `latencyMs` — artificial delay (ms). Defaults to `0` (one macrotask)
  unless `MOCK_AI_LATENCY_MS` is set. Used to simulate slow upstream
  responses for timeout/cancellation tests.

### Response shape (success)

For text mode (default):

```ts
{
  text: "[mock] | system:{set|none} | grounding:<N>chunks/<T>tok | q:<first-80-chars>",
  provider: "mock",
  model: <resolved model>,
  finishReason: "stop",
  usage: {
    inputTokens: <coarse estimate>,
    outputTokens: <coarse estimate>,
    totalTokens: inputTokens + outputTokens,
  },
  requestId: <echoed>,
  providerResponseId: `mock_<promptVersion>_<fnv1a(userText|grounding|format)>`,
}
```

For `options.responseFormat.type === "json"`:

- `text` is suffixed with ` | format:json` (deterministic marker).
- `json` is set to a deterministic object:
  ```ts
  {
    answer: "<final text>",
    grounded: <boolean>,
    chunkCount: <number>,
    provider: "mock",
    model: <model>,
    promptVersion: <request.promptVersion>,
  }
  ```
- Output tokens are recomputed against the marked-up text;
  `totalTokens` remains the correct sum.

### Determinism guarantees

- Same request → same `text`, same `providerResponseId`, same usage
  counts, same `json` payload.
- No `Math.random`, no `Date.now` in output generation, no file/network
  access.
- Response id uses FNV-1a over `(userText | grounding | responseFormat)`
  which is stable across processes.

Token estimator mirrors the estimator already used by
`KnowledgeRetriever`, so counts stay comparable across the retrieval →
provider path.

### Error simulation

When a scenario other than `success` is selected, the mock throws an
`AIProviderError` with the appropriate code and retryable flag AFTER the
configured latency (so AbortSignal.timeout can race with and pre-empt
the error):

| Scenario | Code | Retryable | Status |
|---|---|---|---|
| `invalid_request` | `INVALID_REQUEST` | no | 400 |
| `auth_error` | `AUTHENTICATION_ERROR` | no | 401 |
| `rate_limited` | `RATE_LIMITED` | yes | 429 |
| `timeout` | `TIMEOUT` | yes | — |
| `unavailable` | `PROVIDER_UNAVAILABLE` | yes | 503 |
| `upstream_error` | `UPSTREAM_ERROR` | yes | 500 |
| `unknown_error` | `UNKNOWN_ERROR` | no | — |

When the caller's `AbortSignal` fires before or during the latency
window, the mock throws a `DOMException("AbortError")` (matching the
contract's expectation) and NEVER resolves, exactly as a real HTTP
adapter would.

### Environment overrides (for integration tests)

| Variable | Effect |
|---|---|
| `MOCK_AI_MODEL` | Overrides the model id when constructed via `createAIProvider()`. |
| `MOCK_AI_SCENARIO` | One of the scenario names above; invalid values fall back to `success` (not fail). Used by integration tests that cannot inject mocks via constructor. |
| `MOCK_AI_LATENCY_MS` | Artificial latency in ms; useful for testing AbortSignal.timeout wiring through orchestration. |

## 4. Safety / production isolation

- **Explicit selection only.** The mock is returned only when
  `AI_PROVIDER=mock`. The 13.3B factory rejects unset, empty, and
  unknown values with `CONFIGURATION_ERROR`. There is no codepath that
  silently returns a mock when a production provider is requested.
- **No external calls.** The mock contains no `fetch`, no `http`, no SDK
  imports; this is enforced by a static source-content test.
- **Server-only.** `import "server-only";` guards the module.
- **No secrets.** The mock never reads `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, or any credential. Those env vars appear in
  `tests/ai-provider-contract.test.ts` only as dummy strings to prove
  that they do NOT trigger any provider selection.
- **No client bundle.** Because of `"server-only"`, any Client Component
  that imports the mock (or anything from `@/services/ai`) will fail
  `next build`. Verified by a passing production build.

## 5. Tests added/updated

Total tests in `tests/ai-provider-contract.test.ts`: **49 passing**.

New 13.3C coverage (22 tests):

1. `totalTokens === inputTokens + outputTokens`
2. `providerResponseId` and `text` and `usage` are stable across calls
3. Custom model via constructor options
4. Back-compat: constructor accepts a plain model string
5. Structured JSON output when `responseFormat.type === "json"`
6. `json` is `undefined` for plain-text requests
7. `MOCK_AI_MODEL` env selects model through the factory
8. Per-scenario error throws (7 scenarios × 1 test) → correct code,
   retryable flag, provider id, status
9. `MOCK_AI_SCENARIO=rate_limited` triggers through the factory
10. Invalid `MOCK_AI_SCENARIO` value falls back to success (graceful)
11. `MOCK_AI_LATENCY_MS` + `AbortSignal.timeout` → rejects with AbortError
12. Constructor `latencyMs: 0` with no signal resolves
13. Positive latency completes when signal is not aborted
14. Static source check: mock module has no fetch/HTTP/SDK/API-key strings
    and contains `server-only`

Existing 13.3B contract tests (27) continue to pass unchanged.

## 6. Validation

All commands executed from the repository root after changes:

| Command | Result |
|---|---|
| `npm ci` | Pass (no dependency churn) |
| `npx vitest run tests/ai-provider-contract.test.ts` | **49/49 pass** |
| `npm run typecheck` (`tsc --noEmit`, strict) | Pass |
| `npm run lint` (`eslint .`) | 0 errors / 3 pre-existing warnings (unchanged) |
| `npm run build` (`next build`) | Pass |

Database, migrations, schema, drizzle config, `.env.example`, CI workflow,
and all existing application source are byte-identical to the prior
commit (only mock + tests + report were touched).

## 7. Rollback

Reverting the single Phase 13.3C commit is safe: the AI provider port
remains intact, the factory still resolves `mock` correctly via the
previous `MockAIProvider`, and no production codepath depends on the
new scenario/latency/JSON features (orchestration has not been wired
yet). No data migration is involved.

## 8. Deferred

Streaming (`streamChat`) is not added in this phase because no call site
requires it and streaming semantics (backpressure, partial tokens,
abort) warrant their own interface extension when a real adapter and
tutor UI land. The existing `AbortSignal`-aware `chat()` method is
sufficient for request/response generation, which is the pattern used
for the first tutor answers.

Real Anthropic/OpenAI adapters belong to 13.3D+.
