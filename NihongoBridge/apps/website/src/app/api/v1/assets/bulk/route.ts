import { db } from "@/db";
import { assets, brands, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";
import { defaultStorage, generateResponsiveVariants } from "@/shared/media";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/assets/bulk { brand?, items: Array<{ kind, url, title? }> }
 */
export async function POST(req: Request) {
  try {
    await ensureSeed();
    const body = (await req.json()) as {
      brand?: string;
      items: Array<{
        kind: string;
        url: string;
        title?: string;
        category?: string;
      }>;
    };

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return fail("items array required", 400, "BAD_REQUEST");
    }

    let brandId: number | null = null;
    if (body.brand) {
      const brandRow = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.slug, body.brand))
        .limit(1);
      if (brandRow.length > 0) brandId = brandRow[0].id;
    }

    const insertedRows = await Promise.all(
      body.items.map(async (item) => {
        const checksum = defaultStorage.generateChecksum(item.url);
        const variants = item.kind === "image" ? generateResponsiveVariants(item.url) : {};
        const cdnUrl = defaultStorage.getCdnUrl(item.url);

        const res = await db
          .insert(assets)
          .values({
            brandId,
            kind: item.kind,
            url: item.url,
            cdnUrl,
            title: item.title ?? "Bulk asset",
            category: item.category ?? "bulk",
            checksum,
            variants: variants as Record<string, string>,
          })
          .returning();
        return res[0];
      }),
    );

    await db.insert(auditLogs).values({
      action: "bulk_upload_assets",
      entityType: "asset",
      entityId: insertedRows[0]?.id ?? 0,
      details: { count: insertedRows.length },
    });

    return ok(insertedRows, { status: 201 });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
