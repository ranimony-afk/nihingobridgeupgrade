import { NextRequest, NextResponse } from "next/server";
import { DailyQueueService } from "@/services/srs/dailyQueueService";
import { resolveDayWindow } from "@/services/srs/dailyQueueService";
import { DEFAULT_DAILY_SETTINGS } from "@/services/srs/dailyQueueService";
import {
  srsContainmentActive,
  srsContainmentResponse,
} from "@/app/api/_shared/srsContainment";
import {
  authenticateActor,
  queryIdentityFailureResponse,
  selfIdentityFailureResponse,
} from "@/app/api/_shared/authorizationResponse";
import { resolveQueryIdentity, resolveSelfIdentity } from "@/lib/auth/learningIdentity";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();

  /* Phase 26F-E4: day settings decide which day counts as "today" for a
   * learner, so they are one learner's own. */
  const auth = await authenticateActor("Failed to load settings");
  if (!auth.ok) return auth.response;

  try {
    const identity = resolveQueryIdentity(
      auth.actor,
      request.nextUrl.searchParams.getAll("userId")
    );
    if (!identity.ok) return queryIdentityFailureResponse(identity.reason);

    const settings = await DailyQueueService.getSettings(identity.userId);

    // Echo back the resolved day so the UI can explain the cutoff instantly.
    const day = resolveDayWindow(new Date(), settings.timezone, settings.dayCutoffHour);

    return NextResponse.json({
      success: true,
      settings,
      defaults: DEFAULT_DAILY_SETTINGS,
      resolvedDay: day,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load settings";
    console.error("GET /api/srs/settings error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();

  /* Phase 26F-E4: settings are written for the actor only. */
  const auth = await authenticateActor("Failed to update settings");
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const identity = resolveSelfIdentity(auth.actor, body?.userId);
    if (!identity.ok) return selfIdentityFailureResponse(identity.reason);

    const settings = await DailyQueueService.updateSettings(identity.userId, {
      timezone: body.timezone,
      dayCutoffHour: body.dayCutoffHour,
      dailyNewTarget: body.dailyNewTarget,
      dailyReviewTarget: body.dailyReviewTarget,
      maxDailyReviews: body.maxDailyReviews,
      maxDailyNew: body.maxDailyNew,
      loadBalanceBacklog: body.loadBalanceBacklog,
      forecastDays: body.forecastDays,
    });

    const day = resolveDayWindow(new Date(), settings.timezone, settings.dayCutoffHour);

    return NextResponse.json({
      success: true,
      message: "Daily scheduling settings updated",
      settings,
      resolvedDay: day,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update settings";
    console.error("PUT /api/srs/settings error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
