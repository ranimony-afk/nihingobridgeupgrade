import { jsonFromError, jsonSuccess } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth-guard";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getProfile, updateProfile } from "@/repositories/identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_CACHE = { "cache-control": "private, no-store" } as const;

/**
 * GET /api/v2/me/profile — the caller's own profile.
 *
 * "me" is resolved from the session, never from a path or query parameter, so
 * there is no id for a client to tamper with (API_OWNERSHIP §4).
 */
export async function GET() {
  try {
    const user = await requireAuth();
    const profile = await getProfile(user.id);
    if (!profile) throw new NotFoundError("Profile");

    return jsonSuccess({ profile }, undefined, { headers: PRIVATE_CACHE });
  } catch (error) {
    return jsonFromError(error);
  }
}

/**
 * PATCH /api/v2/me/profile
 *
 * Partial update. Unknown keys are ignored rather than rejected, so adding a
 * field later cannot break an older client; invalid *values* are still
 * rejected, because silently storing nonsense is worse than a 400.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    const problems: { path: string; message: string }[] = [];

    if (body.timezone !== undefined) {
      if (typeof body.timezone !== "string" || body.timezone.length > 64) {
        problems.push({ path: "timezone", message: "Timezone must be a string up to 64 characters" });
      } else {
        patch.timezone = body.timezone;
      }
    }

    if (body.locale !== undefined) {
      if (typeof body.locale !== "string" || body.locale.length > 12) {
        problems.push({ path: "locale", message: "Locale must be a string up to 12 characters" });
      } else {
        patch.locale = body.locale;
      }
    }

    if (body.bio !== undefined) {
      if (body.bio !== null && (typeof body.bio !== "string" || body.bio.length > 500)) {
        problems.push({ path: "bio", message: "Bio must be at most 500 characters" });
      } else {
        patch.bio = body.bio;
      }
    }

    for (const field of ["targetJlptLevel", "currentJlptLevel"] as const) {
      if (body[field] === undefined) continue;
      const value = body[field];
      if (value === null) {
        patch[field] = null;
      } else if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
        // 5 = N5 … 1 = N1 (ARCHITECTURE_FREEZE §2.2). The database enforces
        // this too, but a clear 400 beats a constraint violation.
        problems.push({ path: field, message: "JLPT level must be an integer from 1 (N1) to 5 (N5)" });
      } else {
        patch[field] = value;
      }
    }

    if (body.visibility !== undefined) {
      if (body.visibility !== "private" && body.visibility !== "public") {
        problems.push({ path: "visibility", message: 'Visibility must be "private" or "public"' });
      } else {
        patch.visibility = body.visibility;
      }
    }

    if (problems.length > 0) throw new ValidationError("Invalid profile update", problems);
    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No supported fields supplied", [
        { message: "Provide at least one of: timezone, locale, bio, targetJlptLevel, currentJlptLevel, visibility" },
      ]);
    }

    const profile = await updateProfile(user.id, patch);
    if (!profile) throw new NotFoundError("Profile");

    return jsonSuccess({ profile }, undefined, { headers: PRIVATE_CACHE });
  } catch (error) {
    return jsonFromError(error);
  }
}
