import { db } from "@/db";
import { brands } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureSeed();
    const { slug } = await ctx.params;
    const rows = await db.select().from(brands).where(eq(brands.slug, slug)).limit(1);
    if (rows.length === 0) return fail("brand not found", 404, "NOT_FOUND");
    return ok(rows[0]);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
