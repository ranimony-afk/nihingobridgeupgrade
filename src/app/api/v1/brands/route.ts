import { db } from "@/db";
import { brands } from "@/db/schema";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeed();
    const rows = await db.select().from(brands);
    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
