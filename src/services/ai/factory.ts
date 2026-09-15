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

import type { AIProvider, AIProviderId } from "@/services/ai/provider";
import { AIErrors } from "@/services/ai/provider";
import { MockAIProvider } from "@/services/ai/providers/mock";

/**
 * Map of registered providers. When a real Anthropic/OpenAI adapter lands
 * in a later phase, it gets added here (and nowhere else) after its
 * adapter module exists in src/services/ai/providers/.
 */
const REGISTRY: Record<AIProviderId, () => AIProvider> = {
  mock: () => {
    const model = process.env.MOCK_AI_MODEL || "mock-deterministic-v1";
    return new MockAIProvider(model);
  },
};

function readProviderId(): AIProviderId {
  const raw = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (!raw) {
    throw AIErrors.configuration(
      "AI_PROVIDER is not set. Configure it explicitly (e.g. AI_PROVIDER=mock for local/tests).",
    );
  }
  const known = Object.keys(REGISTRY) as AIProviderId[];
  if (!(known as string[]).includes(raw)) {
    throw AIErrors.configuration(
      `Unsupported AI_PROVIDER "${raw}". Supported values: ${known.join(", ")}.`,
    );
  }
  return raw as AIProviderId;
}

/**
 * Validate provider-specific required environment. Real providers added
 * later should add their credential checks here so misconfiguration fails
 * closed at resolution time instead of at first request.
 */
function validateCredentials(id: AIProviderId): void {
  switch (id) {
    case "mock":
      // Mock has no required credentials. Do NOT add "if ANTHROPIC_API_KEY
      // then silently switch" logic here — selection is always explicit.
      return;
    default: {
      // Exhaustiveness guard: if a provider id is added to AI_PROVIDERS
      // without a credential case, fail closed.
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
  validateCredentials(id);
  return REGISTRY[id]();
}

/**
 * Read-only view of registered provider ids, primarily for tests and
 * diagnostics. Exposed so tests don't need to import the registry directly.
 */
export function getRegisteredProviderIds(): readonly AIProviderId[] {
  return Object.keys(REGISTRY) as AIProviderId[];
}
