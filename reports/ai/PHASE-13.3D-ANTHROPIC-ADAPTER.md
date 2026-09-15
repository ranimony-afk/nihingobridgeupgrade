# Phase 13.3D — Anthropic Provider Adapter

**Project:** NihongoBridge
**Repository:** `https://github.com/ranimony-afk/nihingobridgeupgrade`
**Branch:** `arena/gate-zero-ci-activation`
**Status:** COMPLETE — production Anthropic Messages API adapter behind the
existing canonical `AIProvider` port.
**Date:** 2026-09-15

## 1. Purpose

Phase 13.3D adds a working Anthropic adapter so the AI service can serve
real production traffic while honouring the Phase 13.3B/13.3C contracts:

- Application → `AIProvider` port → `createAIProvider()` factory →
  `AnthropicProvider` → Anthropic Messages API.
- No application code imports the Anthropic adapter directly. Only
  `src/services/ai/factory.ts` imports concrete adapters.
- Selection stays explicit via `AI_PROVIDER=anthropic`; missing/empty
  `AI_PROVIDER` still fails closed; there is no silent fallback to mock
  and no silent discovery of API keys.

## 2. Files changed

| File | Status | Purpose |
|---|---|---|
| `src/services/ai/providers/anthropic.ts` | Added | `AnthropicProvider` implementation over native `fetch` (no third-party SDK). |
| `src/services/ai/factory.ts` | Modified | Register the anthropic factory entry; validate credentials at construction. |
| `tests/ai-provider-contract.test.ts` | Modified | Replace 13.3B "anthropic not implemented" tests with 13.3D credential + registration tests; include anthropic.ts in server-only static check; add new env vars to snapshot. |
| `tests/ai-anthropic-adapter.test.ts` | Added | Dedicated adapter tests with an injected mock fetch — no network, no real key. |
| `reports/ai/PHASE-13.3D-ANTHROPIC-ADAPTER.md` | Added | This report. |

No other files changed. No new dependencies (no `@anthropic-ai/sdk` — the
adapter uses the runtime's native `fetch`, available in Node 18+ and all
Next.js server runtimes).

## 3. Dependency decision

`package.json` was inspected. Existing deps are Next 16, React 19, pg,
drizzle-orm, dotenv, server-only. No Anthropic SDK was present, and the
official SDK pulls in Node-specific streams, body encoders, and a number
of transitive deps that (a) increase cold-start size on serverless,
(b) duplicate what native `fetch` already gives us, and (c) make it
harder to keep the adapter strictly server-only via static analysis.

Decision: **minimal native-fetch adapter**. The adapter speaks the
Anthropic Messages API (`https://api.anthropic.com/v1/messages`,
`anthropic-version: 2023-06-01`) directly. All request shaping, error
mapping, timeout, and AbortSignal composition is implemented in ~480
lines of TS. The mock-fetch seam in the constructor (`fetchImpl?`) lets
tests exercise every branch without a network call.

If the project later adopts tool-use, streaming, or prompt-caching beta
headers, they can be added incrementally inside this single file
without re-introducing the SDK.

## 4. Configuration

Environment variables read by the adapter (all server-only, none
`NEXT_PUBLIC_*`):

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** for `AI_PROVIDER=anthropic` | — | Sent in `x-api-key` header only; constructor fails closed with AUTHENTICATION_ERROR if missing. |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-4-5` | Model id forwarded to the Messages API. |
| `ANTHROPIC_API_URL` | No | `https://api.anthropic.com/v1/messages` | Overridable for proxies / future regional endpoints. |
| `AI_REQUEST_TIMEOUT_MS` | No | `45000` | Per-request timeout. Non-positive/non-numeric → default used (except when passed explicitly via constructor, which throws CONFIGURATION_ERROR on invalid values). |

All are read at construction time. The constructor also accepts the
same fields as options (`apiKey`, `model`, `apiUrl`, `timeoutMs`,
`fetchImpl`) for tests and for future internal callers.

