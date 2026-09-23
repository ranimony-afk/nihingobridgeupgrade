import { DictionaryEditor } from "@/components/admin/DictionaryEditor";
import { GateCard } from "@/components/admin/GateCard";
import { getAdminCapabilities } from "@/lib/cms-admin/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dictionary Editor — CMS Admin — NihongoBridge",
};

/**
 * GET /admin/dictionary/[id] — CMS dictionary editor (server-gated).
 * Same gate as the list: the item itself loads through the 13.5A API in
 * the client, which re-authorizes every call.
 */
export default async function AdminDictionaryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const gate = await getAdminCapabilities();
  return (
    <main className="min-h-screen bg-slate-100/60 pb-20 pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {gate.ok ? (
          <DictionaryEditor id={id} capabilities={gate.capabilities} />
        ) : (
          <GateCard reason={gate.reason} role={gate.role} />
        )}
      </div>
    </main>
  );
}
