import { NextRequest, NextResponse } from "next/server";
import { DictionaryService, type SearchMode } from "@/services/knowledge/dictionary";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q") ?? "";
  const mode = (params.get("mode") ?? "auto") as SearchMode;
  const jlpt = params.get("jlpt") ? Number(params.get("jlpt")) : undefined;
  const common = params.get("common") === "true" ? true : undefined;
  const page = Number(params.get("page") ?? "1");
  const pageSize = Math.min(Number(params.get("pageSize") ?? "20"), 100);

  const result = await DictionaryService.search({
    query,
    mode,
    jlpt,
    common,
    page,
    pageSize,
  });

  return NextResponse.json({
    success: true,
    data: result.entries,
    meta: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
      searchMode: result.searchMode,
      query: result.query,
    },
  });
}
