# Phase 13.4B — AI Tutor API Contract

**Status:** COMPLETE  
**Branch:** `arena/gate-zero-ci-activation`  
**Head commit:** see PR #4 (incremental, built on top of Phase 13.4A commit `1815165`)  
**Route:** `POST /api/ai/answer`  
**Test:** `tests/api-ai-answer.test.ts` (20 new tests, all green)

---

## 1. What this phase delivers

Phase 13.4B adds the first HTTP-facing contract for the Japanese learning
assistant's AI tutor: a single provider-neutral endpoint that validates
client input, invokes the `GroundedAnswerService` (Phase 13.4A), and
returns a normalized response that is safe to ship to the browser.

It is the boundary between untrusted client input and the server-only AI
stack, and therefore the layer responsible for:

* enforcing request shape and size limits;
* translating server-side errors into safe, stable HTTP codes;
* scrubbing any provider secrets, upstream error text, or internal
  stack details from the wire payload;
* explicitly signalling that the endpoint is **pre-authentication** — it
  must not be misread as an authenticated user surface;
* remaining strictly stateless (no conversation persistence in this
  phase).

## 2. Files added / modified

| File | Change |
|---|---|
| `src/app/api/ai/answer/route.ts` | **NEW.** App Router route handler for `POST /api/ai/answer`. |
| `tests/api-ai-answer.test.ts` | **NEW.** 20 tests covering method rejection, validation, success shape, provider-error mapping, and secret-leak guards. |

No existing AI server-only modules are changed. The route imports the
already-vetted service factory (`@/services/ai/serviceFactory`) and
consumes the published interface from `@/services/ai`.

## 3. Design decisions

### 3.1 Conformance with existing API conventions

The route was implemented by reading three existing App Router handlers
(`/api/questions`, `/api/ai/retrieve`, `/api/srs/sync/push`) and matching
their shape exactly:

* App Router `route.ts` with `export const dynamic = "force-dynamic"`.
* `NextRequest` / `NextResponse` from `"next/server"`.
* JSON envelope `{ success: true, data: … }` on success and
  `{ success: false, error: { code, message, … } }` on failure.
* `console.error` for server-side logging only; no internal detail in
  client-visible messages.
* No custom response wrappers or middleware frameworks introduced.

### 3.2 HTTP surface

* **Method:** only `POST` is accepted. `GET / PUT / PATCH / DELETE` all
  return `405 METHOD_NOT_ALLOWED` with an `Allow: POST` header.
* **Content-Type:** JSON required. Non-JSON bodies and malformed JSON
  return `400 VALIDATION_ERROR`.
* **Cache-Control:** `no-store, no-cache, must-revalidate` on every
  response so that answers — which may depend on per-request grounding
  and user identity (when auth lands) — are never cached by shared
  caches.

### 3.3 Request schema (validated server-side)

| Field | Type | Required | Constraints |
|---|---|---|---|
| `query` | string | yes | trimmed, 1–1000 characters |
| `jlptLevel` | enum | no | one of `N5, N4, N3, N2, N1` |
| `domain` | enum | no | one of `dictionary, kanji, grammar, sentence` |
| `entityId` | string | no | requires `domain` to be set; used for entity-specific lookups |
| `locale` | enum | no | `en` (default) or `ja` |
| `requestId` | string | no | client correlation id; if omitted, a server-side id is generated (`ai_<nanoid>`) |

Extra fields are ignored. In particular, **any client-supplied
`userId` is dropped** and never forwarded to the service. Authentication
is not implemented yet; the endpoint must not be tricked into trusting
a user id that came over the wire.

### 3.4 Response shape (success)

