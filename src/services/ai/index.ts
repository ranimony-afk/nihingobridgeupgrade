/**
 * AI services public surface.
 *
 * Phase 13.3B + 13.4A. Re-exports the canonical provider contract,
 * factory, and the grounded answer application service. Concrete
 * provider adapters are deliberately NOT re-exported.
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
export { GroundedAnswerService } from "@/services/ai/groundedAnswerService";
export type {
  Citation,
  GroundedAnswerRequest,
  GroundedAnswerResponse,
} from "@/services/ai/groundedAnswerService";
// KnowledgeRetriever remains the canonical retrieval entry point. It is
// exported from its own module to make the "retrieval happens upstream of
// the provider" boundary explicit in imports.
