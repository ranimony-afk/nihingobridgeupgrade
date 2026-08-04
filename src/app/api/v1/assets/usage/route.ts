import { db } from "@/db";
import { assetUsages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/assets/usage?assetId=1
 * POST /api/v1/assets/usage { assetId, entityType, entityId, field }
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const assetIdRaw = url.searchParams.get("assetId");
    if (!assetIdRaw) return fail("assetId required", 400, "BAD_REQUEST");

    const rows = await db
      .select()
      .from(assetUsages)
      .where(eq(assetUsages.assetId, Number(assetIdRaw)));

    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      assetId: number;
      entityType: string;
      entityId: number;
      field: string;
    };
    if (!body.assetId || !body.entityType || !body.entityId || !body.field) {
      return fail("assetId, entityType, entityId, field required", 400, "BAD_REQUEST");
    }

    const inserted = await db.insert(assetUsages).values(body).returning();
    return ok(inserted[0], { status: 201 });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
