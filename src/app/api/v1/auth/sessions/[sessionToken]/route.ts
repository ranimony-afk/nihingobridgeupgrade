import { revokeUserSession } from "@/lib/auth/identity";
import { requireIdentity } from "@/lib/auth/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ sessionToken: string }> },
) {
  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;

  const { sessionToken } = await context.params;
  const revoked = await revokeUserSession(identity.identity.user.id, sessionToken);
  if (!revoked) {
    return Response.json({ error: "Session was not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
