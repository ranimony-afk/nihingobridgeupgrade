export const dynamic = "force-dynamic";

type BillingSuccessPageProps = { searchParams: Promise<{ checkout_id?: string }> };

export default async function BillingSuccessPage({ searchParams }: BillingSuccessPageProps) {
  const { checkout_id } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-[#f2f4ed] px-5">
      <section className="max-w-lg rounded-[1.5rem] border border-[#dce3d8] bg-[#fbfcf7] p-8 text-center shadow-[0_16px_40px_rgba(40,59,43,0.08)]">
        <p className="text-xs font-extrabold tracking-[0.16em] text-[#277a5c]">PAYMENT RECEIVED</p>
        <h1 className="mt-2 font-serif text-4xl font-normal text-[#18231d]">We&apos;re confirming your access.</h1>
        <p className="mt-3 text-sm leading-6 text-[#657166]">NihongoBridge activates premium access after the payment provider&apos;s signed webhook confirms the transaction. This usually takes only a few seconds.</p>
        {checkout_id && <p className="mt-4 break-all rounded-xl bg-[#edf0e9] px-3 py-2 text-xs text-[#657166]">Checkout reference: {checkout_id}</p>}
        <a href="/premium" className="mt-6 inline-block rounded-xl bg-[#277a5c] px-4 py-3 text-sm font-extrabold text-white">Check premium access</a>
        <a href="/account/billing" className="mt-4 block text-sm font-bold text-[#277a5c] underline">View billing history</a>
      </section>
    </main>
  );
}
