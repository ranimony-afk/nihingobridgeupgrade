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
 * POST /api/cms/dictionary/[id]/archive — published → archived.
 * Requires cms.archive. History is preserved, nothing is deleted.
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
    const item = await service.archive(id, {
      expectedVersion: readExpectedVersion(body),
      changeSummary: body.changeSummary,
    });
    return ok(item);
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
