import { db } from "@/db";
import { assetVersions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await ctx.params;
    const assetId = Number(idParam);
    if (!Number.isFinite(assetId)) return fail("invalid id", 400, "BAD_REQUEST");

    const rows = await db
      .select()
      .from(assetVersions)
      .where(eq(assetVersions.assetId, assetId))
      .orderBy(desc(assetVersions.createdAt));

    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