```ts
{
  success: true,
  data: {
    answer: string,                              // tutor-authored answer, grounded
    citations: GroundedCitation[],               // in-line citation markers
    knowledgeRefs: KnowledgeRef[],               // knowledge entries referenced
    sources: Source[],                           // corpus sources (with license/url)
    grounded: boolean,                           // were grounding chunks present?
    chunkCount: number,                          // how many chunks were retrieved
    provider: { id; model; responseId; finishReason },
    usage:    { inputTokens; outputTokens; totalTokens },   // safe fields only
    promptVersion: string,                       // from AI_PROMPT_VERSION at call time
    requestId: string,                           // echoed or generated
    locale: "en" | "ja",
    queryType: "japanese" | "english" | "mixed",
  }
}
```

The shape intentionally omits raw provider metadata (raw HTTP status,
upstream request ids, response headers, configuration) and only
exposes the bounded set needed by the client to render the answer and
attribute sources.

### 3.5 Error mapping

All errors thrown by `createGroundedAnswerService().generateGroundedAnswer()`
are intercepted. `AIProviderError` codes are mapped to stable HTTP
status codes with **generic, user-safe messages** — the original
upstream `message` is never forwarded:

| AIProviderError code | HTTP status | retryable | Client message |
|---|---|---|---|
| `RATE_LIMITED` | 429 | true | "The AI tutor is busy right now. Please try again in a moment." |
| `TIMEOUT` | 504 | true | "The AI tutor took too long to respond. Please try again." |
| `PROVIDER_UNAVAILABLE` | 503 | true | "The AI tutor is temporarily unavailable. Please try again shortly." |
| `UPSTREAM` | 502 | true | "The AI tutor returned an invalid response. Please try again." |
| `CONFIGURATION` | 500 | false | "The AI tutor is misconfigured." |
| `UNKNOWN` / other | 500 | false | "An unexpected error occurred." |

Non-`AIProviderError` exceptions (database errors, retrieval bugs,
unexpected throws) are caught and returned as `500 INTERNAL_ERROR` with
the same generic message. The error is logged server-side with the
`requestId` for triage but nothing from the thrown `message` is
forwarded, which prevents leakage of API-key-shaped strings, connection
strings, stack frames, or upstream vendor prose.

### 3.6 Pre-authentication posture

The route begins with an explicit banner comment:

```ts
/**
 * ⚠️ DEVELOPMENT / PRE-AUTHENTICATION ENDPOINT ⚠️
 *
 * Authentication is NOT implemented yet. This endpoint is exposed for
 * local development and UI wiring only. There is NO session, NO rate
 * limit per user, and NO authorization. Do NOT treat any client-supplied
 * userId as authenticated. Conversation history is NOT persisted.
 *
 * When Phase 14 auth lands, this handler must be gated behind the
 * session middleware before production rollout.
 */
```

Concretely:

* No auth checks are performed (and no fake auth is performed).
* Client-supplied `userId` is explicitly stripped before service call.
* Response never returns anything user-scoped that could be spoofed.
* No conversation rows, chat logs, or feedback are written to the
  database. Each call is stateless from the API's perspective.

### 3.7 Secret scrubbing

* Provider API keys (`ANTHROPIC_API_KEY`, etc.) are never read or
  echoed; they remain inside the server-only provider module.
* The error-mapping layer deliberately discards the original error
  `message` for provider errors and replaces it with a fixed string.
* Log output (`[api/ai/answer] request failed: …`) includes only
  `requestId` and the mapped `code`, never the thrown message or any
  provider response body.
* The raw fetch Response from the provider is not returned.

## 4. Tests (20 new, all passing)

Location: `tests/api-ai-answer.test.ts`. The test file mocks the service
factory (`vi.mock("@/services/ai/serviceFactory")`) and injects a stub
service, so the route can be exercised without any real provider or
database. Vitest stubs `server-only` via the existing
`tests/mocks/server-only.ts` shim.

Coverage matrix:

