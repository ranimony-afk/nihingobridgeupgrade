import { NextResponse } from "next/server";
import { getCmsService } from "@/services/cms";
import {
  DICTIONARY_CONTENT_TYPE,
  cmsErrorResponse,
  ok,
  parseJsonBody,
} from "./_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/cms/dictionary — list dictionary CMS items, newest first.
 * Query: status (optional, controlled vocabulary), q (title substring),
 * limit, offset.
 * Requires cms.read. contentType is forced server-side: this slice never
 * lists other types however the query is shaped.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const offsetRaw = url.searchParams.get("offset");
    const items = await getCmsService().listItems({
      contentType: DICTIONARY_CONTENT_TYPE,
      status: url.searchParams.get("status") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      limit: limitRaw === null ? undefined : Number(limitRaw),
      offset: offsetRaw === null ? undefined : Number(offsetRaw),
    });
    return ok({ items });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}

/**
 * POST /api/cms/dictionary — create a dictionary draft.
 * Requires cms.create. contentType is forced to "dictionary": a caller
 * supplied value is ignored, never trusted. sourceRef/provenanceType come
 * from the caller and are validated, never invented.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await parseJsonBody(request);
    const item = await getCmsService().createDraft({
      contentType: DICTIONARY_CONTENT_TYPE,
      entityId: body.entityId,
      title: body.title,
      stagedPayload: body.stagedPayload,
      sourceRef: body.sourceRef,
      provenanceType: body.provenanceType,
      originalSourceRef: body.originalSourceRef,
      editorialNotes: body.editorialNotes,
      changeSummary: body.changeSummary,
    });
    return ok(item, 201);
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
