import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness probe.
 *  - Verifies DB connectivity.
 *  - Ensures the unified brand/catalog seed exists.
 * Kept backwards-compatible: response still contains { ok: boolean }.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    await ensureSeed();
    return Response.json({
      ok: true,
      service: "unified-learning-platform",
      brands: ["ascend", "nihongo"],
      api: "/api/v1",
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
