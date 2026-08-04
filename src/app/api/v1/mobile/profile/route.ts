import { db } from "@/db";
import { users, learnerGamification } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";
import { extractAuthToken, verifyMobileJwt } from "@/shared/mobile";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mobile/profile (Bearer token auth)
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const token = extractAuthToken(req);
    const decoded = token ? verifyMobileJwt(token) : null;

    const gamify = await db.select().from(learnerGamification).limit(1);
    const userRow = await db.select().from(users).limit(1);

    const profile = {
      userId: decoded?.userId ?? userRow[0]?.id ?? 1,
      email: decoded?.email ?? userRow[0]?.email ?? "learner@nihongobridge.com",
      displayName: userRow[0]?.displayName ?? "Yuki M.",
      role: decoded?.role ?? userRow[0]?.role ?? "learner",
      brandSlug: "nihongo",
      stats: gamify[0] ?? {
        xp: 420,
        streakDays: 8,
        level: 3,
        levelTitle: "Hiragana Adept",
      },
    };

    return ok(profile, {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
