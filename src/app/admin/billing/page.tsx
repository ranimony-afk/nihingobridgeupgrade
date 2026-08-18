import { redirect } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { RefundButton } from "@/components/RefundButton";
import { getStaffSession } from "@/lib/audit/auth";
import { adminBilling } from "@/lib/billing/service";
import { formatMoney } from "@/lib/billing/gst";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function AdminBillingPage() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");
  const data = await adminBilling();

  return (
    <AdminShell staff={staff}>
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffc800]">CMS</p>
      <h1 className="text-4xl font-black">Billing</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 p-4">
          <h2 className="text-xl font-black">Subscriptions</h2>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            {data.subscriptions.map((row) => (
              <li key={row.id}>
                {row.status} · {row.provider} · {row.userId}
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-white/10 p-4">
          <h2 className="text-xl font-black">Coupons</h2>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            {data.coupons.map((row) => (
              <li key={row.id}>
                {row.code} · redeemed {row.redeemed}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="mt-6 rounded-2xl border border-white/10 p-4">
        <h2 className="text-xl font-black">Invoices</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {data.invoices.map((invoice) => (
            <li key={invoice.id} className="flex items-center justify-between gap-3">
              <span>
                {invoice.number} · {formatMoney(invoice.total, invoice.currency)} · {invoice.status}
              </span>
              {invoice.status === "paid" ? <RefundButton invoiceId={invoice.id} /> : null}
            </li>
          ))}
        </ul>
      </section>
    </AdminShell>
  );
}
