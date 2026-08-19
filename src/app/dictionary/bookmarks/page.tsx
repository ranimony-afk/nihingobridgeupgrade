import Link from "next/link";
import { redirect } from "next/navigation";
import { listBookmarks } from "@/lib/dict/enrich";
import { getLearnerId } from "@/lib/learner";

export const dynamic = "force-dynamic";

export default async function BookmarksPage() {
  const learnerId = await getLearnerId();
  if (!learnerId) redirect("/onboarding");
  const rows = await listBookmarks(learnerId);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/dictionary" className="text-sm font-bold text-[#1cb0f6]">
        ← Dictionary
      </Link>
      <h1 className="mt-2 text-3xl font-black">Bookmarks</h1>
      <ul className="mt-4 grid gap-2">
        {rows.map((row) => (
          <li key={row.id} className="card p-3">
            <Link
              href={row.targetType === "kanji" ? `/kanji/${row.targetId.replace("kj-", "")}` : `/dictionary/${row.targetId}`}
              className="font-black"
            >
              {row.targetType} · {row.targetId}
            </Link>
          </li>
        ))}
        {rows.length === 0 ? <li>No bookmarks yet.</li> : null}
      </ul>
    </main>
  );
}
