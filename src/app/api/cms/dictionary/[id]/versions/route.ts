import { NextResponse } from "next/server";
import { getCmsService } from "@/services/cms";
import {
  cmsErrorResponse,
  ok,
  requireDictionaryItem,
  routeId,
} from "../../_lib";
import type { RouteParams } from "../../_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/cms/dictionary/[id]/versions — immutable version history.
 * Requires cms.read. Slice-scoped: non-dictionary ids 404. Read-only.
 */
export async function GET(
  _request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const service = getCmsService();
    const id = await routeId(params);
    await requireDictionaryItem(service, id);
    const versions = await service.getVersions(id);
    return ok({ versions });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}
