import { jsonFromError, jsonSuccess } from "@/lib/api-response";
import { getPreferences, getProfile } from "@/repositories/identity";
import { getCurrentUser } from "@/services/auth/session-cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/auth/session
 *
 * Returns the current user, or `{ user: null }` when unauthenticated.
 *
 * An anonymous caller is a normal state, not an error, so this returns 200
 * with a null user rather than 401 — that lets a client render a signed-out
 * view without treating it as a failure.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();

    // Profile and preferences ship with the session so a client can render
    // theme, furigana mode, and locale on first paint without a second
    // round trip and without a flash of default styling.
    const [profile, preferences] = user
      ? await Promise.all([getProfile(user.id), getPreferences(user.id)])
      : [null, null];

    return jsonSuccess(
      { user, authenticated: user !== null, profile, preferences },
      undefined,
      // Never cache: the answer is per-request and privacy-sensitive.
      { headers: { "cache-control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (error) {
    return jsonFromError(error);
  }
}
