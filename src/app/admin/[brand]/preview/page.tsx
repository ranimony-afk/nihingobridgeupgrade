import { notFound } from "next/navigation";
import Link from "next/link";
import { getBrand } from "@/lib/brands";
import { BrandCmsPage } from "@/shared/components/BrandCmsPage";

export const dynamic = "force-dynamic";

export default async function AdminPreview({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { brand: brandSlug } = await params;
  const { page = "home" } = await searchParams;
  if (!getBrand(brandSlug)) notFound();

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center justify-between bg-slate-900 px-6 py-2 text-xs font-semibold text-white">
        <span>👁 CMS Preview — {brandSlug}/{page}</span>
        <Link href={`/admin/${brandSlug}?page=${encodeURIComponent(page)}`} className="rounded bg-white/10 px-3 py-1 hover:bg-white/20">
          ← Back to editor
        </Link>
      </div>
      <BrandCmsPage brandSlug={brandSlug} pageSlug={page} preview />
    </div>
  );
}
