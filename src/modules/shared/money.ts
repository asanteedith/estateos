export type Currency = "GHS" | "USD";

const SYMBOL: Record<Currency, string> = { GHS: "GH₵", USD: "US$" };

export function formatMoney(amountMinor: number, currency: Currency): string {
  const major = amountMinor / 100;
  return `${SYMBOL[currency]}${major.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Parses "1,500.50" into 150050 minor units. Rejects negative or malformed input. */
export function parseMoneyToMinor(input: string): number {
  const cleaned = input.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new Error(`Invalid amount: ${input}`);
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
