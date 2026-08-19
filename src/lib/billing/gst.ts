export const GST_RATE = 0.18;
export const GSTIN = "33AAAAA0000A1Z1";

export type MoneyQuote = {
  currency: string;
  listPrice: number;
  discount: number;
  credit: number;
  net: number;
  base: number;
  tax: number;
  cgst: number;
  sgst: number;
  total: number;
};

export function inclusiveGst(net: number) {
  if (net <= 0) return { base: 0, tax: 0, cgst: 0, sgst: 0 };
  const base = Math.round(net / (1 + GST_RATE));
  const tax = net - base;
  const cgst = Math.floor(tax / 2);
  const sgst = tax - cgst;
  return { base, tax, cgst, sgst };
}

export function applyPercent(amount: number, percent: number) {
  return Math.round((amount * percent) / 100);
}

export function quotePrice(input: {
  currency: string;
  listPrice: number;
  percentOff?: number;
  amountOff?: number;
  credit?: number;
}): MoneyQuote {
  const discountFromPercent = input.percentOff ? applyPercent(input.listPrice, input.percentOff) : 0;
  const discount = Math.min(input.listPrice, discountFromPercent + (input.amountOff ?? 0));
  const afterCoupon = Math.max(0, input.listPrice - discount);
  const credit = Math.min(afterCoupon, Math.max(0, input.credit ?? 0));
  const net = Math.max(0, afterCoupon - credit);
  const gst = input.currency === "inr" ? inclusiveGst(net) : { base: net, tax: 0, cgst: 0, sgst: 0 };
  return {
    currency: input.currency,
    listPrice: input.listPrice,
    discount,
    credit,
    net,
    base: gst.base,
    tax: gst.tax,
    cgst: gst.cgst,
    sgst: gst.sgst,
    total: net,
  };
}

export function formatMoney(amount: number, currency: string) {
  const major = amount / 100;
  if (currency === "inr") return `₹${major.toFixed(2)}`;
  return `$${major.toFixed(2)}`;
}
