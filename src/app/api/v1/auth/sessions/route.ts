import {
  getSessionTokenFromRequest,
  listUserSessions,
  revokeAllUserSessions,
} from "@/lib/auth/identity";
import { requireIdentity } from "@/lib/auth/guard";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const revokeAllSchema = z.object({ exceptCurrent: z.boolean().default(true) });

export async function GET(request: Request) {
  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;

  const currentSessionToken = getSessionTokenFromRequest(request);
  const activeSessions = await listUserSessions(identity.identity.user.id);
  return Response.json({
    ok: true,
    sessions: activeSessions.map((session) => ({
      id: session.sessionToken,
      current: session.sessionToken === currentSessionToken,
      expiresAt: session.expires.toISOString(),
      createdAt: session.createdAt.toISOString(),
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
    })),
  });
}

export async function DELETE(request: Request) {
  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;

  const payload = revokeAllSchema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) {
    return Response.json({ error: "Invalid session revocation request.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  await revokeAllUserSessions(
    identity.identity.user.id,
    payload.data.exceptCurrent ? getSessionTokenFromRequest(request) ?? undefined : undefined,
  );
  return Response.json({ ok: true });
}
