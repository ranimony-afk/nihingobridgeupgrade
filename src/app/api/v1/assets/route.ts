import { db } from "@/db";
import { assets, brands, assetVersions, auditLogs } from "@/db/schema";
import { and, eq, ilike } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";
import { ASSET_KINDS, defaultStorage, generateResponsiveVariants } from "@/shared/media";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/assets?brand=ascend&kind=image&category=hero&folderId=1&search=logo
 * POST /api/v1/assets (Create asset with duplicate detection, WebP/AVIF variants, metadata)
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const brandSlug = url.searchParams.get("brand");
    const kind = url.searchParams.get("kind");
    const category = url.searchParams.get("category");
    const folderId = url.searchParams.get("folderId");
    const search = url.searchParams.get("search");

    const filters = [] as ReturnType<typeof eq>[];
    if (brandSlug) {
      const brandRow = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.slug, brandSlug))
        .limit(1);
      if (brandRow.length === 0) return ok([]);
      filters.push(eq(assets.brandId, brandRow[0].id));
    }
    if (kind) filters.push(eq(assets.kind, kind));
    if (category) filters.push(eq(assets.category, category));
    if (folderId) filters.push(eq(assets.folderId, Number(folderId)));

    const rows = filters.length
      ? await db.select().from(assets).where(and(...filters))
      : await db.select().from(assets);

    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    await ensureSeed();
    const body = (await req.json()) as {
      brand?: string;
      kind?: string;
      url?: string;
      title?: string;
      altText?: string;
      caption?: string;
      category?: string;
      tags?: string[];
      copyright?: string;
      licensing?: string;
      owner?: string;
      usageRights?: string;
      mimeType?: string;
      bytes?: number;
      folderId?: number;
      collectionId?: number;
      metadata?: Record<string, unknown>;
    };

    if (!body.kind || !body.url) return fail("kind and url are required", 400, "BAD_REQUEST");
    if (!(ASSET_KINDS as readonly string[]).includes(body.kind)) {
      return fail("invalid kind", 400, "BAD_REQUEST");
    }

    let brandId: number | null = null;
    if (body.brand) {
      const brandRow = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.slug, body.brand))
        .limit(1);
      if (brandRow.length === 0) return fail("brand not found", 404, "NOT_FOUND");
      brandId = brandRow[0].id;
    }

    // Duplicate detection via checksum
    const checksum = defaultStorage.generateChecksum(body.url);
    const duplicate = await db.select().from(assets).where(eq(assets.checksum, checksum)).limit(1);

    const variants = body.kind === "image" ? generateResponsiveVariants(body.url) : {};
    const cdnUrl = defaultStorage.getCdnUrl(body.url);

    const inserted = await db
      .insert(assets)
      .values({
        brandId,
        folderId: body.folderId ?? null,
        collectionId: body.collectionId ?? null,
        kind: body.kind,
        url: body.url,
        cdnUrl,
        title: body.title ?? null,
        altText: body.altText ?? null,
        caption: body.caption ?? null,
        category: body.category ?? "media",
        tags: body.tags ?? [],
        copyright: body.copyright ?? "All rights reserved",
        licensing: body.licensing ?? "Standard Enterprise License",
        owner: body.owner ?? "Organization",
        usageRights: body.usageRights ?? "Internal and Marketing",
        checksum,
        mimeType: body.mimeType ?? null,
        bytes: body.bytes ?? null,
        variants: variants as Record<string, string>,
        transcodeStatus: body.kind === "video" ? "ready" : "ready",
        metadata: body.metadata ?? {},
      })
      .returning();

    const record = inserted[0];

    // Create Initial Version Record
    await db.insert(assetVersions).values({
      assetId: record.id,
      versionNumber: 1,
      url: record.url,
      bytes: record.bytes,
      mimeType: record.mimeType,
      changeNotes: "Initial asset upload",
    });

    await db.insert(auditLogs).values({
      action: "upload_asset",
      entityType: "asset",
      entityId: record.id,
      details: { checksum, isDuplicate: duplicate.length > 0 },
    });

    return ok({ ...record, isDuplicate: duplicate.length > 0 }, { status: 201 });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
