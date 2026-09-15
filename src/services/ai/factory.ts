/**
 * createAIProvider — canonical, explicit provider resolution.
 *
 * Phase 13.3B (contract) + 13.3C (mock) + 13.3D (Anthropic). This is
 * the ONLY module permitted to import concrete provider adapters.
 * Orchestration, services, and routes may only import the AIProvider
 * interface and this factory — never vendor adapters directly.
 *
 * Resolution rules:
 *   - AI_PROVIDER MUST be set.
 *   - If AI_PROVIDER is an unrecognised id, fail CLOSED (CONFIGURATION_ERROR).
 *   - If a production provider is selected but its required credential is
 *     missing, fail CLOSED (AUTHENTICATION_ERROR) at construction time
 *     so misconfiguration is caught at startup, not at first request.
 *   - "mock" is selected explicitly via AI_PROVIDER=mock. There is NO
 *     automatic fallback to mock, EVER — neither on unsupported provider,
 *     nor on missing credential, nor in production when AI_PROVIDER is
 *     unset.
 */

import "server-only";

import {
  AI_PROVIDERS,
  AIErrors,
  AIProviderError,
} from "@/services/ai/provider";
import type { AIProvider, AIProviderId } from "@/services/ai/provider";
import { MockAIProvider } from "@/services/ai/providers/mock";
import { AnthropicProvider } from "@/services/ai/providers/anthropic";

/**
 * Map of registered providers. Adding a real adapter means adding an
 * entry here (and nowhere else) after its module exists in
 * src/services/ai/providers/.
 *
 * Each entry is a factory function that constructs the adapter. The
 * adapter constructor is responsible for failing closed when required
 * configuration is missing.
 */
const REGISTRY: Record<AIProviderId, () => AIProvider> = {
  mock: () => {
    const model = process.env.MOCK_AI_MODEL || "mock-deterministic-v1";
    return new MockAIProvider(model);
  },
  anthropic: () => new AnthropicProvider(),
};

/**
 * Provider ids recognised by the contract but whose adapter is not yet
 * implemented. Entries here fail closed with a clear message.
 */
const UNIMPLEMENTED_PROVIDERS: Partial<Record<AIProviderId, string>> = {};

function readProviderId(): AIProviderId {
  const raw = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (!raw) {
    throw AIErrors.configuration(
      "AI_PROVIDER is not set. Configure it explicitly (e.g. AI_PROVIDER=mock for local/tests, AI_PROVIDER=anthropic for production).",
    );
  }
  const recognized = [...AI_PROVIDERS] as string[];
  if (!recognized.includes(raw)) {
    throw AIErrors.configuration(
      `Unsupported AI_PROVIDER "${raw}". Supported values: ${recognized.join(", ")}.`,
    );
  }
  return raw as AIProviderId;
}

/**
 * Validate provider-specific required environment and implementation
 * status. Each adapter performs its own credential validation in its
 * constructor; this wrapper simply translates provider-construction
 * failures into AIProviderErrors when necessary and ensures no silent
 * fallback can ever occur.
 */
function validateAndInstantiate(id: AIProviderId): AIProvider {
  const unimpl = UNIMPLEMENTED_PROVIDERS[id];
  if (unimpl) {
    throw AIErrors.configuration(unimpl, { provider: id });
  }

  const factory = REGISTRY[id];
  if (!factory) {
    throw AIErrors.configuration(
      `Provider "${id}" is declared in AI_PROVIDERS but has no factory registration.`,
      { provider: id },
    );
  }

  try {
    return factory();
  } catch (err) {
    // If the constructor already threw an AIProviderError, surface it.
    if (err instanceof AIProviderError) throw err;
    // Otherwise wrap it so misconfiguration never leaks as a raw error.
    throw AIErrors.configuration(
      `Failed to initialise provider "${id}": ${
        err instanceof Error ? err.message : "unknown error"
      }`,
      { provider: id, cause: err },
    );
  }
}

/**
 * Create a ready-to-use AI provider based EXPLICITLY on AI_PROVIDER.
 *
 * Throws AIProviderError on misconfiguration. Never returns null or
 * silently falls back to another provider.
 */
export function createAIProvider(): AIProvider {
  const id = readProviderId();
  return validateAndInstantiate(id);
}

/**
 * Read-only view of registered provider ids, primarily for tests and
 * diagnostics. Exposed so tests don't need to import the registry directly.
 */
export function getRegisteredProviderIds(): readonly AIProviderId[] {
  return Object.keys(REGISTRY) as AIProviderId[];
}
