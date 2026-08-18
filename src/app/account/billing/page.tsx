import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BillingCenter } from "@/components/billing/billing-center";

export const dynamic = "force-dynamic";

export default async function AccountBillingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/sign-in?callbackUrl=/account/billing");

  return (
    <main className="min-h-screen bg-[#f2f4ed] px-5 py-10">
      <div className="mx-auto max-w-4xl"><a href="/" className="text-sm font-bold text-[#277a5c] underline">← Back to learning</a><div className="mb-7 mt-5"><p className="text-xs font-extrabold tracking-[.16em] text-[#277a5c]">BILLING & ENTITLEMENTS</p><h1 className="mt-1 font-serif text-4xl font-normal text-[#18231d]">Your learning investment</h1><p className="mt-2 text-sm text-[#657166]">Manage plans, invoices, tax details, referrals, and provider billing.</p></div><BillingCenter /></div>
    </main>
  );
}
