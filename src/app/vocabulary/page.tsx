import Link from "next/link";
import { db } from "@/db";
import { nihongoLearningItems } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";
import { BrandHeader } from "@/shared/components/BrandHeader";
import { getBrand } from "@/lib/brands";
import { VocabularyClient } from "./VocabularyClient";

export const dynamic = "force-dynamic";

export default async function VocabularyPlatformPage() {
  await ensureSeed();
  const cfg = getBrand("nihongo")!;
  const items = await db
    .select()
    .from(nihongoLearningItems)
    .where(eq(nihongoLearningItems.category, "vocabulary"));

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
              Original Vocabulary Learning Platform 📖
            </h1>
            <p className="mt-1 text-sm opacity-80">
              Explore Japanese vocabulary with pitch accents, parts of speech, example sentences, audio pronunciation, favorites, bookmarks, and instant custom quiz generation.
            </p>
          </div>
        </div>

        <VocabularyClient initialItems={items as never} />
      </div>
    </main>
  );
}
