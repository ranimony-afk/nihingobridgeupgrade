import { db } from "@/db";
import { learnerGamification, nihongoLearningItems } from "@/db/schema";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/mobile/sync (Returns offline caching bundle for Flutter / mobile apps)
 * POST /api/v1/mobile/sync { xpGained, offlineCompletedLessonIds }
 */
export async function GET() {
  try {
    await ensureSeed();
    const vocabList = await db.select().from(nihongoLearningItems).limit(50);
    const gamify = await db.select().from(learnerGamification).limit(1);

    const offlineBundle = {
      cachedAt: new Date().toISOString(),
      offlineVersion: "1.0.0",
      vocabulary: vocabList,
      userState: gamify[0] ?? { xp: 240, streakDays: 7 },
    };

    return ok(offlineBundle, {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    await ensureSeed();
    const body = (await req.json()) as { xpGained?: number };
    return ok({ synced: true, timestamp: new Date().toISOString(), xpDelta: body.xpGained ?? 0 });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
