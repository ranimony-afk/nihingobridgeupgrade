import { db } from "@/db";
import { leaderboards, learnerGamification } from "@/db/schema";
import { asc } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/leaderboard
 */
export async function GET() {
  try {
    await ensureSeed();
    const ranks = await db.select().from(leaderboards).orderBy(asc(leaderboards.rank));
    const gamify = await db.select().from(learnerGamification).limit(1);

    return ok({
      leaderboard: ranks,
      userStats: gamify[0] ?? {
        xp: 420,
        streakDays: 8,
        level: 3,
        levelTitle: "Hiragana Adept",
        streakFreezes: 2,
      },
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
