import { DictionaryList } from "@/components/admin/DictionaryList";
import { GateCard } from "@/components/admin/GateCard";
import { getAdminCapabilities } from "@/lib/cms-admin/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dictionary Content — CMS Admin — NihongoBridge",
};

/**
 * GET /admin/dictionary — CMS dictionary list (server-gated).
 * The actor is resolved server-side; learners and anonymous visitors get
 * a gate card and no data fetch happens for them.
 */
export default async function AdminDictionaryPage() {
  const gate = await getAdminCapabilities();
  return (
    <main className="min-h-screen bg-slate-100/60 pb-20 pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {gate.ok ? (
          <DictionaryList capabilities={gate.capabilities} />
        ) : (
          <GateCard reason={gate.reason} role={gate.role} />
        )}
      </div>
    </main>
  );
}
