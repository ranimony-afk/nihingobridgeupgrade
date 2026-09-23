import { NextResponse } from "next/server";
import { getCmsService } from "@/services/cms";
import {
  cmsErrorResponse,
  ok,
  parseJsonBody,
  readExpectedVersion,
  requireTranslationItem,
  routeId,
} from "../../_lib";
import type { RouteParams } from "../../_lib";

export const dynamic = "force-dynamic";

/**
 * POST /api/cms/translations/[id]/verify — verify an approved proposal
 * into the canonical entity_translations table (approved → published).
 * Requires cms.verify_translation. Delegates to
 * CmsService.verifyTranslationProposal(), which authorizes, validates,
 * writes through TranslationService inside the CMS transaction, and
 * audits. This route NEVER touches TranslationService directly.
 */
export async function POST(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const body = await parseJsonBody(request);
    const service = getCmsService();
    const id = await routeId(params);
    await requireTranslationItem(service, id);
    const item = await service.verifyTranslationProposal(id, {
      expectedVersion: readExpectedVersion(body),
      changeSummary: body.changeSummary,
    });
    return ok(item);
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
