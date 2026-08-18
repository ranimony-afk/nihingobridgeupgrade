import { getLexemeDetail } from "@/lib/knowledge/service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ lexemeId: string }> },
) {
  const { lexemeId } = await context.params;
  const lexeme = await getLexemeDetail(lexemeId);
  if (!lexeme) return Response.json({ error: "Lexeme was not found.", code: "NOT_FOUND" }, { status: 404 });
  return Response.json({ ok: true, lexeme }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=900" } });
}
