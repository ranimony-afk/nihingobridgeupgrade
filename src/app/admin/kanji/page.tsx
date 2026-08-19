import { redirect } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { KanjiEnrichButton } from "@/components/KanjiEnrichButton";
import { getStaffSession } from "@/lib/audit/auth";
import { explorerTree } from "@/lib/kanji/enrich";
import { listKanji } from "@/lib/kg/search";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function AdminKanjiPage() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");
  const [kanji, tree] = await Promise.all([listKanji(), explorerTree()]);
  return (
    <AdminShell staff={staff}>
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#86efac]">CMS</p>
      <h1 className="text-4xl font-black">Kanji explorer</h1>
      <p className="mt-2 text-white/70">
        {kanji.length} characters · {tree.children?.length ?? 0} semantic branches.
      </p>
      <KanjiEnrichButton />
      <ul className="mt-4 columns-2 text-sm text-white/80">
        {kanji.map((item) => (
          <li key={item.id}>
            {item.character} · {item.jlpt} · #{item.freq}
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
