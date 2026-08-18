import { addSrsCard } from "@/lib/knowledge/service";
import { requireIdentity } from "@/lib/auth/guard";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  entityType: z.enum(["lexeme", "kanji", "grammar", "sentence", "idiom", "collocation"]),
  entityId: z.string().uuid(),
});

export async function POST(request: Request) {
  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;
  const payload = schema.safeParse(await request.json());
  if (!payload.success) return Response.json({ error: "SRS card request is invalid.", code: "VALIDATION_ERROR" }, { status: 400 });
  const card = await addSrsCard({ userId: identity.identity.user.id, ...payload.data });
  return Response.json({ ok: true, card }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
