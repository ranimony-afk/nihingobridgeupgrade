import { db } from "@/db";
import { nihongoLearningItems } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";
import { parsePagination, buildPaginatedEnvelope } from "@/shared/mobile";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mobile/vocabulary?jlptLevel=N5&page=1&limit=20&search=eat
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const jlptLevel = url.searchParams.get("jlptLevel");
    const search = url.searchParams.get("search");
    const { page, limit, offset } = parsePagination(url);

    const filters = [eq(nihongoLearningItems.category, "vocabulary")];
    if (jlptLevel) filters.push(eq(nihongoLearningItems.jlptLevel, jlptLevel));

    let rows = await db.select().from(nihongoLearningItems).where(and(...filters));
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.japanese.toLowerCase().includes(q) ||
          r.meaning.toLowerCase().includes(q) ||
          (r.romaji && r.romaji.toLowerCase().includes(q)),
      );
    }

    const paged = rows.slice(offset, offset + limit);
    const envelope = buildPaginatedEnvelope(paged, rows.length, page, limit);

    return Response.json(envelope, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300",
        ETag: `"mobile-vocab-${rows.length}-${page}"`,
      },
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
