import { db } from "@/db";
import { learnerGamification } from "@/db/schema";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mobile/progress
 */
export async function GET() {
  try {
    await ensureSeed();
    const rows = await db.select().from(learnerGamification).limit(1);
    const progress = rows[0] ?? {
      xp: 420,
      streakDays: 8,
      level: 3,
      levelTitle: "Hiragana Adept",
    };
    return ok(progress);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
