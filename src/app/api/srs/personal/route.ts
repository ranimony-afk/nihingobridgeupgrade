import { NextRequest, NextResponse } from "next/server";
import { PersonalizationService } from "@/services/srs/personalizationService";
import { SESSION_QUEUE_ORDERS, SessionQueueOrder } from "@/types/srs";

export const dynamic = "force-dynamic";

/**
 * GET /api/srs/personal
 * Live learner profile + personalized plan. Nothing derived is cached: accuracy,
 * weakness, velocity and retention are recomputed from the review log on every
 * call, so the profile can never drift from it.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const view = await PersonalizationService.getPersonalizedView({
      userId: sp.get("userId") || undefined,
      deckId: sp.get("deckId") || null,
      trailingDays: sp.get("trailingDays") ? parseInt(sp.get("trailingDays")!, 10) : undefined,
    });

    return NextResponse.json({ success: true, ...view });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build personalization";
    console.error("GET /api/srs/personal error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** PUT — store personalization weighting preferences (user intent only). */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = body?.userId || "anonymous-user";

    const prefs = await PersonalizationService.updatePrefs(userId, {
      weaknessWeight: body.weaknessWeight,
      urgencyWeight: body.urgencyWeight,
      difficultyWeight: body.difficultyWeight,
      preferWeakAreas: body.preferWeakAreas,
      maxWeakCardsPerSession: body.maxWeakCardsPerSession,
      autoAdaptTargets: body.autoAdaptTargets,
      weakFirst: body.weakFirst,
    });

    return NextResponse.json({
      success: true,
      message: "Personalization preferences saved",
      prefs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save preferences";
    console.error("PUT /api/srs/personal error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

/** POST — launch a personalized session directly from the generated plan. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = body?.userId || "anonymous-user";
    const deckId = body?.deckId ?? null;

    const { plan } = await PersonalizationService.buildPlan({ userId, deckId });

    if (!SESSION_QUEUE_ORDERS.includes(plan.suggested.order)) {
      return NextResponse.json(
        { success: false, error: "planner produced an unknown queue order" },
        { status: 500 }
      );
    }

    const { SessionService } = await import("@/services/srs/sessionService");
    const { session } = await SessionService.planSession({
      userId,
      deckId,
      newLimit: body?.newLimit ?? plan.suggested.newLimit,
      reviewLimit: body?.reviewLimit ?? plan.suggested.reviewLimit,
      order: plan.suggested.order,
      dueHorizon: body?.dueHorizon === "now" ? "now" : "day",
    });

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      session,
      plan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start personalized session";
    console.error("POST /api/srs/personal error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export type { SessionQueueOrder };
