"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  brands,
  contentSections,
  contentVersions,
  auditLogs,
  translations,
  assets,
  assetVersions,
} from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { isCmsStatus } from "@/shared/cms";

async function snapshotSection(sectionId: number, summary: string, isAutosave = false) {
  const rows = await db.select().from(contentSections).where(eq(contentSections.id, sectionId)).limit(1);
  if (rows.length === 0) return;
  await db.insert(contentVersions).values({
    entityType: "section",
    entityId: sectionId,
    versionNumber: Math.floor(Date.now() / 1000),
    snapshot: rows[0] as unknown as Record<string, unknown>,
    changeSummary: summary,
    isAutosave,
  });
}

function backToBrand(brandSlug: string, pageSlug: string, notice: string): never {
  revalidatePath(`/admin/${brandSlug}`);
  redirect(`/admin/${brandSlug}?page=${encodeURIComponent(pageSlug)}&notice=${encodeURIComponent(notice)}`);
}

/** Edit title / subtitle / content JSON / status of any section. */
export async function updateSection(formData: FormData) {
  const id = Number(formData.get("sectionId"));
  const brandSlug = String(formData.get("brandSlug"));
  const pageSlug = String(formData.get("pageSlug"));
  if (!Number.isFinite(id)) backToBrand(brandSlug, pageSlug, "Invalid section id");

  const title = String(formData.get("title") ?? "");
  const subtitle = String(formData.get("subtitle") ?? "");
  const statusRaw = String(formData.get("status") ?? "draft");
  const status = isCmsStatus(statusRaw) ? statusRaw : "draft";

  const existing = await db.select().from(contentSections).where(eq(contentSections.id, id)).limit(1);
  if (existing.length === 0) backToBrand(brandSlug, pageSlug, "Section not found");

  let content = existing[0].content as Record<string, unknown>;
  const rawJson = String(formData.get("contentJson") ?? "");
  try {
    content = JSON.parse(rawJson || "{}") as Record<string, unknown>;
  } catch {
    backToBrand(brandSlug, pageSlug, `Invalid JSON in "${existing[0].sectionKey}" — changes not saved`);
  }

  await db
    .update(contentSections)
    .set({ title, subtitle: subtitle || null, content, status, updatedAt: new Date() })
    .where(eq(contentSections.id, id));

  await snapshotSection(id, `Manual edit of "${existing[0].sectionKey}"`);
  await db.insert(auditLogs).values({
    action: "update",
    entityType: "section",
    entityId: id,
    details: { sectionKey: existing[0].sectionKey, status },
  });

  backToBrand(brandSlug, pageSlug, `Saved "${existing[0].sectionKey}" (${status})`);
}

/** Draft / Preview / Publish / Archive transitions. */
export async function setSectionStatus(formData: FormData) {
  const id = Number(formData.get("sectionId"));
  const brandSlug = String(formData.get("brandSlug"));
  const pageSlug = String(formData.get("pageSlug"));
  const status = String(formData.get("status"));
  if (!Number.isFinite(id) || !isCmsStatus(status)) {
    backToBrand(brandSlug, pageSlug, "Invalid status transition");
  }

  const existing = await db.select().from(contentSections).where(eq(contentSections.id, id)).limit(1);
  if (existing.length === 0) backToBrand(brandSlug, pageSlug, "Section not found");

  await db
    .update(contentSections)
    .set({ status, updatedAt: new Date() })
    .where(eq(contentSections.id, id));

  await snapshotSection(id, `Status transition: ${existing[0].status} → ${status}`);
  await db.insert(auditLogs).values({
    action: status === "published" ? "publish" : status === "archived" ? "archive" : "draft",
    entityType: "section",
    entityId: id,
    details: { from: existing[0].status, to: status },
  });

  backToBrand(brandSlug, pageSlug, `"${existing[0].sectionKey}" moved to ${status}`);
}

