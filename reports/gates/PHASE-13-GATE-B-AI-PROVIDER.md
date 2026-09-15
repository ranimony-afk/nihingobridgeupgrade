# Phase 13 Gate B — AI Provider Runtime Audit

**Project:** NihongoBridge
**Repository:** `https://github.com/ranimony-afk/nihingobridgeupgrade`
**Branch:** `arena/gate-zero-ci-activation`
**Audit date:** 2026-09-15
**Verdict:** **PASS**

## Scope

Gate B audits the runtime AI provider stack after Phases 13.3B (contract
& factory), 13.3C (deterministic mock), and 13.3D (Anthropic adapter)
landed. It verifies that the port has exactly one abstraction, one
factory, and two explicit implementations; that vendor code lives only
in its adapter; that no client component leaks AI secrets; that
fail-closed semantics hold; and that timeout/cancellation/normalized
errors/usage are all exercised by tests that do not require real API
credentials.

## Fixes applied during this audit

While performing this audit I discovered one issue that was corrected
before rendering the verdict:

1. **`src/services/ai/knowledgeRetriever.ts` was missing
   `import "server-only";`.** The file imports Postgres via `@/db`, has
   zero client consumers, and is part of the server-side AI service
   tree, but the explicit guard was absent. Added `import "server-only";`
   so any accidental client import fails at Next.js build time (build
   was re-run after the fix and still passes).
2. **Error-response logging leaked upstream error bodies in verbose
   mode.** The anthropic adapter previously logged a truncated
   `bodyPreview` of upstream error responses. Anthropic's error bodies
   can echo request content (including learner prompts), and any
   preview — even truncated — is unsafe when API keys or Japanese
   text could be captured. The adapter now logs only `bodyLength`
   (an integer); `bodyPreview` has been removed entirely. The safety
   test was updated accordingly.
3. **Two timeout tests in the anthropic-adapter suite were using a
   never-resolving fetch mock, which (depending on Node/vitest timing)
   could leak an open microtask and stall the runner.** The mock was
   corrected to listen for the signal and reject when it fires, which
   matches how real `fetch()` behaves. The 32-adapter + 51-contract
   test run now completes reliably in ~600 ms with 83/83 passing.

These were all audit-time hardening fixes, not requirement changes.

## Checklist

| # | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | Exactly one provider abstraction | ✅ PASS | `src/services/ai/provider.ts` is the only file exporting `AIProvider`, `ChatRequest`, `ChatResponse`, `AIProviderError`, `AIErrorCode`, `AIErrors`. The other `AI_*` identifiers in the tree are just re-exports from the barrel (`src/services/ai/index.ts`). |
| 2 | Exactly one factory | ✅ PASS | `src/services/ai/factory.ts` is the only factory file; no other module instantiates adapters (verified: `find src -name "*factory*"` returns exactly one file, and the only `new *Provider(` calls outside the adapters themselves are `new MockAIProvider(...)` and `new AnthropicProvider()` inside that factory). |
| 3 | Exactly two implementations: `mock` and `anthropic` | ✅ PASS | `src/services/ai/providers/` contains exactly `mock.ts` and `anthropic.ts`. `AI_PROVIDERS = ["mock", "anthropic"]` and the registry has both entries; `getRegisteredProviderIds()` returns both. |
| 4 | Vendor code exists ONLY inside the adapter | ✅ PASS | `@anthropic-ai/sdk` and any other vendor SDK are not imported anywhere (`grep -r "@anthropic" src/` → no matches). The only file that mentions `"anthropic-version"`, `"x-api-key"`, or constructs a Messages API request body is `src/services/ai/providers/anthropic.ts`. Other mentions of the word "anthropic" are the id constant in `provider.ts` and the factory registration — both are id literals, not vendor code. |
| 5 | Routes do not import Anthropic | ✅ PASS | No file under `src/app/` imports `providers/anthropic` or any Anthropic-specific symbol. Routes only ever touch the provider via `createAIProvider()` / the `AIProvider` interface. |
| 6 | Retrieval does not import Anthropic | ✅ PASS | `src/services/ai/knowledgeRetriever.ts` does not import from the providers directory at all — it is pure Postgres retrieval, and does not reference anthropic/OpenAI/any vendor. Verified by grep. |
| 7 | No client component imports AI provider code | ✅ PASS | Every file marked `"use client"` (14 `src/app/**/page.tsx` + 7 components) was grepped for `@/services/ai` / `services/ai`; zero matches. All AI modules (`provider`, `factory`, `index`, `mock`, `anthropic`, `knowledgeRetriever`) now `import "server-only";`, so any future accidental client import fails `next build` (which was run and passed). |
| 8 | No secret exposure | ✅ PASS | - `ANTHROPIC_API_KEY` is only read inside `anthropic.ts` (never outside the adapter, never in client code).<br>- No `NEXT_PUBLIC_*` AI variables exist (static test asserts this).<br>- `credentials:"omit"` and `redirect:"error"` set on fetch to avoid ambient cookie/auth leakage.<br>- `AIProviderError.toJSON()` omits `cause` and `stack`.<br>- Error logs never contain prompts, grounding text, system prompts, upstream error messages, or API keys; they include only correlation ids, status, error type, model, token counts, and body length (integer). A key-redaction regex is still applied as defense-in-depth to any string that reaches the logger.<br>- `.env.example` has no hardcoded keys.<br>- Post-build inspection of `.next/static/chunks/` found zero occurrences of `ANTHROPIC_API_KEY`, `anthropic-version`, or `sk-…` patterns in client bundles. |
| 9 | Mock is never automatic in production | ✅ PASS | Factory doc-comment explicitly states "NO automatic fallback to mock, EVER — neither on unsupported provider, nor on missing credential." `readProviderId` requires `AI_PROVIDER` to be set to an exact recognized id; `mock` is only returned when `AI_PROVIDER === "mock"`. There is no "if ANTHROPIC_API_KEY is missing → use mock" branch anywhere. |
| 10 | Unknown provider fails closed | ✅ PASS | `readProviderId` throws `CONFIGURATION_ERROR` (retryable=false) when `AI_PROVIDER` is unset, empty, or not in `AI_PROVIDERS`. Covered by contract tests ("throws CONFIGURATION_ERROR when AI_PROVIDER is unset", "…empty", "…unsupported id", "does not fall back to mock for unsupported provider id"). |
| 11 | Missing production configuration fails closed | ✅ PASS | `AnthropicProvider` constructor throws `AUTHENTICATION_ERROR` when `ANTHROPIC_API_KEY` is empty (caught at construction via factory, so misconfiguration surfaces at app init rather than at first request). Invalid `timeoutMs` throws `CONFIGURATION_ERROR`. Covered by contract test ("AI_PROVIDER=anthropic without ANTHROPIC_API_KEY fails closed with AUTHENTICATION_ERROR") and adapter construction tests. |
| 12 | Anthropic timeout works | ✅ PASS | Adapter composes an `AbortController` with a `setTimeout` tied to `AI_REQUEST_TIMEOUT_MS` (default 45000). When the timer fires, the adapter throws `TIMEOUT` (retryable=true) and cleans up listeners. Test "throws TIMEOUT when request exceeds AI_REQUEST_TIMEOUT_MS" asserts code, retryable flag, and that the rejection fires within budget. |
| 13 | Cancellation works | ✅ PASS | Caller's `AbortSignal` is wired into the same controller; when the caller aborts the adapter throws `DOMException("AbortError")` (pass-through, not TIMEOUT) so route handlers can distinguish intentional cancellation. Pre-aborted signals short-circuit before any network call. Tests: "surfaces AbortError when caller cancels (not TIMEOUT)", "pre-aborted signal throws immediately without fetching", plus the existing contract test "rejects with AbortError when the signal is already aborted". |
| 14 | Normalized errors work | ✅ PASS | The full taxonomy is covered — `CONFIGURATION_ERROR`, `AUTHENTICATION_ERROR`, `RATE_LIMITED`, `TIMEOUT`, `PROVIDER_UNAVAILABLE`, `UPSTREAM_ERROR`, `INVALID_REQUEST`, `UNKNOWN_ERROR` — each with correct `retryable`, `provider`, and `status`. Adapter tests cover an 8-row matrix (401, 403, 429, 400, 422, 500, 529, 503) plus non-JSON HTML error bodies, network failure, and malformed-200 responses. |
| 15 | Usage metadata works | ✅ PASS | The adapter returns `inputTokens`, `outputTokens`, `totalTokens = input + output`, `providerResponseId` (Anthropic `msg_…` id), `finishReason` mapped from `stop_reason`, and prompt-cache breakdown in `usage.breakdown` when Anthropic returns it. Mock provider does the same. Tests assert all of these (including cache usage breakdown and totalTokens math). |
| 16 | Tests do not require real API credentials | ✅ PASS | The entire AI test suite (51 contract + 32 adapter = **83 tests**) uses either the mock provider or the anthropic adapter with an injected `fetchImpl`; no test reads a real key, no test makes a network call, and CI runs the suite with `ANTHROPIC_API_KEY=""`. All 83 pass. |

