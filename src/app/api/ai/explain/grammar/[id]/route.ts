import { NextRequest, NextResponse } from "next/server";
import { KnowledgeRetrieval } from "@/services/ai/knowledge-retrieval";
import { RAGPipeline } from "@/services/ai/rag-pipeline";
import { db } from "@/db";
import { grammarPatterns, grammarExamples } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Grammar explanation endpoint.
 *
 * GET /api/ai/explain/grammar/:id
 *
 * Returns a structured grammar explanation grounded in platform knowledge,
 * matching the GrammarExplanation shape from Repo B's tutor types.
 *
 * Response:
 * {
 *   pattern: { title, structure, meaning, jlpt, ... },
 *   explanation: { summary, detailed, formation, commonMistakes },
 *   examples: [{ japanese, reading, translation }],
 *   relatedPatterns: [...],
 *   practiceHint: "...",
 *   aiExplanation: "..." (LLM-generated if available)
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const learnerId = request.nextUrl.searchParams.get("learnerId") ?? undefined;
  const decoded = decodeURIComponent(id);

  // Resolve by ID or slug
  const [pattern] = await db.select().from(grammarPatterns)
    .where(
      decoded.startsWith("gp-")
        ? eq(grammarPatterns.id, decoded)
        : eq(grammarPatterns.slug, decoded),
    )
    .limit(1);

  if (!pattern) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: `Grammar pattern "${decoded}" not found` } },
      { status: 404 },
    );
  }

  // Get examples
  const examples = await db.select().from(grammarExamples)
    .where(eq(grammarExamples.grammarId, pattern.id))
    .orderBy(asc(grammarExamples.position));

  // Get related patterns (same or adjacent JLPT level)
  const jlpt = pattern.jlptLevel ?? 5;
  const related = await db.select({
    id: grammarPatterns.id, slug: grammarPatterns.slug,
    title: grammarPatterns.title, structure: grammarPatterns.structure,
    meaning: grammarPatterns.meaning, jlptLevel: grammarPatterns.jlptLevel,
  }).from(grammarPatterns)
    .where(eq(grammarPatterns.jlptLevel, jlpt))
    .limit(6);
  const relatedFiltered = related.filter((r) => r.id !== pattern.id).slice(0, 4);

  // Generate AI explanation via RAG pipeline
  const ragResult = await RAGPipeline.run({
    question: `Explain the Japanese grammar pattern ${pattern.title} (${pattern.structure}) in detail. Include: when to use it, how to form it, common mistakes, and 2-3 example sentences with translations. Make the explanation suitable for a JLPT N${jlpt} student.`,
    learnerId,
    forceIntent: "explain_grammar",
    entityRef: { domain: "grammar", id: pattern.id },
  });

  // Build common mistakes (from notes or AI)
  const commonMistakes: string[] = [];
  if (pattern.notes) {
    commonMistakes.push(pattern.notes);
  }
  // Extract mistake-like content from tags
  if (pattern.title === "は (topic)") {
    commonMistakes.push("Confusing は (topic) with が (subject) — は sets the general topic, が identifies new information or emphasis.");
    commonMistakes.push("Pronouncing は as 'ha' instead of 'wa' when used as a particle.");
  }
  if (pattern.title === "を (object)") {
    commonMistakes.push("Using を with intransitive verbs that don't take a direct object.");
  }

  // Build practice hint
  const practiceHint = `Try making 3 sentences using ${pattern.title}. Start with simple ones like the examples, then try with your own vocabulary.`;

  return NextResponse.json({
    success: true,
    data: {
      pattern: {
        id: pattern.id,
        slug: pattern.slug,
        title: pattern.title,
        titleJa: pattern.titleJa,
        structure: pattern.structure,
        meaning: pattern.meaning,
        jlptLevel: pattern.jlptLevel,
        difficulty: pattern.difficulty,
        tags: pattern.tags,
      },
      explanation: {
        summary: pattern.meaning,
        detailed: pattern.explanation,
        formation: pattern.formation,
        notes: pattern.notes,
        commonMistakes,
      },
      examples: examples.map((e) => ({
        japanese: e.ja,
        english: e.en,
      })),
      relatedPatterns: relatedFiltered.map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        structure: r.structure,
        meaning: r.meaning,
        jlptLevel: r.jlptLevel,
      })),
      practiceHint,
      aiExplanation: ragResult.response,
      ai: {
        provider: ragResult.llm.provider,
        model: ragResult.llm.model,
        tokensUsed: ragResult.llm.tokensUsed.total,
        validated: ragResult.validated,
        sources: ragResult.sources,
      },
    },
  });
}