/** Reorder: swap a section with its neighbor. */
export async function moveSection(formData: FormData) {
  const id = Number(formData.get("sectionId"));
  const direction = String(formData.get("direction"));
  const brandSlug = String(formData.get("brandSlug"));
  const pageSlug = String(formData.get("pageSlug"));
  if (!Number.isFinite(id) || (direction !== "up" && direction !== "down")) {
    backToBrand(brandSlug, pageSlug, "Invalid reorder");
  }

  const current = await db.select().from(contentSections).where(eq(contentSections.id, id)).limit(1);
  if (current.length === 0) backToBrand(brandSlug, pageSlug, "Section not found");
  const cur = current[0];

  const all = await db
    .select()
    .from(contentSections)
    .where(
      and(
        eq(contentSections.brandId, cur.brandId),
        eq(contentSections.pageSlug, cur.pageSlug),
        eq(contentSections.locale, cur.locale),
      ),
    )
    .orderBy(asc(contentSections.position));

  const idx = all.findIndex((s) => s.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= all.length) {
    backToBrand(brandSlug, pageSlug, "Already at the edge — nothing to swap");
  }
  const neighbor = all[swapIdx];

  await db.update(contentSections).set({ position: neighbor.position, updatedAt: new Date() }).where(eq(contentSections.id, cur.id));
  await db.update(contentSections).set({ position: cur.position, updatedAt: new Date() }).where(eq(contentSections.id, neighbor.id));

  await db.insert(auditLogs).values({
    action: "reorder",
    entityType: "section",
    entityId: id,
    details: { direction, swappedWith: neighbor.sectionKey },
  });

  backToBrand(brandSlug, pageSlug, `Moved "${cur.sectionKey}" ${direction}`);
}

/** Duplicate a section as a draft copy. */
export async function duplicateSection(formData: FormData) {
  const id = Number(formData.get("sectionId"));
  const brandSlug = String(formData.get("brandSlug"));
  const pageSlug = String(formData.get("pageSlug"));
  if (!Number.isFinite(id)) backToBrand(brandSlug, pageSlug, "Invalid section id");

  const existing = await db.select().from(contentSections).where(eq(contentSections.id, id)).limit(1);
  if (existing.length === 0) backToBrand(brandSlug, pageSlug, "Section not found");
  const item = existing[0];

  const inserted = await db
    .insert(contentSections)
    .values({
      brandId: item.brandId,
      pageSlug: item.pageSlug,
      sectionKey: `${item.sectionKey}-copy-${Date.now().toString().slice(-4)}`,
      title: item.title ? `${item.title} (Copy)` : "Copy",
      subtitle: item.subtitle,
      content: item.content,
      position: item.position + 1,
      status: "draft",
      locale: item.locale,
    })
    .returning();

  await db.insert(auditLogs).values({
    action: "duplicate",
    entityType: "section",
    entityId: inserted[0].id,
    details: { originalId: id },
  });

  backToBrand(brandSlug, pageSlug, `Duplicated "${item.sectionKey}" as draft`);
}

/** Create a new draft section on a page. */
export async function createSection(formData: FormData) {
  const brandSlug = String(formData.get("brandSlug"));
  const pageSlug = String(formData.get("pageSlug"));
  const sectionKey = String(formData.get("sectionKey") ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!sectionKey) backToBrand(brandSlug, pageSlug, "Section key is required");

  const brandRow = await db.select().from(brands).where(eq(brands.slug, brandSlug)).limit(1);
  if (brandRow.length === 0) backToBrand(brandSlug, pageSlug, "Brand not found");

  const exists = await db
    .select()
    .from(contentSections)
    .where(
      and(
        eq(contentSections.brandId, brandRow[0].id),
        eq(contentSections.pageSlug, pageSlug),
        eq(contentSections.sectionKey, sectionKey),
        eq(contentSections.locale, "en"),
      ),
    )
    .limit(1);
  if (exists.length > 0) backToBrand(brandSlug, pageSlug, `"${sectionKey}" already exists on this page`);

  const all = await db
    .select()
    .from(contentSections)
    .where(and(eq(contentSections.brandId, brandRow[0].id), eq(contentSections.pageSlug, pageSlug)));
  const maxPos = all.reduce((m, s) => Math.max(m, s.position), 0);

  await db.insert(contentSections).values({
    brandId: brandRow[0].id,
    pageSlug,
    sectionKey,
    title: sectionKey.replace(/_/g, " "),
    subtitle: null,
    content: {},
    position: maxPos + 1,
    status: "draft",
    locale: "en",
  });

  await db.insert(auditLogs).values({
    action: "create",
    entityType: "section",
    entityId: brandRow[0].id,
    details: { sectionKey, pageSlug },
  });

  backToBrand(brandSlug, pageSlug, `Created draft section "${sectionKey}"`);
}

