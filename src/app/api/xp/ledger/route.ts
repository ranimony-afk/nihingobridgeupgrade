import { NextRequest, NextResponse } from "next/server";
import { XpService } from "@/services/gamification/xpService";
import { levelForXp, xpAtLevel, MAX_LEVEL } from "@/services/gamification/xpRegistry";

export const dynamic = "force-dynamic";

/** GET /api/xp/ledger — paginated raw XP event feed, plus the level curve. */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const userId = sp.get("userId") || "anonymous-user";

    const { entries, total } = await XpService.getLedger({
      userId,
      limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : 50,
      offset: sp.get("offset") ? parseInt(sp.get("offset")!, 10) : 0,
      eventType: sp.get("eventType") || undefined,
    });

    const totalXp = await XpService.getTotalXp(userId);

    /* First 20 levels of the curve, so the UI can chart progression. */
    const curve = Array.from({ length: Math.min(20, MAX_LEVEL) }, (_, i) => {
      const level = i + 1;
      return { level, xpRequired: xpAtLevel(level) };
    });

    return NextResponse.json({
      success: true,
      entries,
      total,
      totalXp,
      level: levelForXp(totalXp),
      curve,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load XP ledger";
    console.error("GET /api/xp/ledger error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
