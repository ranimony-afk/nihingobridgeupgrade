import { NextRequest, NextResponse } from "next/server";
import { KnowledgeService } from "@/services/knowledge/knowledgeService";

export const dynamic = "force-dynamic";

/** GET /api/kanji — list kanji, optionally filtered by JLPT level or element.
 *
 * M9A counting contract: `total` is the filtered result count, `catalogTotal`
 * is the unfiltered catalog size, `elementFilter` explains a selected
 * element's zero/non-zero result (excluded-by-facet breakdown, integrity
 * gaps), and each palette element carries `usedInCount` (distinct catalog
 * characters), `relationshipCount` (graph edges), and `visibleKanjiCount`
 * (what clicking the element will show under the active level/keyword
 * facets). All numbers derive from the single pure implementation in
 * `src/lib/kanji/elementFilterContract.ts`.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;

    const level = sp.get("level") || undefined;
    const keyword = sp.get("q") || undefined;

    const result = await KnowledgeService.listKanji({
      level,
      elementId: sp.get("elementId") || undefined,
      keyword,
      limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : 200,
      offset: sp.get("offset") ? parseInt(sp.get("offset")!, 10) : 0,
    });

    const elements = sp.get("includeElements") === "1"
      ? await KnowledgeService.listElements(sp.get("elementCategory") || undefined, { level, keyword })
      : undefined;

    return NextResponse.json({
      success: true,
      total: result.total,
      catalogTotal: result.catalogTotal,
      elementFilter: result.elementFilter ?? null,
      emptyKind: result.emptyKind ?? null,
      kanji: result.kanji,
      ...(elements ? { elements } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load kanji";
    console.error("GET /api/kanji error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
