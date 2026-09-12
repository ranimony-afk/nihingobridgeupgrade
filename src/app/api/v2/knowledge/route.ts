import { NextRequest, NextResponse } from "next/server";
import { KnowledgeRetrieval } from "@/services/ai/knowledge-retrieval";

export const dynamic = "force-dynamic";

/**
 * Unified knowledge retrieval endpoint.
 * Used by the AI tutor for RAG and by clients for cross-domain search.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const query = p.get("q") ?? "";
  const learnerId = p.get("learnerId") ?? undefined;
  const jlpt = p.get("jlpt") ? Number(p.get("jlpt")) : undefined;
  const domains = p.get("domains")?.split(",") as ("dictionary" | "kanji" | "grammar" | "sentence" | "course" | "lesson")[] | undefined;
  const maxTotal = Number(p.get("max") ?? "15");

  // Special views
  const view = p.get("view");
  if (view === "jlpt" && jlpt) {
    const result = await KnowledgeRetrieval.retrieveJlptContext(jlpt, learnerId);
    return NextResponse.json({ success: true, data: result });
  }

  if (view === "entity") {
    const domain = p.get("domain") ?? "dictionary";
    const id = p.get("id") ?? "";
    const result = await KnowledgeRetrieval.retrieveForEntity(domain, id, learnerId);
    return NextResponse.json({ success: true, data: result });
  }

  if (!query) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "q parameter required" } }, { status: 400 });
  }

  const result = await KnowledgeRetrieval.retrieve(query, {
    maxTotal,
    domains,
    jlptLevel: jlpt,
    learnerId,
  });

  return NextResponse.json({ success: true, data: result });
}
