import { getSrsQueue } from "@/lib/knowledge/service";
import { requireIdentity } from "@/lib/auth/guard";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({ limit: z.coerce.number().int().min(1).max(50).optional() });

export async function GET(request: Request) {
  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;
  const parsed = schema.safeParse({ limit: new URL(request.url).searchParams.get("limit") ?? undefined });
  if (!parsed.success) return Response.json({ error: "Queue limit is invalid.", code: "VALIDATION_ERROR" }, { status: 400 });
  const cards = await getSrsQueue(identity.identity.user.id, parsed.data.limit);
  return Response.json({ ok: true, cards }, { headers: { "Cache-Control": "no-store" } });
}
