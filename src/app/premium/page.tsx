import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getSubscriptionAccess, getUserById } from "@/lib/auth/identity";

export const dynamic = "force-dynamic";

export default async function PremiumPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/sign-in?callbackUrl=/premium");
  const user = await getUserById(session.user.id);
  if (!user) redirect("/auth/sign-in?callbackUrl=/premium");

  const subscription = await getSubscriptionAccess(user.id);
  if (!subscription.active && user.role !== "super_admin") redirect("/pricing?locked=1");

  return (
    <main className="min-h-screen bg-[#f2f4ed] px-5 py-12">
      <section className="mx-auto max-w-3xl rounded-[1.5rem] border border-[#dce3d8] bg-[#fbfcf7] p-8 shadow-[0_16px_40px_rgba(40,59,43,0.08)]">
        <p className="text-xs font-extrabold tracking-[0.16em] text-[#277a5c]">PREMIUM LEARNING SPACE</p>
        <h1 className="mt-2 font-serif text-4xl font-normal text-[#18231d]">Focused fluency, unlocked.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#657166]">Your active {subscription.plan} entitlement gives you access to premium practice paths, detailed feedback, and advanced study resources. This server-rendered page and its companion API both enforce entitlement.</p>
        <dl className="mt-6 grid gap-4 rounded-xl bg-[#edf0e9] p-5 sm:grid-cols-3"><div><dt className="text-xs font-bold uppercase tracking-[.12em] text-[#748076]">Plan</dt><dd className="mt-1 font-serif text-xl capitalize">{subscription.plan}</dd></div><div><dt className="text-xs font-bold uppercase tracking-[.12em] text-[#748076]">Status</dt><dd className="mt-1 font-serif text-xl capitalize">{subscription.status}</dd></div><div><dt className="text-xs font-bold uppercase tracking-[.12em] text-[#748076]">Access</dt><dd className="mt-1 font-serif text-xl">Premium</dd></div></dl>
        <a href="/" className="mt-7 inline-block text-sm font-bold text-[#277a5c] underline">Return to your learning dashboard</a>
      </section>
    </main>
  );
}
