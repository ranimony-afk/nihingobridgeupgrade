import Link from "next/link";

export const dynamic = "force-dynamic";

export default function BillingSuccessPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-4xl font-black text-[#58cc02]">You&apos;re in.</h1>
      <p className="mt-3 text-[#777]">Subscription is active. JWT plan updates on the next sign-in/refresh.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/plus" className="press bg-[#ffc800] px-4 py-2 text-[#3c3c3c]">
          Plus lounge
        </Link>
        <Link href="/premium" className="press bg-white px-4 py-2">
          Premium path
        </Link>
      </div>
    </main>
  );
}
