import { NextRequest, NextResponse } from "next/server";
import { DictionaryService } from "@/services/dictionary";
import { errorBody, isValidRouteIdentifier } from "@/lib/api/routeParams";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let id: string;
  try {
    id = (await context.params).id;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid entry identifier" }, { status: 400 });
  }
  // Next route parameters are already decoded; decoding again can corrupt IDs.
  if (!isValidRouteIdentifier(id)) {
    return NextResponse.json({ success: false, error: "Invalid entry identifier" }, { status: 400 });
  }

  try {
    const detail = await DictionaryService.getEntryDetail(id);
    if (!detail) {
      return NextResponse.json({ success: false, error: "Entry not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: detail });
  } catch {
    console.error("GET /api/dictionary/[id] failed");
    return NextResponse.json(errorBody("INTERNAL_ERROR", "Failed to load entry"), { status: 500 });
  }
}
