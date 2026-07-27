import { db } from "@/db";
import { learnerGamification } from "@/db/schema";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mobile/achievements
 */
export async function GET() {
  try {
    await ensureSeed();
    const rows = await db.select().from(learnerGamification).limit(1);
    const badges = rows[0]?.badges ?? [
      { name: "First 100 XP", icon: "⚡", description: "Earned your first 100 XP" },
      { name: "7-Day Streak", icon: "🔥", description: "Studied 7 days in a row" },
    ];
    return ok(badges, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
