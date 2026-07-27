import Link from "next/link";
import { ensureSeed } from "@/lib/seed";
import { BrandService, CmsService } from "@/shared/services";
import { listBrands } from "@/lib/brands";
import { AdminShell } from "./AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  await ensureSeed();
  const configs = listBrands();

  const summaries = await Promise.all(
    configs.map(async (cfg) => {
      const brand = await BrandService.getBySlug(cfg.slug);
      if (!brand) return { cfg, pages: [], sectionCount: 0, draftCount: 0 };
      const pages = await CmsService.listPages(brand.id);
      let sectionCount = 0;
      let draftCount = 0;
      for (const p of pages) {
        const secs = await CmsService.getAllSections(brand.id, p);
        sectionCount += secs.length;
        draftCount += secs.filter((s) => s.status !== "published").length;
      }
      return { cfg, pages, sectionCount, draftCount };
    }),
  );

  return (
    <AdminShell title="Brand Workspaces">
      <p className="text-sm text-slate-600">
        Every visible section on both brand websites is editable here — hero, featured courses,
        JLPT sections, daily vocabulary &amp; kanji, news, downloads, testimonials, navigation,
        footer, SEO metadata, social links, and contact information.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {summaries.map(({ cfg, pages, sectionCount, draftCount }) => (
          <div key={cfg.slug} className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500">{cfg.slug}</p>
                <h2 className="mt-1 text-xl font-semibold">{cfg.name}</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                {pages.length} pages
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-slate-50 p-2">
                <dt className="text-slate-500">Sections</dt>
                <dd className="text-lg font-bold">{sectionCount}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <dt className="text-slate-500">Unpublished</dt>
                <dd className="text-lg font-bold text-amber-700">{draftCount}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <dt className="text-slate-500">Pages</dt>
                <dd className="text-lg font-bold">{pages.join(", ") || "—"}</dd>
              </div>
            </dl>
            <Link
              href={`/admin/${cfg.slug}`}
              className="mt-4 inline-block rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Open CMS Editor →
            </Link>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
