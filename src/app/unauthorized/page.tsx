export default function UnauthorizedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f2f4ed] px-5">
      <section className="max-w-md text-center">
        <p className="text-xs font-extrabold tracking-[0.16em] text-[#a4463a]">ACCESS DENIED</p>
        <h1 className="mt-2 font-serif text-4xl font-normal text-[#18231d]">This area is not in your role.</h1>
        <p className="mt-3 text-sm leading-6 text-[#657166]">Ask an institution administrator if you believe you should have access.</p>
        <a href="/" className="mt-6 inline-block rounded-xl bg-[#277a5c] px-4 py-3 text-sm font-extrabold text-white">Return to learning</a>
      </section>
    </main>
  );
}
