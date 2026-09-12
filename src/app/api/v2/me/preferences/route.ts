import { jsonFromError, jsonSuccess } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth-guard";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getPreferences, updatePreferences } from "@/repositories/identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_CACHE = { "cache-control": "private, no-store" } as const;

/** GET /api/v2/me/preferences — the caller's own preferences. */
export async function GET() {
  try {
    const user = await requireAuth();
    const preferences = await getPreferences(user.id);
    if (!preferences) throw new NotFoundError("Preferences");

    return jsonSuccess({ preferences }, undefined, { headers: PRIVATE_CACHE });
  } catch (error) {
    return jsonFromError(error);
  }
}

const THEMES = ["system", "light", "dark"];
const FURIGANA = ["always", "hover", "never"];

const BOOLEANS = [
  "showRomaji",
  "reducedMotion",
  "soundEnabled",
  "emailDigest",
  "reviewReminders",
] as const;

/** Numeric bounds mirror the database check constraints exactly. */
const NUMERIC: Record<string, { min: number; max: number }> = {
  dailyGoalMinutes: { min: 1, max: 1440 },
  srsDailyNewLimit: { min: 0, max: 500 },
  srsDailyReviewLimit: { min: 0, max: 10_000 },
};

/** PATCH /api/v2/me/preferences — partial update of the caller's settings. */
export async function PATCH(request: Request) {
  try {
    const user = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    const problems: { path: string; message: string }[] = [];

    if (body.theme !== undefined) {
      if (typeof body.theme !== "string" || !THEMES.includes(body.theme)) {
        problems.push({ path: "theme", message: `Theme must be one of: ${THEMES.join(", ")}` });
      } else {
        patch.theme = body.theme;
      }
    }

    if (body.furiganaMode !== undefined) {
      if (typeof body.furiganaMode !== "string" || !FURIGANA.includes(body.furiganaMode)) {
        problems.push({
          path: "furiganaMode",
          message: `Furigana mode must be one of: ${FURIGANA.join(", ")}`,
        });
      } else {
        patch.furiganaMode = body.furiganaMode;
      }
    }

    for (const field of BOOLEANS) {
      if (body[field] === undefined) continue;
      if (typeof body[field] !== "boolean") {
        problems.push({ path: field, message: `${field} must be true or false` });
      } else {
        patch[field] = body[field];
      }
    }

    for (const [field, bounds] of Object.entries(NUMERIC)) {
      if (body[field] === undefined) continue;
      const value = body[field];
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < bounds.min ||
        value > bounds.max
      ) {
        problems.push({
          path: field,
          message: `${field} must be an integer between ${bounds.min} and ${bounds.max}`,
        });
      } else {
        patch[field] = value;
      }
    }

    if (problems.length > 0) throw new ValidationError("Invalid preferences update", problems);
    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No supported fields supplied", [
        { message: "Provide at least one known preference field" },
      ]);
    }

    const preferences = await updatePreferences(user.id, patch);
    if (!preferences) throw new NotFoundError("Preferences");

    return jsonSuccess({ preferences }, undefined, { headers: PRIVATE_CACHE });
  } catch (error) {
    return jsonFromError(error);
  }
}
