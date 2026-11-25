import type { Currency } from "../shared/money";

/**
 * Founder-approved pricing policy for the EstateOS complete digital package.
 * Any proposal below list price needs founder approval (a price_exception approval).
 */
export const PRICING_POLICY = {
  ghana: { currency: "GHS" as Currency, listPriceMinor: 1_500_00, depositPercent: 50 },
  international: { currency: "USD" as Currency, listPriceMinor: 750_00, depositPercent: 50 },
} as const;

export type Market = keyof typeof PRICING_POLICY;

export function marketFor(country?: string | null): Market {
  if (!country) return "international";
  const c = country.trim().toLowerCase();
  return c === "gh" || c === "ghana" ? "ghana" : "international";
}

export function policyFor(market: Market) {
  return PRICING_POLICY[market];
}

export function depositAmount(amountMinor: number, depositPercent: number) {
  return Math.round((amountMinor * depositPercent) / 100);
}

/** True if the price and deposit are within policy (no approval needed). */
export function withinPolicy(market: Market, currency: Currency, amountMinor: number, depositPercent: number) {
  const p = PRICING_POLICY[market];
  return currency === p.currency && amountMinor >= p.listPriceMinor && depositPercent >= p.depositPercent;
}

/** What the core package includes. Only list what the platform can actually deliver today. */
export const PACKAGE_SCOPE = [
  "Agency workspace on EstateOS with owner login",
  "Property listings management (sale and rent)",
  "Public listings page for the agency with an enquiry form",
  "Enquiries inbox for leads captured from the listings page",
  "Onboarding: loading the agency's current listings and a walkthrough session",
].join("\n");
