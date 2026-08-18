import Link from "next/link";
import { redirect } from "next/navigation";
import { BillingCheckout } from "@/components/BillingCheckout";
import { billingSnapshot } from "@/lib/billing/service";
import { razorpayConfigured, stripeConfigured } from "@/lib/billing/providers";
import { formatMoney } from "@/lib/billing/gst";
import { getIdentity } from "@/lib/identity/request";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  await seedReady();
  const identity = await getIdentity();
  if (!identity) redirect("/login?from=/billing");
  const snap = await billingSnapshot(identity.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#ffc800]">Billing</p>
      <h1 className="text-3xl font-black">Billing portal</h1>
      <p className="mt-2 text-[#777]">
        Current plan <strong>{identity.plan}</strong>
        {snap.subscription ? ` · renews ${snap.subscription.currentPeriodEnd.toISOString().slice(0, 10)}` : ""}.
      </p>
      <div className="mt-6">
        <BillingCheckout
          plans={snap.plans}
          providers={{ stripe: stripeConfigured(), razorpay: razorpayConfigured(), sandbox: true }}
          referralCode={snap.profile.referralCode}
        />
      </div>
      <section className="card mt-6 p-5">
        <h2 className="text-xl font-black">Invoices</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {snap.invoices.map((invoice) => (
            <li key={invoice.id}>
              <Link href={`/billing/invoices/${invoice.id}`} className="font-black text-[#1cb0f6]">
                {invoice.number}
              </Link>{" "}
              · {formatMoney(invoice.total, invoice.currency)} · {invoice.status}
            </li>
          ))}
          {snap.invoices.length === 0 ? <li>No invoices yet.</li> : null}
        </ul>
      </section>
      <p className="mt-4 text-sm font-bold">
        <Link href="/premium" className="text-[#ce82ff]">
          Premium lessons
        </Link>
        {" · "}
        <Link href="/account">Account</Link>
      </p>
    </main>
  );
}
