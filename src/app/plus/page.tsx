import { getIdentity } from "@/lib/identity/request";

export const dynamic = "force-dynamic";

export default async function PlusPage() {
  const me = await getIdentity();
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#ffc800]">Plus</p>
      <h1 className="text-3xl font-black">Subscriber lounge</h1>
      <p className="mt-3 text-[#777]">
        Subscription-aware middleware let you in because plan is <strong>{me?.plan}</strong>. The free LMS path stays
        open to guests.
      </p>
    </main>
  );
}
