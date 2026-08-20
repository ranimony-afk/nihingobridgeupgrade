/**
 * Pure affiliate math. Kept free of database imports so it can be unit tested
 * directly and reused by any runtime.
 */

/**
 * Commission is taken on the **net** amount (after discount and tax), never on
 * the list price — otherwise a 100%-off coupon would still cost us a payout.
 */
export function commissionFor(netAmount: number, commissionPercent: number) {
  if (netAmount <= 0 || commissionPercent <= 0) return 0;
  return Math.round((netAmount * commissionPercent) / 100);
}

export function normalizeAffiliateCode(code: string) {
  return code.trim().toUpperCase();
}

/** Referrers should see that someone converted, not their full address. */
export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "hidden";
  const head = name.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export function clampPercent(value: number | undefined, fallback: number, max = 50) {
  return Math.min(Math.max(value ?? fallback, 0), max);
}
