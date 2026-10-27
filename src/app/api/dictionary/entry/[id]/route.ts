import { NextRequest, NextResponse } from "next/server";
import { DictionaryService } from "@/services/dictionary";
import { withDictionaryRead } from "@/services/dictionary/readTransaction";
import { MAX_DICTIONARY_RELATED_KANJI } from "@/lib/dictionary/limits";
import {
  kanjiLexicalGraphService,
  extractKanjiCharacters,
} from "@/services/knowledge/kanjiLexicalGraphService";
import { errorBody, isValidRouteIdentifier, MAX_SEARCH_QUERY_LENGTH } from "@/lib/api/routeParams";

export const dynamic = "force-dynamic";

/** GET /api/dictionary/entry/[id] — read-only entry with best-effort graph enrichment. */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let id: string;
  try {
    id = (await context.params).id;
  } catch {
    return NextResponse.json(errorBody("INVALID_ID", "Entry identifier is invalid"), {
      status: 400,
    });
  }
  if (!isValidRouteIdentifier(id)) {
    return NextResponse.json(errorBody("INVALID_ID", "Entry identifier is invalid"), {
      status: 400,
    });
  }

  try {
    const detail = await DictionaryService.getEntryDetail(id);
    if (!detail) {
      return NextResponse.json(errorBody("NOT_FOUND", "Entry not found"), { status: 404 });
    }

    let kanjiEdges: unknown[] = [];
    let keigo: unknown[] = [];
    try {
      [kanjiEdges, keigo] = await withDictionaryRead(async (tx) => {
        const edges = await kanjiLexicalGraphService.getVocabularyKanji(detail.entry.id, {
          db: tx,
          maxEdges: MAX_DICTIONARY_RELATED_KANJI,
        });
        const relations = await kanjiLexicalGraphService.getKeigoRelations(detail.entry.id, tx);
        return [edges, relations];
      });
    } catch {
      // Graph enrichment is optional; retain the canonical entry response.
      console.warn("Dictionary entry graph enrichment unavailable");
    }

    return NextResponse.json({
      success: true,
      data: {
        ...detail,
        kanjiEdges,
        keigo,
        headwordKanji: extractKanjiCharacters(detail.entry.headword.slice(0, MAX_SEARCH_QUERY_LENGTH))
          .slice(0, MAX_DICTIONARY_RELATED_KANJI),
      },
    });
  } catch {
    console.error("GET /api/dictionary/entry/[id] failed");
    return NextResponse.json(errorBody("INTERNAL_ERROR", "Failed to load dictionary entry"), {
      status: 500,
    });
  }
}
