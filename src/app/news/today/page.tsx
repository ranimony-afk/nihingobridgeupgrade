import { redirect } from "next/navigation";
import { db } from "@/db";
import { newsArticles } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function TodayNewsPage() {
  await ensureSeed();
  const rows = await db
    .select({ slug: newsArticles.slug })
    .from(newsArticles)
    .where(eq(newsArticles.isToday, true))
    .limit(1);

  if (rows.length > 0) {
    redirect(`/news/${rows[0].slug}`);
  }

  const all = await db.select({ slug: newsArticles.slug }).from(newsArticles).orderBy(desc(newsArticles.publishedAt)).limit(1);
  if (all.length > 0) {
    redirect(`/news/${all[0].slug}`);
  }

  redirect("/news");
}
