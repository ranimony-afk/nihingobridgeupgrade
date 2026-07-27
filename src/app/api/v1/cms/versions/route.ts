import { db } from "@/db";
import { contentVersions } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType") ?? "section";
    const entityIdRaw = url.searchParams.get("entityId");

    if (!entityIdRaw) return fail("entityId is required", 400, "BAD_REQUEST");
    const entityId = Number(entityIdRaw);

    const rows = await db
      .select()
      .from(contentVersions)
      .where(and(eq(contentVersions.entityType, entityType), eq(contentVersions.entityId, entityId)))
      .orderBy(desc(contentVersions.createdAt));

    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
