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
 * POST /api/cms/translations/[id]/approve-override — admin emergency
 * self-approval. Requires cms.approve AND the admin role plus a reason.
 * Included (beyond the minimal list) so translation self-approvals stay
 * resolvable through the same audited mechanism as every other type.
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
    const item = await service.approveWithAdminOverride(id, {
      expectedVersion: readExpectedVersion(body),
      reason: body.reason,
      changeSummary: body.changeSummary,
    });
    return ok(item);
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