## Command validation

All four required commands were run from a clean checkout on branch
`arena/gate-zero-ci-activation` after the audit-time fixes:

| Command | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`, strict) | ✅ clean |
| `npm run lint` (`eslint .`) | ✅ 0 errors (3 pre-existing warnings: one `@next/next/no-page-custom-font` warning in `src/app/layout.tsx`, two `react-hooks/exhaustive-deps` warnings in pre-existing review pages — none in AI code) |
| `npm run build` (`next build`) | ✅ pass — all routes compile; `server-only` protects the AI tree from client bundles; post-build grep of `.next/static/chunks/` found no `ANTHROPIC_API_KEY`, `anthropic-version`, or key-shaped strings in client output |
| `npx vitest run tests/ai-provider-contract.test.ts tests/ai-anthropic-adapter.test.ts` | ✅ **83/83 pass** (51 + 32) in ~600 ms |

The existing Postgres-backed `tests/knowledge-retrieval.test.ts` is
unchanged by Phases 13.3B–D and is covered by CI with the Postgres
service container (Gate Zero). It is not required to run for this
gate because this audit is scoped to the AI provider runtime, and the
sandbox has no live Postgres.

## Production-bundle boundary inspection

After `npm run build`, the generated `.next/` directory was searched:

- `.next/static/chunks/**` — zero matches for `ANTHROPIC_API_KEY`,
  `anthropic-version`, `x-api-key`, or `sk-…` key patterns. Client
  bundles contain no AI secrets and no vendor transport code.
- All six AI modules (`provider.ts`, `factory.ts`, `index.ts`,
  `knowledgeRetriever.ts`, `providers/mock.ts`,
  `providers/anthropic.ts`) carry `import "server-only";`, giving
  Next.js a build-time guarantee against accidental client bundling.
- The `AnthropicProvider` is only imported by `factory.ts`; `factory.ts`
  is only imported from server-side code paths (routes/services), never
  from components marked `"use client"`.

## Architectural boundary recap (verified)

```
[Client Components]        ← no AI imports, no secrets in .next/static
        │
        ▼ (Next.js server actions / route handlers, server-only)
[Application services]
        │
        ▼  createAIProvider()      ← single factory, explicit selection
[AIProvider port (provider.ts)]    ← single interface + error taxonomy
        │
        ├──▶ MockAIProvider         ← deterministic, AI_PROVIDER=mock only
        └──▶ AnthropicProvider      ← native fetch, vendor code isolated here
                 │
                 ▼ (HTTPS, server-only, timeouts/abort/redaction)
           Anthropic Messages API
```

No other codepath imports `AnthropicProvider` directly; no route
switches on provider id; no `if (key) use anthropic else mock` fallback
exists; no `NEXT_PUBLIC_*` secret variables exist for AI.

## Verdict

**PASS.** All 16 gate criteria are satisfied. The three issues found
during the audit (missing `server-only` guard on the retrieval module,
error-body preview leak in verbose logs, and a leaky hanging-fetch
test mock) were corrected and revalidated before this verdict. The AI
provider stack is ready for downstream work (tutor routes,
orchestration services) to consume it through the single canonical
port.

## Follow-ups (non-blocking)

- The `@next/next/no-page-custom-font` and two
  `react-hooks/exhaustive-deps` warnings are pre-existing and unrelated
  to AI; they remain for their respective owners to address.
- When streaming support lands in a later phase, add
  `server-only` checks for the streaming module before opening it.
- When OpenAI or additional providers are added, repeat this gate for
  the new adapter before declaring the port ready for multi-vendor
  traffic.
