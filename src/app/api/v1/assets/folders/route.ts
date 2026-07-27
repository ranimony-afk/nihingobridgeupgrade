import { db } from "@/db";
import { assetFolders, brands } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/assets/folders?brand=ascend
 * POST /api/v1/assets/folders { brand, name, slug, parentId? }
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const brandSlug = url.searchParams.get("brand");

    const filters = [] as ReturnType<typeof eq>[];
    if (brandSlug) {
      const brandRow = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.slug, brandSlug))
        .limit(1);
      if (brandRow.length === 0) return ok([]);
      filters.push(eq(assetFolders.brandId, brandRow[0].id));
    }

    const rows = filters.length
      ? await db.select().from(assetFolders).where(and(...filters))
      : await db.select().from(assetFolders);

    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    await ensureSeed();
    const body = (await req.json()) as {
      brand: string;
      name: string;
      slug: string;
      parentId?: number;
    };
    if (!body.brand || !body.name || !body.slug) {
      return fail("brand, name, slug required", 400, "BAD_REQUEST");
    }

    const brandRow = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.slug, body.brand))
      .limit(1);
    if (brandRow.length === 0) return fail("brand not found", 404, "NOT_FOUND");

    const inserted = await db
      .insert(assetFolders)
      .values({
        brandId: brandRow[0].id,
        name: body.name,
        slug: body.slug,
        parentId: body.parentId ?? null,
      })
      .returning();

    return ok(inserted[0], { status: 201 });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
