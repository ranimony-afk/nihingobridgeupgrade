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
  const { brand: brandSlug, slug } = await params;
  const { lang = "en" } = await searchParams;
  const cfg = getBrand(brandSlug);
  if (!cfg) notFound();

  try {
    await ensureSeed();
  } catch (err) {
    // Branded Diagnostic Error Screen (Phase 20 / Prompt 20 Hardening)
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-8">
        <div className="max-w-md w-full space-y-6 text-center">
          <span className="rounded-full bg-rose-500/20 text-rose-300 px-3 py-1 text-xs font-bold uppercase tracking-wider">
            🚨 Connection Outage
          </span>
          <h1 className="text-3xl font-black tracking-tight">Database Connectivity Outage</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            The platform could not establish a connection to your PostgreSQL database. This is usually caused by missing or incorrect environment credentials on Vercel.
          </p>
          <div className="rounded-2xl bg-slate-950 p-4 border border-white/10 text-left font-mono text-[11px] text-slate-400 space-y-1">
            <p className="text-rose-400 font-bold">Error: {(err as Error).message}</p>
            <p className="pt-2"><b>Troubleshooting steps:</b></p>
            <p>1. Go to Vercel Project Dashboard &rarr; Settings &rarr; Environment Variables.</p>
            <p>2. Ensure <b>DATABASE_URL</b> is set to your Supabase Transaction Pooler connection string.</p>
            <p>3. Redeploy the branch on Vercel.</p>
          </div>
          <Link
            href={`/${brandSlug}/${slug}`}
            className="inline-block rounded-xl bg-white text-slate-950 px-5 py-2.5 text-xs font-bold hover:bg-slate-100 transition"
          >
            🔄 Reload Page
          </Link>
        </div>
      </main>
    );
  }

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
