import { NextResponse } from "next/server";

import { getEtlStatus } from "@/repositories/etl";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/etl/status
 * Read-only control surface for the knowledge ETL (provenance + run history).
 */
export async function GET() {
  const status = await getEtlStatus();
  return NextResponse.json(status);
}
