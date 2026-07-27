import { db } from "@/db";
import { editorialNotifications } from "@/db/schema";
import { desc } from "drizzle-orm";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(editorialNotifications)
      .orderBy(desc(editorialNotifications.createdAt))
      .limit(50);
    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
