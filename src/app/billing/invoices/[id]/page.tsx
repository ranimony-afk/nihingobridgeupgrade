import { notFound, redirect } from "next/navigation";
import { getInvoice } from "@/lib/billing/service";
import { formatMoney, GSTIN } from "@/lib/billing/gst";
import { getIdentity } from "@/lib/identity/request";
import { getStaffSession } from "@/lib/audit/auth";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getInvoice(id);
  if (!bundle) notFound();
  const identity = await getIdentity();
  const staff = await getStaffSession();
  if (!staff && identity?.id !== bundle.invoice.userId) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl bg-white px-6 py-10 text-[#111]">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em]">Tax invoice</p>
      <h1 className="text-3xl font-black">{bundle.invoice.number}</h1>
      <p className="mt-2">{bundle.user?.name} · {bundle.user?.email}</p>
      {bundle.invoice.gstin ? <p className="text-sm">GSTIN {GSTIN}</p> : null}
      <table className="mt-6 w-full text-sm">
        <tbody>
          {bundle.lines.map((line) => (
            <tr key={line.id}>
              <td className="py-2">{line.description}</td>
              <td className="py-2 text-right">{formatMoney(line.amount, bundle.invoice.currency)}</td>
            </tr>
          ))}
          <tr>
            <td className="py-2">Taxable value</td>
            <td className="py-2 text-right">{formatMoney(bundle.invoice.subtotal, bundle.invoice.currency)}</td>
          </tr>
          {bundle.invoice.currency === "inr" ? (
            <>
              <tr>
                <td className="py-2">CGST 9%</td>
                <td className="py-2 text-right">{formatMoney(bundle.invoice.cgst, "inr")}</td>
              </tr>
              <tr>
                <td className="py-2">SGST 9%</td>
                <td className="py-2 text-right">{formatMoney(bundle.invoice.sgst, "inr")}</td>
              </tr>
            </>
          ) : null}
          <tr className="font-black">
            <td className="py-2">Total</td>
            <td className="py-2 text-right">{formatMoney(bundle.invoice.total, bundle.invoice.currency)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-6 text-xs text-[#777]">Status: {bundle.invoice.status}</p>
    </main>
  );
}
