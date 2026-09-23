import { NextResponse } from "next/server";
import { getCmsService } from "@/services/cms";
import {
  cmsErrorResponse,
  ok,
  parseJsonBody,
  readExpectedVersion,
  requireTranslationItem,
  routeId,
} from "../_lib";
import type { RouteParams } from "../_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/cms/translations/[id] — fetch one translation proposal.
 * Requires cms.read. Non-translation ids 404 identically to missing ids.
 */
export async function GET(
  _request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const item = await requireTranslationItem(
      getCmsService(),
      await routeId(params)
    );
    return ok(item);
  } catch (error) {
    return cmsErrorResponse(error);
  }
}

/**
 * PATCH /api/cms/translations/[id] — edit a translation proposal draft.
 * Requires cms.edit. Scope is proven before the mutation runs.
 */
export async function PATCH(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const body = await parseJsonBody(request);
    const service = getCmsService();
    const id = await routeId(params);
    await requireTranslationItem(service, id);
    const item = await service.updateDraft(id, {
      expectedVersion: readExpectedVersion(body),
      title: body.title,
      stagedPayload: body.stagedPayload,
      editorialNotes: body.editorialNotes,
      changeSummary: body.changeSummary,
    });
    return ok(item);
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
