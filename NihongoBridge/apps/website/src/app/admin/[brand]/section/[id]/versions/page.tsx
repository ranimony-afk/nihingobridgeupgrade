import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrand } from "@/lib/brands";
import { ensureSeed } from "@/lib/seed";
import { CmsService } from "@/shared/services";
import { AdminShell } from "../../../../AdminShell";
import { listSectionVersions, restoreSectionVersion } from "../../../../actions";

export const dynamic = "force-dynamic";

export default async function SectionVersions({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string; id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await ensureSeed();
  const { brand: brandSlug, id } = await params;
  const { page = "home" } = await searchParams;
  const cfg = getBrand(brandSlug);
  if (!cfg) notFound();

  const sectionId = Number(id);
  if (!Number.isFinite(sectionId)) notFound();

  const section = await CmsService.getSectionById(sectionId);
  if (!section) notFound();

  const versions = await listSectionVersions(sectionId);

  return (
    <AdminShell title={`Version history — “${section.sectionKey}”`}>
      <Link
        href={`/admin/${brandSlug}?page=${encodeURIComponent(page)}`}
        className="text-xs font-semibold text-slate-600 hover:text-slate-900"
      >
        ← Back to editor
      </Link>

      <div className="mt-4 space-y-3">
        {versions.length === 0 && (
          <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
            No versions recorded yet. Edits and status transitions automatically create snapshots.
          </p>
        )}
        {versions.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 text-xs shadow-sm">
            <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono">#{v.id}</span>
            <span className={v.isAutosave ? "text-amber-700 font-semibold" : "font-semibold"}>
              {v.isAutosave ? "⚡ autosave" : "✎ manual"}
            </span>
            <span className="text-slate-600">{v.changeSummary ?? ""}</span>
            <span className="ml-auto text-slate-500">{v.createdAt.toISOString()}</span>
            <form action={restoreSectionVersion}>
              <input type="hidden" name="versionId" value={v.id} />
              <input type="hidden" name="brandSlug" value={brandSlug} />
              <input type="hidden" name="pageSlug" value={page} />
              <button type="submit" className="rounded-lg bg-sky-600 px-3 py-1.5 font-semibold text-white hover:bg-sky-500">
                ↺ Restore
              </button>
            </form>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
