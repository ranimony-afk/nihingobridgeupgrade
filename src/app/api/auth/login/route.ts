import { jsonFromError, jsonSuccess } from "@/lib/api-response";
import { buildSessionCookie, serializeCookie } from "@/services/auth/session-cookie";
import { login, type Transport } from "@/services/auth/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/login
 *
 * Verifies credentials and starts a session. Every failure returns the same
 * 401 so the endpoint cannot be used to discover which addresses are
 * registered.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const transport: Transport = body.transport === "bearer" ? "bearer" : "cookie";

    const result = await login({
      email: body.email as string,
      password: body.password as string,
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

    const response = jsonSuccess(payload);

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
