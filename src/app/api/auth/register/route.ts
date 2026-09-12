import { jsonFromError, jsonSuccess } from "@/lib/api-response";
import { buildSessionCookie, serializeCookie } from "@/services/auth/session-cookie";
import { register, type Transport } from "@/services/auth/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/register
 *
 * Creates an account and starts a session. Web clients receive an httpOnly
 * cookie; a client that asks for `transport: "bearer"` receives the token in
 * the body instead, for the Flutter client.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const transport: Transport = body.transport === "bearer" ? "bearer" : "cookie";

    const result = await register({
      email: body.email as string,
      password: body.password as string,
      displayName: body.displayName as string | undefined,
      transport,
      userAgent: request.headers.get("user-agent"),
    });

    const payload =
      transport === "bearer"
        ? {
            user: result.user,
            token: result.session.token,
            expiresAt: result.session.expiresAt.toISOString(),
          }
        : { user: result.user };

    const response = jsonSuccess(payload, undefined, { status: 201 });

    if (transport === "cookie") {
      const maxAge = Math.floor((result.session.expiresAt.getTime() - Date.now()) / 1000);
      response.headers.append(
        "set-cookie",
        serializeCookie(buildSessionCookie(result.session.token, maxAge)),
      );
    }

    return response;
  } catch (error) {
    return jsonFromError(error);
  }
}
