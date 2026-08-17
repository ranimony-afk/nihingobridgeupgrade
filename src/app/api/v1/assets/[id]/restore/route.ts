import { db } from "@/db";
import { assets, assetVersions, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await ctx.params;
    const versionId = Number(idParam);
    if (!Number.isFinite(versionId)) return fail("invalid id", 400, "BAD_REQUEST");

    const vRows = await db
      .select()
      .from(assetVersions)
      .where(eq(assetVersions.id, versionId))
      .limit(1);

    if (vRows.length === 0) return fail("version not found", 404, "NOT_FOUND");
    const v = vRows[0];

    const updated = await db
      .update(assets)
      .set({
        url: v.url,
        bytes: v.bytes,
        mimeType: v.mimeType,
      })
      .where(eq(assets.id, v.assetId))
      .returning();

    await db.insert(auditLogs).values({
      action: "restore_asset_version",
      entityType: "asset",
      entityId: v.assetId,
      details: { restoredVersionId: versionId },
    });

    return ok(updated[0]);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
