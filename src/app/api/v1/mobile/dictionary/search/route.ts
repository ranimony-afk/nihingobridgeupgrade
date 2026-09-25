import { NextRequest, NextResponse } from "next/server";
import { DictionaryService } from "@/services/dictionary";
import { detectSearchScript, sanitizeSearchQuery } from "@/services/search/matcher";
import { parseLimit, parseOffset, parseBooleanFlag, errorBody } from "@/lib/api/routeParams";
import { parseTargetLanguage, isQueryLengthValid, MAX_QUERY_LENGTH, projectEntry } from "./_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mobile/dictionary/search
 *
 * Gate A11 — the read-only mobile dictionary **search** endpoint frozen by A9/A10
 * (`docs/api/MOBILE-DICTIONARY-API-CONTRACT.md`, §A10.1–§A10.18).
 *
 * An adapter, not a new dictionary engine. Every domain behaviour is delegated to the existing
 * canonical implementation:
 *
 * | Concern              | Owner                                            |
 * | :------------------- | :----------------------------------------------- |
 * | query sanitation     | `sanitizeSearchQuery` (NUL-strip + trim only)     |
 * | script classification| `detectSearchScript` (six-value `SearchScript`)   |
 * | matching / ranking   | `DictionaryService.searchEntries`                 |
 * | pagination bounds    | `parseLimit` / `parseOffset` (`MAX_PAGE_LIMIT`, `MAX_OFFSET`) |
 * | JLPT classification  | `classifyJlptLevel` (via `_lib.projectEntry`)     |
 * | item projection      | `_lib.projectEntry` (hand-built 9-field DTO)      |
 *
 * Query parameters (A10 §A10.2):
 *   q               required, non-empty after sanitization, at most 1000 characters (A12 §D-14)
 *   level | jlpt    optional JLPT filter; `level` wins, `jlpt` is the legacy alias
 *   common          "true" | "false" — literal strings only
 *   limit           1..200 at the boundary (default 50); the service applies 1..100
 *   offset          0..100 000 (default 0)
 *   targetLanguage  en | ta | ml — validated, **inert in v1** (A10 §A10.12)
 *
 * GET-only by construction: only `GET` is exported, so Next.js answers every other method with its
 * standard 405 and no custom method framework is introduced.
 *
 * Response (A10 §A10.10, §A10.16): `{ success: true, data: { query, detectedScript,
 * appliedJlptLevel, entries, total, limit, offset, hasMore } }`, where `limit`/`offset` are the
 * **applied** values (the service clamps them, so they are authoritative rather than a restatement
 * of the request) and `hasMore` is exactly `offset + entries.length < total` over that applied
 * window. `page`, `returned`, `apiVersion`, `meta`, `warnings` and `pagination` are all retired or
 * never frozen and are deliberately absent.
 *
 * Security posture: authentication and rate limiting (D-13) remain **deferred** — neither is
 * implemented here, and no in-process limiter was invented to look like protection. The defensive `q`
 * length cap (D-14) **is** implemented as of A12 (`_lib.MAX_QUERY_LENGTH`), which bounds one request's
 * work but is not abuse protection. This endpoint is public and read-only, and remains *not* safe to
 * expose to production traffic until a deployment security gate decides D-13.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = sanitizeSearchQuery(params.get("q") ?? "");
  const level = params.get("level")?.trim() || params.get("jlpt")?.trim() || undefined;
  const isCommon = parseBooleanFlag(params.get("common"));
  const limit = parseLimit(params.get("limit"));
  const offset = parseOffset(params.get("offset"));

  // Validated against the canonical vocabulary, then deliberately unused: localization is
  // deferred (A10 §A10.12), so v1 must neither apply it nor reject it.
  parseTargetLanguage(params.get("targetLanguage"));

  if (!query) {
    return NextResponse.json(errorBody("MISSING_QUERY", "Query parameter 'q' is required"), {
      status: 400,
    });
  }

  // A12/D-14: the cap is judged on the sanitized value, after the emptiness check, so both
  // length and emptiness describe the same string the service would receive. Rejected, never
  // truncated. `VALIDATION_ERROR` is the repository-wide code for a present-but-invalid field
  // (`src/app/api/ai/answer/route.ts`, including its overlong-query branch); the envelope shape
  // stays the frozen `{ success: false, error: { code, message } }`.
  if (!isQueryLengthValid(query)) {
    return NextResponse.json(
      errorBody(
        "VALIDATION_ERROR",
        `Query parameter 'q' must be at most ${MAX_QUERY_LENGTH} characters`
      ),
      { status: 400 }
    );
  }

  try {
    // Classification is computed here and echoed so the client contract is explicit and testable,
    // rather than re-derived client-side from a classifier the client cannot see.
    const detectedScript = detectSearchScript(query);

    const result = await DictionaryService.searchEntries({
      query,
      jlptLevel: level,
      isCommon,
      limit,
      offset,
    });

    // The service returns canonical rows; the mobile payload is a projection of them. `map` over
    // projectEntry — never a spread of the row — is what keeps `sourceRef`, `frequencyRank`,
    // `partsOfSpeech`, `tags` and every future column out of the mobile contract.
    const entries = result.entries.map(projectEntry);

    return NextResponse.json({
      success: true,
      data: {
        query,
        detectedScript,
        appliedJlptLevel: level ?? null,
        entries,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        // Exact over the applied window (A10 §A10.10) — never a second count query, never
        // approximate. `offset` here is the applied offset, so a clamped request stays coherent.
        hasMore: result.offset + entries.length < result.total,
      },
    });
  } catch (error) {
    // Server-side diagnostics only. The web search route echoes `error.message` to the client;
    // A11 must not (A10 §A10.16 / A11 §14): a message can carry SQL text, hostnames or paths.
    console.error("GET /api/v1/mobile/dictionary/search error:", error);
    return NextResponse.json(errorBody("INTERNAL_ERROR", "Dictionary search failed"), {
      status: 500,
    });
  }
}
