import { db } from "@/db";
import { assets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { buildTranscodeManifest } from "@/shared/media";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await ctx.params;
    const assetId = Number(idParam);
    if (!Number.isFinite(assetId)) return fail("invalid id", 400, "BAD_REQUEST");

    const assetRows = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
    if (assetRows.length === 0) return fail("asset not found", 404, "NOT_FOUND");
    const item = assetRows[0];

    const manifest = buildTranscodeManifest(item.id, item.url);
    return ok({ ...manifest, transcodeStatus: item.transcodeStatus });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
