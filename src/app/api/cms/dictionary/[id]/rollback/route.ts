import { NextResponse } from "next/server";
import { getCmsService } from "@/services/cms";
import {
  cmsErrorResponse,
  ok,
  parseJsonBody,
  readExpectedVersion,
  requireDictionaryItem,
  routeId,
} from "../../_lib";
import type { RouteParams } from "../../_lib";

export const dynamic = "force-dynamic";

/**
 * POST /api/cms/dictionary/[id]/rollback — restore an earlier snapshot
 * into a new version. Requires cms.rollback (admin-only). History is
 * preserved; the target snapshot is copied, never moved.
 */
export async function POST(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const body = await parseJsonBody(request);
    const service = getCmsService();
    const id = await routeId(params);
    await requireDictionaryItem(service, id);
    const item = await service.rollback(id, {
      expectedVersion: readExpectedVersion(body),
      targetVersion: body.targetVersion as number,
      changeSummary: body.changeSummary,
    });
    return ok(item);
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
