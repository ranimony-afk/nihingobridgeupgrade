import { redirect } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { AffiliateDesk } from "@/components/AffiliateDesk";
import { getStaffSession } from "@/lib/audit/auth";
import { listAffiliates } from "@/lib/billing/affiliate";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function AdminAffiliatesPage() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");
  const affiliates = await listAffiliates();

  return (
    <AdminShell staff={staff}>
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffc800]">CMS</p>
      <h1 className="text-4xl font-black">Affiliates</h1>
      <p className="mt-2 text-white/70">
        Commission accrues on the net amount after discount and tax, and reverses automatically on refund.
      </p>
      <AffiliateDesk affiliates={affiliates} />
    </AdminShell>
  );
}
