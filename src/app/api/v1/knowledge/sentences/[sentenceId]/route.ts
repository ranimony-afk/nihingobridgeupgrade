import { getSentenceDetail } from "@/lib/knowledge/service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sentenceId: string }> },
) {
  const { sentenceId } = await context.params;
  const sentence = await getSentenceDetail(sentenceId);
  if (!sentence) return Response.json({ error: "Sentence was not found.", code: "NOT_FOUND" }, { status: 404 });
  return Response.json({ ok: true, sentence }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=900" } });
}
