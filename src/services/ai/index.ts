/**
 * AI services public surface.
 *
 * Phase 13.3B. Re-exports the canonical provider contract and factory so
 * downstream modules have a single, stable import path. Concrete provider
 * adapters are deliberately NOT re-exported: only the factory is allowed
 * to instantiate them.
 */

import "server-only";

export {
  AIErrors,
  AIProviderError,
  AI_PROVIDERS,
} from "@/services/ai/provider";
export type {
  AIErrorCode,
  AIProvider,
  AIProviderId,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  FinishReason,
  GenerationOptions,
  GroundedContext,
  TokenUsage,
} from "@/services/ai/provider";
export {
  createAIProvider,
  getRegisteredProviderIds,
} from "@/services/ai/factory";
// KnowledgeRetriever remains the canonical retrieval entry point. It is
// exported from its own module to make the "retrieval happens upstream of
// the provider" boundary explicit in imports.
