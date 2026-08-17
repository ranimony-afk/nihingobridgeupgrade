import { db } from "@/db";
import { contentVersions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { computeVisualDiff } from "@/shared/workflow";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/workflow/diff?versionA=1&versionB=2
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const versionAId = url.searchParams.get("versionA");
    const versionBId = url.searchParams.get("versionB");

    if (!versionAId || !versionBId) {
      return fail("versionA and versionB IDs required", 400, "BAD_REQUEST");
    }

    const rowA = await db.select().from(contentVersions).where(eq(contentVersions.id, Number(versionAId))).limit(1);
    const rowB = await db.select().from(contentVersions).where(eq(contentVersions.id, Number(versionBId))).limit(1);

    if (rowA.length === 0 || rowB.length === 0) {
      return fail("One or both versions not found", 404, "NOT_FOUND");
    }

    const diff = computeVisualDiff(
      rowA[0].snapshot as Record<string, unknown>,
      rowB[0].snapshot as Record<string, unknown>,
    );

    return ok({
      versionA: rowA[0],
      versionB: rowB[0],
      diff,
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
