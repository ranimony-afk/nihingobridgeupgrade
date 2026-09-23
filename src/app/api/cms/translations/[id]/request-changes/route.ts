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
 * POST /api/cms/translations/[id]/request-changes — review → draft.
 * Requires cms.approve (reviewer/admin only).
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
    const item = await service.requestChanges(id, {
      expectedVersion: readExpectedVersion(body),
      reason: body.reason,
    });
    return ok(item);
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
