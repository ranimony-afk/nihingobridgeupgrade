import { db } from "@/db";
import { nihongoLearningItems, brands, auditLogs } from "@/db/schema";
import { and, eq, ilike } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/nihongo/items?category=vocabulary&jlptLevel=N5&search=taberu
 * POST /api/v1/nihongo/items (Admin CRUD for educational content)
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const category = url.searchParams.get("category");
    const jlptLevel = url.searchParams.get("jlptLevel");
    const search = url.searchParams.get("search");

    const filters = [] as ReturnType<typeof eq>[];
    if (category) filters.push(eq(nihongoLearningItems.category, category));
    if (jlptLevel) filters.push(eq(nihongoLearningItems.jlptLevel, jlptLevel));

    let rows = filters.length
      ? await db.select().from(nihongoLearningItems).where(and(...filters))
      : await db.select().from(nihongoLearningItems);

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.japanese.toLowerCase().includes(q) ||
          r.meaning.toLowerCase().includes(q) ||
          (r.romaji && r.romaji.toLowerCase().includes(q)),
      );
    }

    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    await ensureSeed();
    const body = (await req.json()) as {
      category: string;
      jlptLevel?: string;
      japanese: string;
      furigana?: string;
      romaji?: string;
      meaning: string;
      exampleSentenceJa?: string;
      exampleSentenceEn?: string;
      grammarStructure?: string;
      strokeCount?: number;
      radicals?: string;
      tags?: string[];
    };

    if (!body.category || !body.japanese || !body.meaning) {
      return fail("category, japanese, meaning are required", 400, "BAD_REQUEST");
    }

    const brandRow = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.slug, "nihongo"))
      .limit(1);
    const brandId = brandRow[0]?.id ?? null;

    const inserted = await db
      .insert(nihongoLearningItems)
      .values({
        brandId,
        category: body.category,
        jlptLevel: body.jlptLevel ?? "N5",
        japanese: body.japanese,
        furigana: body.furigana ?? null,
        romaji: body.romaji ?? null,
        meaning: body.meaning,
        exampleSentenceJa: body.exampleSentenceJa ?? null,
        exampleSentenceEn: body.exampleSentenceEn ?? null,
        grammarStructure: body.grammarStructure ?? null,
        strokeCount: body.strokeCount ?? null,
        radicals: body.radicals ?? null,
        tags: body.tags ?? [],
      })
      .returning();

    await db.insert(auditLogs).values({
      action: "create_learning_item",
      entityType: "nihongo_item",
      entityId: inserted[0].id,
      details: { category: body.category, japanese: body.japanese },
    });

    return ok(inserted[0], { status: 201 });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
