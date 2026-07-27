import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { newsArticles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";
import { BrandHeader } from "@/shared/components/BrandHeader";
import { getBrand } from "@/lib/brands";
import { NewsReaderClient } from "./NewsReaderClient";

export const dynamic = "force-dynamic";

export default async function SingleNewsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await ensureSeed();
  const { slug } = await params;
  const cfg = getBrand("nihongo")!;

  const rows = await db.select().from(newsArticles).where(eq(newsArticles.slug, slug)).limit(1);
  if (rows.length === 0) notFound();
  const article = rows[0];

  return (
    <main
      className="min-h-screen px-6 py-12"
      style={{ background: cfg.theme.surface, color: cfg.theme.text }}
    >
      <div className="mx-auto max-w-4xl space-y-8">
        <BrandHeader brand={cfg} />

        <nav className="text-xs font-semibold">
          <Link href="/news" className="opacity-60 hover:opacity-100">
            ← Back to Japanese News Feed
          </Link>
        </nav>

        <NewsReaderClient article={article} />
      </div>
    </main>
  );
}
