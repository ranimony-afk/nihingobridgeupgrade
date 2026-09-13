import { NextResponse } from "next/server";

import { getRadicalById } from "@/repositories/knowledge";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/radicals/12 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsed = Number(id);
  if (!Number.isInteger(parsed)) {
    return NextResponse.json({ error: "radical id must be an integer" }, { status: 400 });
  }

  const radical = await getRadicalById(parsed);
  if (!radical) {
    return NextResponse.json({ error: `radical ${id} not found` }, { status: 404 });
  }

  return NextResponse.json(radical);
}