## 5. Request mapping

For a canonical `ChatRequest`, the adapter emits:

```http
POST <ANTHROPIC_API_URL> HTTP/1.1
Content-Type: application/json
x-api-key: <redacted>
anthropic-version: 2023-06-01
x-request-id: <request.requestId>
```

```json
{
  "model": "<resolved model>",
  "max_tokens": "<options.maxTokens ?? 1024>",
  "messages": [/* non-system turns, verbatim roles/content */],
  "system": "<request.system>\n\n<grounding-context block if present>",
  "temperature": "<if set>",
  "top_p": "<if set>",
  "metadata": { "user_id": "<requestId>" }
}
```

Design notes:

- **System prompt separation.** Anthropic separates `system` from
  `messages` and requires strict user/assistant alternation. The adapter
  strips any `role:"system"` entries from the messages array and merges
  them into the top-level `system` field.
- **Grounding context.** Retrieved knowledge is appended to the system
  prompt inside a tagged `<grounding-context chunks="…" estimated-tokens="…">…</grounding-context>` block. This preserves role alternation, makes
  grounding visible on every turn, and matches the documented RAG
  pattern for Messages.
- **JSON mode.** Anthropic has no dedicated JSON-mode toggle; the
  adapter appends a deterministic instruction ("Respond with valid JSON
  only. No preamble, no markdown fences, no trailing prose.") to the
  system prompt and then `JSON.parse`s the response. If parsing fails,
  the adapter throws `UPSTREAM_ERROR` (retryable) so orchestration can
  surface it — a model that ignores a strict-JSON instruction is a
  transient upstream failure, not an invalid client request. The parser
  also strips ```json…``` fences defensively.
- **Metadata.** `requestId` is sent as `metadata.user_id` AND as the
  `x-request-id` header so it shows up in both Anthropic-side logs and
  any intermediate proxy logs.

## 6. Response mapping

The adapter reads a standard Messages API response:

```json
{
  "id": "msg_…",
  "model": "claude-…",
  "stop_reason": "end_turn" | "max_tokens" | "stop_sequence" | "tool_use",
  "content": [{"type":"text","text":"…"}, …],
  "usage": {
    "input_tokens": 42,
    "output_tokens": 9,
    "cache_creation_input_tokens"?: 0,
    "cache_read_input_tokens"?: 0
  }
}
```

Mapped to canonical `ChatResponse`:

- `text` = concatenation of all `type:"text"` blocks.
- `json` = parsed JSON value when `responseFormat.type==="json"` (undefined otherwise).
- `provider` = `"anthropic"`, `model` = the model id returned upstream (fallback to configured model).
- `finishReason` mapped as:
  - `end_turn` / `stop_sequence` → `"stop"`
  - `max_tokens` → `"length"`
  - `tool_use` → `"tool_call"`
  - absent/unknown → `"unknown"`
- `usage.inputTokens/outputTokens/totalTokens` populated; prompt-caching
  breakdown surfaced in `usage.breakdown.cacheCreationInputTokens` /
  `cacheReadInputTokens` when present.
- `providerResponseId` = upstream `msg_…` id.
- `requestId` echoed.

Responses with zero text blocks and zero tool_use blocks are treated as
malformed → `UNKNOWN_ERROR`. Tool-use blocks are counted but not
interpreted (this phase does not issue tool calls; if they appear we
still return whatever text exists).

## 7. Error mapping

Non-2xx responses are parsed as the standard Anthropic error envelope
`{ type:"error", error:{ type, message } }`. Mapping (status codes and
Anthropic `error.type` strings):

| Status / type | Canonical code | Retryable |
|---|---|---|
| 401, 403, `authentication_error` | `AUTHENTICATION_ERROR` | no |
| 429, `rate_limit_error` | `RATE_LIMITED` | yes |
| 400, 422, `invalid_request_error` | `INVALID_REQUEST` | no |
| 502, 503, 504, `overloaded_error` | `PROVIDER_UNAVAILABLE` | yes |
| 500, `api_error`, any other 5xx | `UPSTREAM_ERROR` | yes |
| Non-JSON body, missing required fields, wrong shape | `UNKNOWN_ERROR` | no |
| Network/DNS/connection failures | `PROVIDER_UNAVAILABLE` | yes |
| Our per-request timeout fires | `TIMEOUT` | yes |
| Caller's AbortSignal fires | `DOMException("AbortError")` (pass-through) | — (intentional cancellation) |

Status-class checks (502/503/504) take precedence over error-type checks
so gateway responses that come without a JSON body still classify
correctly as UNAVAILABLE.

## 8. Timeout / cancellation

Every request gets a composed `AbortController` that fires when EITHER
(a) the caller's `request.signal` fires OR (b) `AI_REQUEST_TIMEOUT_MS`
elapses. Critically, the two cases are distinguished:

- If the controller fired because of the timer → throw
  `AIErrors.timeout(...)` (retryable=true) so orchestration can retry.
- If the controller fired because the caller aborted → surface a
  `DOMException("AbortError")` exactly like the rest of the contract,
  so route handlers can differentiate intentional cancellation.
- If the caller's signal is already aborted before `chat()` is called,
  the adapter throws immediately without making any network request.

Cleanup (removing the abort listener, clearing the timeout) happens in
every path (success, HTTP error, parse error, timeout, cancel, network
failure).

## 9. Safe logging

The adapter logs a single structured line prefixed `[ai:anthropic]` for
each of `request`, `response`, `error` events. Logging is suppressed in
`NODE_ENV=test` unless `AI_DEBUG_LOGS=1`. Log fields are strictly
limited to:

- `event`, `provider`, `model`, `requestId`, `promptVersion`
- On request: `groundingChunks`, `groundingTokens`, `messageCount`,
  `maxTokens`, `temperature`, `timeoutMs` (coarse shape only — no content).
- On response: `providerResponseId`, `finishReason`, `inputTokens`,
  `outputTokens`.
- On error: `code`, `status`, `anthropicErrorType`, `bodyPreview`.

`bodyPreview` is capped at 160 characters AND passed through a key
redactor that strips anything matching `sk-…`, `x-api-key: …`, or
`Bearer …` before it ever reaches `console.error/info`. The upstream
error `message` field is intentionally **not** logged — Anthropic
echoes request content on validation errors, and leaking user prompts
into logs is explicitly prohibited.

Additionally:

- `credentials: "omit"` is set on the fetch call so no ambient cookies
  leak to the API.
- `redirect: "error"` prevents credential-bearing redirects from being
  followed.
- `AIProviderError.toJSON()` (inherited from the contract) never
  includes `cause`, `stack`, or raw upstream bodies.
- The module starts with `import "server-only";` so client bundles
  fail at build time if anything accidentally imports it.
- No `NEXT_PUBLIC_*` variables are referenced anywhere in the module
  (static test enforces this).
- API keys never appear in thrown errors or in `toJSON()` output.

## 10. Factory changes

`src/services/ai/factory.ts`:

- Imports `AnthropicProvider` and registers `anthropic: () => new AnthropicProvider()`.
- `UNIMPLEMENTED_PROVIDERS` for anthropic is removed — the adapter now ships.
- `validateAndInstantiate` wraps construction in try/catch; if the
  adapter throws an `AIProviderError` during construction (e.g. missing
  API key → AUTHENTICATION_ERROR, bad timeout → CONFIGURATION_ERROR)
  that error surfaces directly; any other throw is wrapped as a
  CONFIGURATION_ERROR with a redacted cause.
- `getRegisteredProviderIds()` now includes `"anthropic"`.

## 11. Tests

### `tests/ai-provider-contract.test.ts` (51 passing)

Existing contract tests were updated to reflect the shipped adapter:

- "registered ids include exactly the built-ins" now asserts anthropic
  is registered.
- The old "anthropic id recognised but not implemented" block was
  replaced with three tests: (a) missing key → AUTHENTICATION_ERROR
  (fail-closed, no fallback), (b) present key → instance resolves with
  correct `id`/`model`, (c) anthropic is in the registered-ids list.
- ENV snapshot now captures `ANTHROPIC_MODEL`, `ANTHROPIC_API_URL`,
  `AI_REQUEST_TIMEOUT_MS`, `AI_DEBUG_LOGS`, `NODE_ENV`.
- "server-only boundary" static check now verifies
  `providers/anthropic.ts` imports `"server-only"`.

### `tests/ai-anthropic-adapter.test.ts` (25 passing, all unit, no network)

Uses an injected `fetchImpl` to return canned `Response` objects:

- Construction (5): missing key → AUTH; constructor options win over
  env; defaults; invalid constructor timeout → CONFIG; non-numeric env
  timeout falls back to default.
- Success path (7): HTTP method/headers/body shape, grounding-context
  injection into system, JSON mode instruction + parsed JSON,
  markdown-fence stripping, `max_tokens` → finishReason=`length`,
  cache_usage breakdown, JSON-mode non-JSON → UPSTREAM_ERROR.
- Error mapping (10): 401/403/429/400/422/500/529/503 matrix (each
  asserts code + retryable + status + provider), non-JSON HTML error
  body (502 → PROVIDER_UNAVAILABLE), malformed 200 JSON → UNKNOWN_ERROR,
  missing-id/content → UNKNOWN_ERROR, empty-content → UNKNOWN_ERROR.
- Timeout/cancellation (4): per-request timeout fires → TIMEOUT within
  budget; caller abort → DOMException AbortError (not TIMEOUT);
  pre-aborted signal short-circuits before fetch; network TypeError →
  PROVIDER_UNAVAILABLE.
- Safety (4): error logs redact API key, prompt content, system prompt,
  and upstream message; `toJSON()` does not leak causes; request sets
  `credentials:"omit"` and `redirect:"error"`; module source contains
  no `NEXT_PUBLIC_` references and contains `server-only`.

No test in this file makes a real HTTP call, and no real API key is
required. All 25 tests run in CI out of the box.

## 12. Validation

| Command | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`, strict) | clean |
| `npm run lint` (`eslint .`) | 0 errors (3 pre-existing warnings untouched — custom font, two react-hooks exhaustive-deps) |
| `npm run build` (`next build`) | pass (static + dynamic routes all compile; "server-only" protects the provider tree from client bundles) |
| `npx vitest run tests/ai-provider-contract.test.ts tests/ai-anthropic-adapter.test.ts` | **76/76 pass** (51 + 25) |

The existing Postgres-backed `tests/knowledge-retrieval.test.ts` was
not modified and remains intact; its CI run is unchanged from prior
phases (requires the Postgres service container defined in Gate Zero).

## 13. Explicitly NOT in this PR

- Streaming (`streamChat`) — deferred until a streaming UI exists.
- Tool-use / function calling — Messages API accepts tool definitions
  but orchestration does not need them yet.
- Anthropic SDK adoption — reviewed and rejected in favor of native fetch
  (smaller bundle, fewer transitive deps, easier static analysis).
- Automatic retries, circuit breakers, quotas, rate-limiting, or
  backoff — those belong to orchestration, not the transport.
- Tutor routes, chat persistence, UI, authentication, grammar
  correction, prompt injection defense — explicitly out of scope for
  this phase per the standing constraints.
- No `NEXT_PUBLIC_*` AI variables, no schema changes, no migrations, no
  new dependencies.

## 14. Rollback

Reverting this phase reverts only `src/services/ai/providers/anthropic.ts`,
the factory registration, and the two test files. The factory would
once again throw CONFIGURATION_ERROR for `AI_PROVIDER=anthropic`. No
call sites outside the factory import the Anthropic adapter directly,
so removing it cannot break application code. No data migration
involved.
