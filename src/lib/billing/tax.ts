import type { TaxBreakdown, TaxInput } from "@/lib/billing/types";

function nonNegativeInteger(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export function calculateGst(input: TaxInput): TaxBreakdown {
  const subtotalMinor = nonNegativeInteger(input.subtotalMinor);
  const discountMinor = Math.min(subtotalMinor, nonNegativeInteger(input.discountMinor));
  const taxableMinor = subtotalMinor - discountMinor;
  const gstRateBps = input.currency.toUpperCase() === "INR" ? Math.max(0, input.gstRateBps) : 0;
  const gstMinor = Math.round((taxableMinor * gstRateBps) / 10_000);
  const sameState = Boolean(
    input.supplierStateCode &&
      input.customerStateCode &&
      input.supplierStateCode.toUpperCase() === input.customerStateCode.toUpperCase(),
  );

  const cgstMinor = sameState ? Math.floor(gstMinor / 2) : 0;
  const sgstMinor = sameState ? gstMinor - cgstMinor : 0;
  const igstMinor = sameState ? 0 : gstMinor;

  return {
    subtotalMinor,
    discountMinor,
    taxableMinor,
    gstRateBps,
    cgstMinor,
    sgstMinor,
    igstMinor,
    gstMinor,
    totalMinor: taxableMinor + gstMinor,
  };
}

export function formatMoney(amountMinor: number, currency: string, locale = "en-IN"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amountMinor / 100);
}
