import { GateCard } from "@/components/admin/GateCard";
import { ReviewQueue } from "@/components/cms-review/ReviewQueue";
import { getAdminCapabilities } from "@/lib/cms-admin/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Review Workspace — CMS Admin — NihongoBridge",
};

/**
 * GET /admin/review — unified CMS review queue (server-gated).
 * The actor is resolved server-side; learners and anonymous visitors get
 * a gate card and no data fetch happens for them.
 */
export default async function AdminReviewPage() {
  const gate = await getAdminCapabilities();
  return (
    <main className="min-h-screen bg-slate-100/60 pb-20 pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {gate.ok ? (
          <ReviewQueue capabilities={gate.capabilities} />
        ) : (
          <GateCard reason={gate.reason} role={gate.role} />
        )}
      </div>
    </main>
  );
}
