import { NextRequest, NextResponse } from "next/server";
import { DictionaryService } from "@/services/dictionary";
import {
  kanjiLexicalGraphService,
  extractKanjiCharacters,
} from "@/services/knowledge/kanjiLexicalGraphService";
import { errorBody } from "@/lib/api/routeParams";

export const dynamic = "force-dynamic";

/**
 * GET /api/dictionary/entry/[id]
 *
 * Phase 14.4F-R. Canonical dictionary entry enriched with the verified 14.4E
 * lexical graph:
 *
 *   entry         — canonical record (post learner-publication overlay)
 *   kanji         — canonical kanji records for characters in the headword
 *   sentences     — linked example sentences (existing canonical records)
 *   relatedGrammar— linked grammar patterns
 *   kanjiEdges    — word → kanji edges with 0-based character positions
 *   keigo         — honorific register relations, when any exist
 *
 * `keigo` is derived, not canonical: the underlying relations are modelled by
 * the 14.4E lexical graph and must not be read as verified per-entry attestation.
 *
 * Accepts either the canonical id (`de-jmdict-…`) or the headword.
 * Read-only. No canonical mutation.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(errorBody("MISSING_ID", "Missing entry identifier"), {
        status: 400,
      });
    }

    const identifier = decodeURIComponent(id);
    const detail = await DictionaryService.getEntryDetail(identifier);

    if (!detail) {
      return NextResponse.json(errorBody("NOT_FOUND", "Entry not found"), { status: 404 });
    }

    const entryId = detail.entry.id;

    // Graph enrichment is best-effort: a graph-layer failure must not take down
    // the canonical entry response, matching the publication-overlay precedent
    // in DictionaryService.getEntryDetail.
    let kanjiEdges: unknown[] = [];
    let keigo: unknown[] = [];

    try {
      [kanjiEdges, keigo] = await Promise.all([
        kanjiLexicalGraphService.getVocabularyKanji(entryId),
        kanjiLexicalGraphService.getKeigoRelations(entryId),
      ]);
    } catch (graphError) {
      console.warn(
        "Dictionary entry graph enrichment unavailable; serving canonical record.",
        graphError
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...detail,
        kanjiEdges,
        keigo,
        headwordKanji: extractKanjiCharacters(detail.entry.headword),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load dictionary entry";
    console.error("GET /api/dictionary/entry/[id] error:", error);
    return NextResponse.json(errorBody("INTERNAL_ERROR", message), { status: 500 });
  }
}
