import { listGrammarPoints } from "@/lib/knowledge/service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  jlpt: z.string().regex(/^N[1-5]$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = schema.safeParse({
    jlpt: url.searchParams.get("jlpt") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) return Response.json({ error: "Grammar filters are invalid.", code: "VALIDATION_ERROR" }, { status: 400 });
  const grammar = await listGrammarPoints({ jlptLevel: parsed.data.jlpt, limit: parsed.data.limit, offset: parsed.data.offset });
  return Response.json({ ok: true, grammar }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
