import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrand } from "@/lib/brands";
import { ensureSeed } from "@/lib/seed";
import { BrandService, PageService, CmsService } from "@/shared/services";
import { BrandHeader } from "@/shared/components";
import { CmsSection } from "@/shared/components/CmsSection";

export const dynamic = "force-dynamic";

export default async function DynamicCmsSubpage({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string; slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  await ensureSeed();
  const { brand: brandSlug, slug } = await params;
  const { lang = "en" } = await searchParams;
  const cfg = getBrand(brandSlug);
  if (!cfg) notFound();

  const brand = await BrandService.getBySlug(brandSlug);
  if (!brand) notFound();

  // Load dynamic page metadata
  const page = await PageService.getPublished(brand.id, slug, lang);
  if (!page) {
    notFound();
  }

  // Load CMS sections associated with this page
  const cmsSections = await CmsService.getSections(brand.id, slug, lang);
  const footerSettings = (await CmsService.getSettings(brand.id, "footer")) as { copyright?: string; tagline?: string } | null;
  const navSettings = (await CmsService.getSettings(brand.id, "navigation")) as { megaMenuTitle?: string; links?: Array<{ label: string; href: string; icon?: string; badge?: string; description?: string }> } | null;

  let customMegaMenuCategories = undefined;
  if (navSettings?.links && navSettings.links.length > 0) {
    customMegaMenuCategories = [
      {
        title: navSettings.megaMenuTitle || "CMS Navigation",
        items: navSettings.links.map((l) => ({
          label: l.label,
          href: l.href,
          icon: l.icon || "🔗",
          badge: l.badge,
          description: l.description || "Database synchronized link",
        })),
      },
    ];
  }

  return (
    <main
      className="min-h-screen px-6 py-8"
      style={{ background: cfg.theme.surface, color: cfg.theme.text }}
    >
      <head>
        <link rel="alternate" hrefLang="en" href={`/${brandSlug}/${slug}?lang=en`} />
        <link rel="alternate" hrefLang="ta" href={`/${brandSlug}/${slug}?lang=ta`} />
        <link rel="alternate" hrefLang="ml" href={`/${brandSlug}/${slug}?lang=ml`} />
        <link rel="alternate" hrefLang="ja" href={`/${brandSlug}/${slug}?lang=ja`} />
        <link rel="alternate" hrefLang="x-default" href={`/${brandSlug}/${slug}`} />
      </head>

      <div className="mx-auto max-w-5xl space-y-8">
        <BrandHeader brand={cfg} currentLocale={lang} customMegaMenu={customMegaMenuCategories} />

        {/* Dynamic Page Header */}
        <header className="rounded-3xl bg-white/85 p-8 sm:p-12 shadow-sm border border-black/5 space-y-4">
          <span
            className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest text-white inline-block"
            style={{ background: cfg.theme.accent }}
          >
            {page.slug.replace(/_/g, " ")}
          </span>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight" style={{ color: cfg.theme.primary }}>
            {page.title}
          </h1>
          {page.body && (
            <p className="text-sm sm:text-base opacity-80 leading-relaxed whitespace-pre-line pt-2">
              {page.body}
            </p>
          )}
        </header>

        {/* Render Page CMS Sections */}
        {cmsSections.map((sec) => (
          <CmsSection key={sec.id} section={sec as never} brand={cfg} />
        ))}

        {/* CMS-Managed Footer */}
        <footer className="mt-16 border-t border-black/10 pt-8 text-center text-xs opacity-60">
          <p>{footerSettings?.copyright ?? `© ${new Date().getFullYear()} ${cfg.name}. All rights reserved.`}</p>
          <p className="mt-1">{footerSettings?.tagline ?? cfg.tagline}</p>
        </footer>
      </div>
    </main>
  );
}
