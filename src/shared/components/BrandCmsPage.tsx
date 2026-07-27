import React from "react";
import { getBrand } from "@/lib/brands";
import { ensureSeed } from "@/lib/seed";
import { BrandService, CmsService } from "@/shared/services";
import { BrandHeader } from "@/shared/components/BrandHeader";
import { CmsSection } from "@/shared/components/CmsSection";

export async function BrandCmsPage({
  brandSlug,
  pageSlug,
  locale = "en",
  preview = false,
}: {
  brandSlug: string;
  pageSlug: string;
  locale?: string;
  preview?: boolean;
}) {
  await ensureSeed();
  const cfg = getBrand(brandSlug);
  if (!cfg) return null;

  const brand = await BrandService.getBySlug(brandSlug);
  if (!brand) return null;

  const sections = preview
    ? await CmsService.getAllSections(brand.id, pageSlug, "en")
    : await CmsService.getSections(brand.id, pageSlug, "en");
  const footerSettings = (await CmsService.getSettings(brand.id, "footer")) as { copyright?: string; tagline?: string } | null;

  return (
    <main
      className="min-h-screen px-6 py-12"
      style={{ background: cfg.theme.surface, color: cfg.theme.text }}
      lang={locale}
    >
      <div className="mx-auto max-w-5xl space-y-12">
        <BrandHeader brand={cfg} currentLocale={locale} />

        {preview && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900">
            👁 Preview mode — drafts and unpublished sections are rendered with badges.
          </div>
        )}

        {sections.map((sec) => (
          <CmsSection
            key={sec.id}
            section={sec as never}
            brand={cfg}
            preview={preview}
          />
        ))}

        {sections.length === 0 && (
          <div className="rounded-2xl bg-white/80 p-8 text-center text-sm opacity-60 shadow-sm">
            This page has no {preview ? "defined" : "published"} CMS sections yet.
          </div>
        )}

        <footer className="mt-16 border-t border-black/10 pt-8 text-center text-xs opacity-60">
          <p>{footerSettings?.copyright ?? `© ${new Date().getFullYear()} ${cfg.name}. All rights reserved.`}</p>
          <p className="mt-1">{footerSettings?.tagline ?? cfg.tagline}</p>
        </footer>
      </div>
    </main>
  );
}
