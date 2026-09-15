/**
 * createAIProvider — canonical, explicit provider resolution.
 *
 * Phase 13.3B. This is the ONLY module permitted to import concrete
 * provider adapters. Orchestration, services, and routes may only import
 * the AIProvider interface and this factory — never vendor adapters
 * directly.
 *
 * Resolution rules:
 *   - AI_PROVIDER MUST be set.
 *   - If AI_PROVIDER is an unrecognised id, fail CLOSED (CONFIGURATION_ERROR).
 *   - If a production provider is selected but its required credential is
 *     missing, fail CLOSED (AUTHENTICATION_ERROR).
 *   - "mock" is selected explicitly via AI_PROVIDER=mock. There is NO
 *     automatic fallback to mock, EVER — neither on unsupported provider,
 *     nor on missing credential, nor in production when AI_PROVIDER is
 *     unset.
 */

import "server-only";

import {
  AI_PROVIDERS,
  AIErrors,
} from "@/services/ai/provider";
import type { AIProvider, AIProviderId } from "@/services/ai/provider";
import { MockAIProvider } from "@/services/ai/providers/mock";

/**
 * Map of registered providers. When a real Anthropic/OpenAI adapter lands
 * in a later phase, it gets added here (and nowhere else) after its
 * adapter module exists in src/services/ai/providers/.
 *
 * Recognized-but-not-implemented provider ids (e.g. "anthropic" in 13.3B)
 * are listed in AI_PROVIDERS but NOT in this registry; createAIProvider
 * throws a specific CONFIGURATION_ERROR instead of silently falling back.
 */
const REGISTRY: Partial<Record<AIProviderId, () => AIProvider>> = {
  mock: () => {
    const model = process.env.MOCK_AI_MODEL || "mock-deterministic-v1";
    return new MockAIProvider(model);
  },
};

/** Provider ids recognised by the contract but whose adapter is not yet implemented. */
const UNIMPLEMENTED_PROVIDERS: Record<string, string> = {
  anthropic:
    "AI_PROVIDER=anthropic is recognised but the Anthropic adapter is not yet implemented (Phase 13.3C+). Set AI_PROVIDER=mock for local/tests.",
};

function readProviderId(): AIProviderId {
  const raw = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (!raw) {
    throw AIErrors.configuration(
      "AI_PROVIDER is not set. Configure it explicitly (e.g. AI_PROVIDER=mock for local/tests).",
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
 * status. Real providers added later should add their credential checks
 * here so misconfiguration fails closed at resolution time instead of at
 * first request.
 */
function validateAndInstantiate(id: AIProviderId): AIProvider {
  // Recognised but not yet implemented → fail closed with a clear message.
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

  switch (id) {
    case "mock":
      // Mock has no required credentials. Do NOT add "if ANTHROPIC_API_KEY
      // then silently switch" logic here — selection is always explicit.
      return factory();
    case "anthropic":
      // Should be unreachable: caught above by UNIMPLEMENTED_PROVIDERS.
      // Kept as an explicit branch so TypeScript narrowing stays correct
      // when new ids are added.
      throw AIErrors.configuration(UNIMPLEMENTED_PROVIDERS.anthropic, { provider: id });
    default: {
      // Exhaustiveness guard: if a provider id is added to AI_PROVIDERS
      // without a case, fail closed.
      const _exhaustive: never = id;
      throw AIErrors.configuration(
        `Provider "${_exhaustive}" is registered but has no credential validation.`,
      );
    }
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
