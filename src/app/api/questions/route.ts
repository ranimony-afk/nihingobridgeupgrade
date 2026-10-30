import { NextRequest, NextResponse } from "next/server";
import { TestService } from "@/services/jlpt/testService";
import { AuthorizationError } from "@/lib/auth";
import { createQuestion } from "@/services/jlpt/questionAuthoring";
import { QuestionAuthoringError } from "@/services/jlpt/questionDraft";
import { JLPTLevel, QuestionCategory, QuestionSection } from "@/types/quiz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const level = searchParams.get("level") as JLPTLevel | null;
    const section = searchParams.get("section") as QuestionSection | null;
    const category = searchParams.get("category") as QuestionCategory | null;
    const mondaiNumber = searchParams.get("mondaiNumber")
      ? parseInt(searchParams.get("mondaiNumber")!, 10)
      : undefined;
    const keyword = searchParams.get("keyword") || undefined;
    const tag = searchParams.get("tag") || undefined;
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!, 10)
      : 50;
    const offset = searchParams.get("offset")
      ? parseInt(searchParams.get("offset")!, 10)
      : 0;

    const data = await TestService.queryQuestions({
      level: level || undefined,
      section: section || undefined,
      category: category || undefined,
      mondaiNumber,
      keyword,
      tag,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      total: data.total,
      questions: data.questions,
    });
  } catch (error) {
    // A failing query's message carries the SQL text and its bound parameters
    // (e.g. `Failed query: select ... params: ...`). Neither the response nor
    // the log may echo it: clients get a stable message, operators get the
    // error class only. Same convention as GET /api/search (PR #19).
    console.error(
      "GET /api/questions failed:",
      error instanceof Error ? error.name : "unknown error"
    );
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch questions",
        code: "INTERNAL_ERROR",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

/**
 * POST /api/questions — create one question bank entry.
 *
 * AUTHENTICATED + AUTHORIZED. This route used to accept anonymous writes;
 * it now delegates to `createQuestion()` (src/services/jlpt/questionAuthoring.ts),
 * which verifies the server-side identity and requires `cms.create` BEFORE
 * the body is parsed, validated, or written. The route itself performs no
 * database access, so the service is the single enforcement point.
 *
 * Responses (the pre-existing envelope is preserved — `error` stays a
 * human-readable string so existing callers keep working; `code` is added
 * for machine handling):
 *   200 { success: true, message, id }
 *   400 { success: false, error, code: "VALIDATION_ERROR", field? }
 *   401 { success: false, error, code: "UNAUTHENTICATED" }
 *   403 { success: false, error, code: "FORBIDDEN" }
 *   409 { success: false, error, code: "QUESTION_ID_CONFLICT", field? }
 *   500 { success: false, error, code: "INTERNAL_ERROR" }
 *
 * Error bodies never contain SQL, constraint names, driver text, stack
 * traces, credentials, or authorization internals.
 */
export async function POST(request: Request) {
  try {
    // Read the raw body only. Interpretation is the service's job, and it
    // happens strictly after the authorization check.
    const rawBody = await request.text();
    const { id } = await createQuestion(rawBody);

    return NextResponse.json(
      {
        success: true,
        message: "Question created successfully",
        id,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return questionErrorResponse(error);
  }
}

/** Map a failure to a sanitized, non-cacheable HTTP response. */
function questionErrorResponse(error: unknown): NextResponse {
  const noStore = { headers: { "Cache-Control": "no-store" } };

  if (error instanceof AuthorizationError) {
    // Canonical 401/403 payload semantics, flattened into this route's
    // pre-existing `error: string` envelope. AuthorizationError messages
    // are already generic by construction.
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status, ...noStore }
    );
  }

  if (error instanceof QuestionAuthoringError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        code: error.code,
        ...(error.field !== undefined ? { field: error.field } : {}),
      },
      { status: error.status, ...noStore }
    );
  }

  // Unexpected failure: full detail stays in server logs, the client gets
  // a stable message with no internal state.
  console.error("POST /api/questions error:", error);
  return NextResponse.json(
    { success: false, error: "Failed to create question.", code: "INTERNAL_ERROR" },
    { status: 500, ...noStore }
  );
}
