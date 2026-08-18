export const billingProviders = ["stripe", "razorpay"] as const;
export type BillingProvider = (typeof billingProviders)[number];

export const billingClients = ["web", "flutter"] as const;
export type BillingClient = (typeof billingClients)[number];

export const billingPlanKinds = ["subscription", "one_time"] as const;
export type BillingPlanKind = (typeof billingPlanKinds)[number];

export const activeBillingSubscriptionStatuses = new Set([
  "active",
  "trialing",
  "paid",
  "free",
]);

export type TaxInput = {
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  gstRateBps: number;
  supplierStateCode?: string | null;
  customerStateCode?: string | null;
};

export type TaxBreakdown = {
  subtotalMinor: number;
  discountMinor: number;
  taxableMinor: number;
  gstRateBps: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  gstMinor: number;
  totalMinor: number;
};

export type CheckoutQuote = TaxBreakdown & {
  planId: string;
  planCode: string;
  planName: string;
  planKind: BillingPlanKind;
  interval: string;
  currency: string;
  couponId: string | null;
  referralCodeId: string | null;
};
