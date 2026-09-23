import { NextResponse } from "next/server";
import { getCmsService } from "@/services/cms";
import {
  cmsErrorResponse,
  ok,
  requireTranslationItem,
  routeId,
  sanitizeAuditEvents,
} from "../../_lib";
import type { RouteParams } from "../../_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/cms/translations/[id]/audit — audit trail, IP-stripped.
 * Requires cms.read. Slice-scoped: non-translation ids 404. Read-only.
 */
export async function GET(
  _request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const service = getCmsService();
    const id = await routeId(params);
    await requireTranslationItem(service, id);
    const events = await service.getAuditTrail(id);
    return ok({ audit: sanitizeAuditEvents(events) });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
