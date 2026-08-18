import { getGrammarDetail } from "@/lib/knowledge/service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ grammarId: string }> },
) {
  const { grammarId } = await context.params;
  const grammar = await getGrammarDetail(grammarId);
  if (!grammar) return Response.json({ error: "Grammar point was not found.", code: "NOT_FOUND" }, { status: 404 });
  return Response.json({ ok: true, grammar }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=900" } });
}
