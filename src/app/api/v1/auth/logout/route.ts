import {
  expiredSessionCookieValue,
  getSessionTokenFromRequest,
  revokeMobileRefreshToken,
  revokeUserSession,
} from "@/lib/auth/identity";
import { requireIdentity } from "@/lib/auth/guard";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const logoutSchema = z.object({ refreshToken: z.string().min(32).max(512).optional() });

export async function POST(request: Request) {
  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;

  const payload = logoutSchema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) {
    return Response.json({ error: "Invalid logout request.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const sessionToken = getSessionTokenFromRequest(request);
  if (sessionToken) {
    await revokeUserSession(identity.identity.user.id, sessionToken);
  }
  if (payload.data.refreshToken) {
    await revokeMobileRefreshToken(payload.data.refreshToken, identity.identity.user.id);
  }

  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": expiredSessionCookieValue(), "Cache-Control": "no-store" } },
  );
}
