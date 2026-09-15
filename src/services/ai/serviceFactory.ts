/**
 * createGroundedAnswerService — convenience factory for production.
 *
 * Phase 13.4A. Wires the canonical provider (resolved via
 * createAIProvider()) to GroundedAnswerService, pinning the prompt
 * version from AI_PROMPT_VERSION. Tests typically construct
 * GroundedAnswerService directly with a mock provider.
 */

import "server-only";

import { GroundedAnswerService } from "@/services/ai/groundedAnswerService";
import { createAIProvider } from "@/services/ai/factory";

export function createGroundedAnswerService(): GroundedAnswerService {
  return new GroundedAnswerService(createAIProvider());
}
