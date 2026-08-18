import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getSubscriptionAccess, getUserById, hasPermission } from "@/lib/auth/identity";
import { BillingAdminConsole } from "@/components/billing/billing-admin-console";

export const dynamic = "force-dynamic";

export default async function BillingAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/sign-in?callbackUrl=/admin/billing");
  const user = await getUserById(session.user.id);
  if (!user || !(await hasPermission(user.id, user.role, "subscriptions:manage"))) redirect("/unauthorized");

  const subscription = await getSubscriptionAccess(user.id);
  if (!subscription.active && user.role !== "super_admin") redirect("/account/subscription");

  return (
    <main className="min-h-screen bg-[#f2f4ed] px-5 py-10"><div className="mx-auto max-w-6xl"><a href="/admin" className="text-sm font-bold text-[#277a5c] underline">← CMS workspace</a><div className="mb-7 mt-5"><p className="text-xs font-extrabold tracking-[.16em] text-[#277a5c]">MONETIZATION OPERATIONS</p><h1 className="mt-1 font-serif text-4xl font-normal text-[#18231d]">Billing administration</h1><p className="mt-2 text-sm text-[#657166]">Manage server-priced plans, campaigns, provider settlement, refunds, and invoice state.</p></div><BillingAdminConsole /></div></main>
  );
}
