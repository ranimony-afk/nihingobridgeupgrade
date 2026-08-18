export default function SubscriptionRequiredPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f2f4ed] px-5">
      <section className="max-w-md text-center">
        <p className="text-xs font-extrabold tracking-[0.16em] text-[#8e6b2e]">SUBSCRIPTION REQUIRED</p>
        <h1 className="mt-2 font-serif text-4xl font-normal text-[#18231d]">Your workspace needs an active plan.</h1>
        <p className="mt-3 text-sm leading-6 text-[#657166]">Learning remains available, but this organization&apos;s editorial workspace is currently unavailable. Contact your institution administrator to renew access.</p>
        <a href="/" className="mt-6 inline-block rounded-xl bg-[#277a5c] px-4 py-3 text-sm font-extrabold text-white">Return to learning</a>
      </section>
    </main>
  );
}
