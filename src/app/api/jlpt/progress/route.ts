import { NextRequest, NextResponse } from "next/server";
import { JLPTKnowledgeService } from "@/services/jlpt/knowledge";
import type { JLPTLevel } from "@/types/quiz";
import { resolveQueryIdentity } from "@/lib/auth/learningIdentity";
import {
  authenticateActor,
  queryIdentityFailureResponse,
} from "@/app/api/_shared/authorizationResponse";
import { logOperationFailure } from "@/lib/logging/safeDiagnostics";

export const dynamic = "force-dynamic";

/**
 * GET /api/jlpt/progress — one learner's JLPT progress.
 *
 * Phase 26F-E2. Before this, the handler read `?userId=` straight from the
 * query string and defaulted it to `"anonymous-user"`:
 *
 *     const userId = params.get("userId") || "anonymous-user";
 *     await JLPTKnowledgeService.getUserProgress(userId, level);
 *
 * so any anonymous caller could read any learner's completed-test history,
 * pass counts, average score and recent session ids.
 *
 * The contract now matches the Phase 25/26B learning routes:
 *
 *   anonymous                     → 401 (no-store, sanitized)
 *   authenticated, userId absent  → the actor's OWN progress
 *   authenticated, userId = self  → the actor's OWN progress
 *   authenticated, userId foreign → 403 (no-store, sanitized)
 *   empty / blank / repeated      → 400 (malformed parameter, not an authz denial)
 *
 * The `?userId=` value is never trusted: `resolveQueryIdentity` compares it to
 * the verified server-side actor and returns the actor's own id.
 */
export async function GET(request: NextRequest) {
  /* Authorization before the query string is even parsed. */
  const auth = await authenticateActor("Failed to load progress");
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;

  const identity = resolveQueryIdentity(auth.actor, params.getAll("userId"));
  if (!identity.ok) return queryIdentityFailureResponse(identity.reason);

  const levelRaw = (params.get("level") || "N5").toUpperCase();
  const level = (["N5", "N4", "N3", "N2", "N1"].includes(levelRaw)
    ? levelRaw
    : "N5") as JLPTLevel;

  try {
    /* Verified actor id, not a caller-supplied one. */
    const progress = await JLPTKnowledgeService.getUserProgress(identity.userId, level);
    return NextResponse.json(
      {
        success: true,
        data: progress,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    /* The thrown value can carry SQL, bound parameters and the connection
     * target, so it is classified and a fixed message is returned. */
    logOperationFailure("error", "JLPTKnowledgeService.getUserProgress", error);
    return NextResponse.json(
      { success: false, error: "Failed to load progress", code: "INTERNAL_ERROR" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
