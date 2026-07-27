import { db } from "@/db";
import { nihongoLearningItems } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";
import { parsePagination, buildPaginatedEnvelope } from "@/shared/mobile";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mobile/kanji?jlptLevel=N5&page=1&limit=20
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const jlptLevel = url.searchParams.get("jlptLevel");
    const { page, limit, offset } = parsePagination(url);

    const filters = [eq(nihongoLearningItems.category, "kanji")];
    if (jlptLevel) filters.push(eq(nihongoLearningItems.jlptLevel, jlptLevel));

    const rows = await db.select().from(nihongoLearningItems).where(and(...filters));
    const paged = rows.slice(offset, offset + limit);
    const envelope = buildPaginatedEnvelope(paged, rows.length, page, limit);

    return Response.json(envelope, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