| Area | Tests |
|---|---|
| Method / content handling | GET → 405; non-JSON body → 400; malformed JSON → 400 |
| Validation | empty query; missing query; oversized query (>1000 chars); invalid JLPT level; invalid domain; `entityId` without `domain`; invalid locale; non-string query |
| Success shape | full 200 response with citations/knowledgeRefs/sources/provenance/usage/promptVersion/requestId; client-supplied `userId` is NOT forwarded; server-generated `requestId` when client omits; valid entity lookup forwards domain+entityId |
| Provider error mapping | `RATE_LIMITED` → 429; `TIMEOUT` → 504; `PROVIDER_UNAVAILABLE` → 503; `UPSTREAM` → 502; unexpected Error → 500 (no leak of `sk-…` / secret message); configuration failure during factory construction → 500 |
| Retrieval failure | database/retrieval Error → 500 INTERNAL_ERROR with generic message (no `connection refused` leak) |

Result:

```
Test Files  1 passed (1)
     Tests  20 passed (20)
```

## 5. Gate verification

All four standard gate commands executed against the post-13.4B tree:

| Command | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | **PASS** — no errors. |
| `npm run lint` (`eslint .`) | **PASS** — 0 errors (3 pre-existing warnings in unrelated files, unchanged from 13.4A). |
| `npm run build` (`next build`) | **PASS** — `/api/ai/answer` registered as a dynamic (ƒ) route alongside `/api/ai/retrieve`. |
| `npx vitest run` | **121 passed, 14 skipped.** One pre-existing test file (`tests/knowledge-retrieval.test.ts`) requires a live Postgres and fails in the sandbox with `ECONNREFUSED 127.0.0.1:5432`; this is environmental, not a regression (same state as at Phase 13.4A). All AI-domain tests, including the new 20 API tests, are green. |

Aggregate AI-module test count is now **121** (was 101 at end of 13.4A;
+20 new route tests).

## 6. Safety / threat-model review

| Risk | Mitigation in this layer |
|---|---|
| Client forges `userId` to impersonate | Field stripped before service call; dev banner documents pre-auth posture; no user-scoped data returned. |
| Oversized requests exhaust memory / cost | `query` capped at 1000 characters; other free-text fields validated for type & enum. |
| Provider error message leaks API key or internal text | `AIProviderError` messages are replaced by fixed strings; generic errors also replaced; `console.error` logs only `requestId` + code. |
| Conversation persistence is accidentally added | Handler is stateless; no DB writes; response is the only side effect. (Service layer also performs no writes — asserted in 13.4A tests.) |
| Cached answers leak across users | `Cache-Control: no-store` set on every response. |
| Method smuggling (GET with body, etc.) | Only POST runs the handler; other verbs 405 with `Allow: POST`. |
| Prompt-version drift | Response echoes `promptVersion` actually used by the service, sourced from `AI_PROMPT_VERSION` at call time. |

## 7. Out of scope (and why)

* **Authentication / authorization.** Deferred to Phase 14. The dev
  banner and `userId` stripping make the current posture explicit
  rather than implicit.
* **Conversation history / multi-turn.** The 13.4A service contract
  already accepts optional `conversationId`/`history`, but the route
  does not expose or persist it yet — it will be added when auth and
  storage land.
* **Streaming responses.** The current contract is JSON request / JSON
  response. Streaming requires a different content-type and
  backpressure story; it will be evaluated when long-form answers are
  needed.
* **Per-user rate limiting.** Belongs in front of the route (edge
  middleware or gateway) once auth lands; not embedded here.
* **Client SDK / React hook.** That is a later UI-layer concern; the
  wire contract is deliberately small and stable.

## 8. What's next (Phase 13.4C onward)

The HTTP boundary is now in place. Next phases can safely:

1. Add authenticated session gating in front of the route (Phase 14).
2. Wire up the first client-side UI (e.g. a "Ask Hana" panel on kanji /
   grammar pages) that POSTs to `/api/ai/answer` and renders the
   answer + citations.
3. Add multi-turn conversation support by extending the request schema
   with a server-issued `conversationId` and persisting turns behind
   auth.
4. Add structured answer types (e.g. `kind: "definition" | "example" |
   "breakdown"`) if the UI needs them.

Each of those changes can be made without modifying the safety
properties established here: validation, error sanitization, stateless
handling, and the bounded response envelope.
