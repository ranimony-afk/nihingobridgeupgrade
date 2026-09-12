import { NextRequest, NextResponse } from "next/server";
import { KnowledgeRetrieval } from "@/services/ai/knowledge-retrieval";
import { RAGPipeline } from "@/services/ai/rag-pipeline";
import { db } from "@/db";
import { grammarPatterns, grammarExamples } from "@/db/schema";
import { eq, asc, ilike, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * V1-compatible grammar explanation endpoint.
 *
 * GET /api/v1/tutor/grammar-explain?pattern=は&level=N5
 * GET /api/v1/tutor/grammar-explain?id=gp-wa
 *
 * Matches Repo A's existing tutor route structure.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const id = p.get("id");
  const patternQuery = p.get("pattern");
  const learnerId = p.get("learnerId") ?? undefined;

  if (!id && !patternQuery) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "id or pattern parameter required" } },
      { status: 400 },
    );
  }

  // Find the grammar pattern
  let pattern;
  if (id) {
    [pattern] = await db.select().from(grammarPatterns).where(eq(grammarPatterns.id, id)).limit(1);
  } else {
    [pattern] = await db.select().from(grammarPatterns)
      .where(sql`${grammarPatterns.title} ILIKE ${"%" + patternQuery + "%"} OR ${grammarPatterns.slug} ILIKE ${"%" + patternQuery + "%"}`)
      .limit(1);
  }

  if (!pattern) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: `Grammar pattern not found` } },
      { status: 404 },
    );
  }

  // Get examples
  const examples = await db.select().from(grammarExamples)
    .where(eq(grammarExamples.grammarId, pattern.id))
    .orderBy(asc(grammarExamples.position));

  // Generate AI explanation
  const ragResult = await RAGPipeline.run({
    question: `Explain ${pattern.title} (${pattern.structure}) — ${pattern.meaning}. Give a clear explanation with examples suitable for JLPT N${pattern.jlptLevel ?? 5}.`,
    learnerId,
    forceIntent: "explain_grammar",
    entityRef: { domain: "grammar", id: pattern.id },
  });

  // Repo B-compatible response shape (GrammarExplanation)
  return NextResponse.json({
    success: true,
    data: {
      explanation_en: pattern.explanation,
      formation: pattern.formation ?? "",
      original_examples: examples.map((e) => ({
        japanese: e.ja,
        reading: "",
        translation_en: e.en,
      })),
      common_mistakes: pattern.notes ? [pattern.notes] : [],
      ai_explanation: ragResult.response,
      pattern_info: {
        title: pattern.title,
        structure: pattern.structure,
        meaning: pattern.meaning,
        jlpt_level: pattern.jlptLevel,
      },
    },
  });
}
