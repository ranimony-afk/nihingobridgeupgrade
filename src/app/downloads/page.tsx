import Link from "next/link";
import { db } from "@/db";
import { downloadableResources } from "@/db/schema";
import { desc } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";
import { BrandHeader } from "@/shared/components/BrandHeader";
import { getBrand } from "@/lib/brands";
import { DownloadCenterClient } from "./DownloadCenterClient";

export const dynamic = "force-dynamic";

export default async function DownloadsPortalPage() {
  await ensureSeed();
  const cfg = getBrand("nihongo")!;
  const resources = await db.select().from(downloadableResources).orderBy(desc(downloadableResources.downloadCount));

  return (
    <main
      className="min-h-screen px-6 py-10"
      style={{ background: cfg.theme.surface, color: cfg.theme.text }}
    >
      <div className="mx-auto max-w-5xl space-y-8">
        <BrandHeader brand={cfg} />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: cfg.theme.primary }}>
              JapanVitta Download Center 📥
            </h1>
            <p className="mt-1 text-sm opacity-80">
              Printable PDF workbooks, stroke order sheets, vocabulary master lists, grammar cheat sheets, and native listening audio packs.
            </p>
          </div>
        </div>

        <DownloadCenterClient initialItems={resources as never} />
      </div>
    </main>
  );
}
