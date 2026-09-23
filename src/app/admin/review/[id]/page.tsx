import { GateCard } from "@/components/admin/GateCard";
import { ReviewDetail } from "@/components/cms-review/ReviewDetail";
import { getAdminCapabilities } from "@/lib/cms-admin/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Review Item — CMS Admin — NihongoBridge",
};

/**
 * GET /admin/review/[id] — generic review detail (server-gated).
 * Same gate as the queue: direct URL access without CMS access stays
 * blocked. The item loads through the slice APIs in the client, which
 * re-authorize every call.
 */
export default async function AdminReviewItemPage({
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
          <ReviewDetail id={id} capabilities={gate.capabilities} />
        ) : (
          <GateCard reason={gate.reason} role={gate.role} />
        )}
      </div>
    </main>
  );
}
