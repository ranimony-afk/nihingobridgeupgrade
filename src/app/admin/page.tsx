import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getSubscriptionAccess, getUserById, hasPermission } from "@/lib/auth/identity";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/sign-in?callbackUrl=/admin");

  const user = await getUserById(session.user.id);
  if (!user || !(await hasPermission(user.id, user.role, "cms:read"))) redirect("/unauthorized");

  const subscription = await getSubscriptionAccess(user.id);
  if (!subscription.active && user.role !== "super_admin") redirect("/account/subscription");

  return (
    <main className="min-h-screen bg-[#f2f4ed] px-5 py-10">
      <section className="mx-auto max-w-3xl rounded-[1.5rem] border border-[#dce3d8] bg-[#fbfcf7] p-8 shadow-[0_16px_40px_rgba(40,59,43,0.08)]">
        <p className="text-xs font-extrabold tracking-[0.16em] text-[#277a5c]">CMS ACCESS</p>
        <h1 className="mt-2 font-serif text-4xl font-normal text-[#18231d]">Editorial workspace</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#657166]">Your role and subscription are active for protected content operations. Existing CMS modules can use the `/api/v1/cms/auth/access` contract and `requirePermission()` guard before every mutation.</p>
        <dl className="mt-6 grid gap-4 rounded-xl bg-[#edf0e9] p-5 sm:grid-cols-3"><div><dt className="text-xs font-bold uppercase tracking-[.12em] text-[#748076]">Role</dt><dd className="mt-1 font-serif text-xl capitalize">{user.role.replace("_", " ")}</dd></div><div><dt className="text-xs font-bold uppercase tracking-[.12em] text-[#748076]">Plan</dt><dd className="mt-1 font-serif text-xl capitalize">{subscription.plan}</dd></div><div><dt className="text-xs font-bold uppercase tracking-[.12em] text-[#748076]">Status</dt><dd className="mt-1 font-serif text-xl capitalize">{subscription.status}</dd></div></dl>
        <a href="/" className="mt-7 inline-block text-sm font-bold text-[#277a5c] underline">Return to learning dashboard</a>
      </section>
    </main>
  );
}
