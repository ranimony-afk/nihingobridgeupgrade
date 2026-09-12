import { jsonFromError, jsonSuccess } from "@/lib/api-response";
import { clearedCookie, readRequestToken } from "@/services/auth/session-cookie";
import { logout } from "@/services/auth/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/logout
 *
 * Revokes the current session server-side and clears the cookie. Because
 * sessions are opaque database rows rather than self-contained tokens,
 * revocation takes effect immediately for every transport.
 *
 * Idempotent: logging out twice is a success, not an error.
 */
export async function POST() {
  try {
    const token = await readRequestToken();
    const revoked = await logout(token);

    const response = jsonSuccess({ revoked });
    response.headers.append("set-cookie", clearedCookie());
    return response;
  } catch (error) {
    return jsonFromError(error);
  }
}