/** Restore a prior version snapshot. */
export async function restoreSectionVersion(formData: FormData) {
  const versionId = Number(formData.get("versionId"));
  const brandSlug = String(formData.get("brandSlug"));
  const pageSlug = String(formData.get("pageSlug"));
  if (!Number.isFinite(versionId)) backToBrand(brandSlug, pageSlug, "Invalid version id");

  const vRows = await db.select().from(contentVersions).where(eq(contentVersions.id, versionId)).limit(1);
  if (vRows.length === 0) backToBrand(brandSlug, pageSlug, "Version not found");
  const v = vRows[0];
  const snap = v.snapshot as {
    title?: string;
    subtitle?: string | null;
    content?: Record<string, unknown>;
    status?: string;
    position?: number;
  };

  await db
    .update(contentSections)
    .set({
      title: snap.title ?? null,
      subtitle: snap.subtitle ?? null,
      content: snap.content ?? {},
      status: snap.status ?? "draft",
      position: snap.position ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(contentSections.id, v.entityId));

  await db.insert(auditLogs).values({
    action: "restore",
    entityType: "section",
    entityId: v.entityId,
    details: { restoredVersionId: versionId },
  });

  revalidatePath(`/admin/${brandSlug}`);
  redirect(`/admin/${brandSlug}?page=${encodeURIComponent(pageSlug)}&notice=Restored version #${versionId}`);
}

/** Version history list helper (server). */
export async function listSectionVersions(sectionId: number) {
  return db
    .select()
    .from(contentVersions)
    .where(and(eq(contentVersions.entityType, "section"), eq(contentVersions.entityId, sectionId)))
    .orderBy(desc(contentVersions.createdAt));
}

/** Dynamic Translation save/upsert action */
export async function saveTranslation(formData: FormData) {
  const entityType = String(formData.get("entityType") ?? "brand");
  const entityId = Number(formData.get("entityId"));
  const locale = String(formData.get("locale"));
  const field = String(formData.get("field"));
  const value = String(formData.get("value"));
  const brandSlug = String(formData.get("brandSlug"));

  const existing = await db
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.entityType, entityType),
        eq(translations.entityId, entityId),
        eq(translations.locale, locale),
        eq(translations.field, field),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(translations)
      .set({ value })
      .where(eq(translations.id, existing[0].id));
  } else {
    await db.insert(translations).values({
      entityType,
      entityId,
      locale,
      field,
      value,
    });
  }

  revalidatePath(`/admin/${brandSlug}`);
  redirect(`/admin/${brandSlug}?tab=multilingual&q=${locale}&notice=Saved translation for "${field}" in ${locale.toUpperCase()}`);
}

/** Register/Upload new DAM asset */
export async function uploadCmsAsset(formData: FormData) {
  const brandSlug = String(formData.get("brandSlug"));
  const kind = String(formData.get("kind"));
  const url = String(formData.get("url"));
  const title = String(formData.get("title") ?? "");
  const altText = String(formData.get("altText") ?? "");
  const copyright = String(formData.get("copyright") ?? "All rights reserved");
  const licensing = String(formData.get("licensing") ?? "Standard Enterprise License");
  const bytes = Number(formData.get("bytes") ?? 102400);

  const brandRow = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.slug, brandSlug))
    .limit(1);

  if (brandRow.length === 0) {
    redirect(`/admin/${brandSlug}?tab=media&notice=Brand not found`);
  }

  const brandId = brandRow[0].id;
  const checksum = createHash("sha256").update(url).digest("hex");
  const duplicate = await db.select().from(assets).where(eq(assets.checksum, checksum)).limit(1);

  const base = url.replace(/\.[^/.]+$/, "");
  const variants = (kind === "image" ? {
    original: url,
    webp: `${base}.webp`,
    avif: `${base}.avif`,
    thumbnail: `${base}_thumb.webp`,
    srcSet: `${base}.webp 1x, ${base}.avif 2x`
  } : {}) as Record<string, string>;

  const inserted = await db
    .insert(assets)
    .values({
      brandId,
      kind,
      url,
      cdnUrl: `https://cdn.platform.enterprise.internal/${url.startsWith("/") ? url.slice(1) : url}`,
      title: title || null,
      altText: altText || null,
      category: "media",
      copyright,
      licensing,
      owner: "Organization",
      usageRights: "Internal and Marketing",
      checksum,
      mimeType: kind === "image" ? "image/webp" : kind === "video" ? "video/mp4" : "application/pdf",
      bytes,
      variants,
      transcodeStatus: "ready",
      metadata: {},
    })
    .returning();

  const record = inserted[0];

  // Initial version record
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

  revalidatePath(`/admin/${brandSlug}`);
  redirect(`/admin/${brandSlug}?tab=media&notice=Uploaded asset successfully! ${duplicate.length > 0 ? "(Duplicate detected via checksum!)" : ""}`);
}
