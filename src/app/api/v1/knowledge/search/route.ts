import { searchKnowledge, type KnowledgeSearchKind } from "@/lib/knowledge/service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const kinds = ["lexeme", "kanji", "grammar", "sentence", "idiom", "collocation", "name"] as const;
const querySchema = z.object({
  q: z.string().trim().min(1).max(160),
  kind: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q"),
    kind: url.searchParams.get("kind") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "A valid search query is required.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const selectedKinds = parsed.data.kind
    ? parsed.data.kind.split(",").filter((kind): kind is KnowledgeSearchKind => kinds.includes(kind as KnowledgeSearchKind))
    : undefined;
  if (parsed.data.kind && selectedKinds?.length === 0) {
    return Response.json({ error: "No valid knowledge kinds were requested.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const results = await searchKnowledge({
    query: parsed.data.q,
    kinds: selectedKinds,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
  });
  return Response.json(
    { ok: true, query: parsed.data.q, results },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
  );
}
