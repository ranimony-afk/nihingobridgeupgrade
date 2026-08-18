"use client";

import { useRouter } from "next/navigation";

export function RefundButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();

  async function refund() {
    await fetch("/api/v1/admin/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refund", invoiceId, reason: "admin portal" }),
    });
    router.refresh();
  }

  return (
    <button type="button" className="press bg-white px-3 py-1 text-xs text-black" onClick={refund}>
      Refund
    </button>
  );
}
