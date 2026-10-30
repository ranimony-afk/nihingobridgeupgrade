import { NextRequest, NextResponse } from "next/server";
import { TestService } from "@/services/jlpt/testService";
import { resolveSelfIdentity } from "@/lib/auth/learningIdentity";
import {
  authenticateActor,
  selfIdentityFailureResponse,
} from "@/app/api/_shared/authorizationResponse";
import { logOperationFailure } from "@/lib/logging/safeDiagnostics";

export const dynamic = "force-dynamic";

/**
 * The service's own parameter type, derived rather than restated so the route
 * cannot drift from the contract it is calling (and so `userId` stays required).
 */
type StartSessionInput = Parameters<typeof TestService.startSession>[0];

/**
 * POST /api/jlpt/session/start — begin an exam/drill session for the caller.
 *
 * Phase 26F-E2. Before this, `body.userId` went straight into
 * `TestService.startSession({ userId })`, which fell back to
 * `"anonymous-user"` when it was absent:
 *
 *     const { userId } = body;
 *     await TestService.startSession({ userId, ... });
 *
 * so an anonymous caller could mint a session owned by any learner. That
 * session is the anchor for later grading, analytics updates and XP awards, so
 * the spoofed owner — not the caller — would receive them.
 *
 * The body may still *name* a user (older clients do); that claim is compared
 * against the verified actor and a foreign claim is refused before any write.
 */
export async function POST(request: NextRequest) {
  /* Authorization before the body is read. */
  const auth = await authenticateActor("Failed to start test session");
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Request body must be valid JSON",
        code: "VALIDATION_ERROR",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const identity = resolveSelfIdentity(auth.actor, body.userId);
  if (!identity.ok) return selfIdentityFailureResponse(identity.reason);

  const {
    testId,
    quizType = "jlpt_mock",
    jlptLevel = "N5",
    sectionFilter = "all",
    isTimed = true,
    customTimeMinutes,
    questionLimit,
    questionCategories,
  } = body as {
    testId?: string;
    quizType?: StartSessionInput["quizType"];
    jlptLevel?: StartSessionInput["jlptLevel"];
    sectionFilter?: string;
    isTimed?: boolean;
    customTimeMinutes?: number;
    questionLimit?: number;
    questionCategories?: StartSessionInput["questionCategories"];
  };

  try {
    const sessionInfo = await TestService.startSession({
      /* Verified identity, never `body.userId`, and no sentinel fallback. */
      userId: identity.userId,
      testId,
      quizType,
      jlptLevel,
      sectionFilter,
      isTimed,
      customTimeMinutes,
      questionLimit,
      questionCategories,
    });

    return NextResponse.json(
      {
        success: true,
        ...sessionInfo,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logOperationFailure("error", "TestService.startSession", error);
    return NextResponse.json(
      { success: false, error: "Failed to start test session", code: "INTERNAL_ERROR" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
