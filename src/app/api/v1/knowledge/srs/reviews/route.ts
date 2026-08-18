import { reviewSrsCard } from "@/lib/knowledge/service";
import { requireIdentity } from "@/lib/auth/guard";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({ cardId: z.string().uuid(), rating: z.number().int().min(0).max(5) });

export async function POST(request: Request) {
  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;
  const payload = schema.safeParse(await request.json());
  if (!payload.success) return Response.json({ error: "SRS review is invalid.", code: "VALIDATION_ERROR" }, { status: 400 });
  const card = await reviewSrsCard({ userId: identity.identity.user.id, ...payload.data });
  if (!card) return Response.json({ error: "SRS card was not found.", code: "NOT_FOUND" }, { status: 404 });
  return Response.json({ ok: true, card }, { headers: { "Cache-Control": "no-store" } });
}
