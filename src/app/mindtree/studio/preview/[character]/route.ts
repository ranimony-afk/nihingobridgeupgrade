import { getMindTreeEditorialVisualPreview } from "@/lib/kanji/kanjiMindtreeCatalog";

export const dynamic = "force-dynamic";

/** Read-only one-character source preview; unavailable outside dev mode. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ character: string }> },
) {
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const { character } = await params;
  const preview = getMindTreeEditorialVisualPreview(character);
  if (!preview) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json(preview, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
