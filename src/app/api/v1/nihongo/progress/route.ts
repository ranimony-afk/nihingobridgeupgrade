import { db } from "@/db";
import { learnerGamification, brands } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";
import { awardXp } from "@/shared/tools";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/nihongo/progress
 * POST /api/v1/nihongo/progress { xpGained?, bookmarkId? }
 */
export async function GET() {
  try {
    await ensureSeed();
    const rows = await db.select().from(learnerGamification).limit(1);
    const progress = rows[0] ?? {
      xp: 240,
      streakDays: 7,
      dailyGoalMinutes: 15,
      bookmarks: [1, 3],
      achievements: ["First 100 XP", "Hiragana Master", "7-Day Streak Warrior"],
    };
    return ok(progress);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    await ensureSeed();
    const body = (await req.json()) as { xpGained?: number; bookmarkId?: number };

    const rows = await db.select().from(learnerGamification).limit(1);
    let state = rows[0] ?? {
      id: 1,
      xp: 240,
      streakDays: 7,
      dailyGoalMinutes: 15,
      bookmarks: [1, 3],
      achievements: ["First 100 XP"],
    };

    if (body.xpGained) {
      const updated = awardXp(
        { xp: state.xp, streakDays: state.streakDays, achievements: state.achievements ?? [] },
        body.xpGained,
      );
      state = { ...state, ...updated };
    }

    if (body.bookmarkId) {
      const currentBm = state.bookmarks ?? [];
      const hasBm = currentBm.includes(body.bookmarkId);
      const newBm = hasBm ? currentBm.filter((b) => b !== body.bookmarkId) : [...currentBm, body.bookmarkId];
      state = { ...state, bookmarks: newBm };
    }

    return ok(state);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
