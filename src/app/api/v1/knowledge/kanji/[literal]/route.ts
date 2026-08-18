import { getKanjiDetail } from "@/lib/knowledge/service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ literal: string }> },
) {
  const { literal } = await context.params;
  if ([...literal].length !== 1) {
    return Response.json({ error: "A single kanji literal is required.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const kanji = await getKanjiDetail(literal);
  if (!kanji) return Response.json({ error: "Kanji was not found.", code: "NOT_FOUND" }, { status: 404 });
  return Response.json({ ok: true, kanji }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=900" } });
}
