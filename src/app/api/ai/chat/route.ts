import { NextRequest, NextResponse } from "next/server";
import { RAGPipeline, type Intent } from "@/services/ai/rag-pipeline";

export const dynamic = "force-dynamic";

/**
 * AI Tutor chat endpoint.
 *
 * POST /api/ai/chat
 * {
 *   "question": "What does 食べる mean?",
 *   "learnerId": "user-123",
 *   "history": [{ "role": "user", "content": "..." }, ...],
 *   "entityRef": { "domain": "dictionary", "id": "de-1000220" }
 * }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { question, learnerId, history, forceIntent, entityRef } = body;

  if (!question || typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "question is required" } },
      { status: 400 },
    );
  }

  const result = await RAGPipeline.run({
    question,
    learnerId: learnerId ?? undefined,
    history: history ?? undefined,
    forceIntent: forceIntent as Intent | undefined,
    entityRef: entityRef ?? undefined,
  });

  return NextResponse.json({
    success: true,
    data: {
      response: result.response,
      intent: result.intent,
      sources: result.sources,
      validated: result.validated,
      validationNotes: result.validationNotes,
      llm: result.llm,
      timings: result.timings,
    },
  });
}
