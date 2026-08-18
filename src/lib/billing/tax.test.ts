import { describe, expect, it } from "vitest";
import { calculateGst, formatMoney } from "@/lib/billing/tax";

describe("GST calculation", () => {
  it("splits intra-state GST into CGST and SGST after discounts", () => {
    const tax = calculateGst({
      currency: "INR",
      subtotalMinor: 10_000,
      discountMinor: 1_000,
      gstRateBps: 1_800,
      supplierStateCode: "KA",
      customerStateCode: "KA",
    });

    expect(tax.taxableMinor).toBe(9_000);
    expect(tax.gstMinor).toBe(1_620);
    expect(tax.cgstMinor + tax.sgstMinor).toBe(1_620);
    expect(tax.igstMinor).toBe(0);
    expect(tax.totalMinor).toBe(10_620);
  });

  it("uses IGST for inter-state transactions", () => {
    const tax = calculateGst({
      currency: "INR",
      subtotalMinor: 1_000,
      discountMinor: 0,
      gstRateBps: 1_800,
      supplierStateCode: "KA",
      customerStateCode: "MH",
    });

    expect(tax.cgstMinor).toBe(0);
    expect(tax.sgstMinor).toBe(0);
    expect(tax.igstMinor).toBe(180);
  });

  it("does not apply GST to non-INR plans", () => {
    const tax = calculateGst({
      currency: "USD",
      subtotalMinor: 1_500,
      discountMinor: 0,
      gstRateBps: 1_800,
    });

    expect(tax.gstMinor).toBe(0);
    expect(formatMoney(1_500, "USD", "en-US")).toBe("$15.00");
  });
});
